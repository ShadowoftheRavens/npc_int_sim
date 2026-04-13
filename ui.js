// ui.js — DOM rendering (Phase 3: Edit/Delete on custom NPC cards)

import { applyAction } from "./npcEngine.js";
import { saveState }   from "./storage.js";

// ── Avatar ────────────────────────────────────────────────────────────────────
const DEFAULT_AVATAR = "👤";
const UI_STATE_KEY = "npc_ui_state_v1";
let _filterInputDebounce = null;
let _lastFilteredIdsKey = "";
let _lastRenderedPageKey = "";
let _lastFactionOptionsKey = "";
let _filteredNPCs = [];
let _currentPage = 1;
let _pageSize = 24;
let _uiStateHydrated = false;
const PAGE_SIZE_OPTIONS = [24, 48, 96];

const perfStats = {
  actionMs: [],
  renderMs: []
};

function loadUIState() {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function saveUIState(nextState) {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(nextState));
  } catch (_) {}
}

function persistUIState() {
  const searchInput = document.getElementById("npc-search");
  const factionSelect = document.getElementById("npc-faction-filter");
  const includeDeadInput = document.getElementById("npc-include-dead");

  saveUIState({
    searchTerm: String(searchInput?.value ?? ""),
    factionId: String(factionSelect?.value ?? ""),
    includeDead: Boolean(includeDeadInput?.checked),
    pageSize: _pageSize,
    currentPage: _currentPage
  });
}

function renderPerfSparkline(values, bars = 24) {
  const points = Array.isArray(values) ? values.slice(-bars) : [];
  if (points.length === 0) return '<span class="perf-spark-empty">No samples</span>';

  const max = Math.max(1, ...points);
  return points
    .map(value => {
      const pct = Math.max(8, Math.min(100, Math.round((value / max) * 100)));
      return `<span class="perf-spark-bar" style="height:${pct}%"></span>`;
    })
    .join("");
}

// ── Faction name ──────────────────────────────────────────────────────────────
function factionName(state, id) {
  const byId = state?._factionById;
  if (byId instanceof Map) {
    return byId.get(id)?.name ?? (id || "Unknown");
  }
  return state.factions.find(f => f.id === id)?.name ?? (id || "Unknown");
}

// ── Is custom NPC? ────────────────────────────────────────────────────────────
function isCustom(state, npcId) {
  const customIds = state?._customNpcIdSet;
  if (customIds instanceof Set) {
    return customIds.has(npcId);
  }
  return (state.customNPCs ?? []).some(n => n.id === npcId);
}

function findNpcById(state, npcId) {
  const byId = state?._npcById;
  if (byId instanceof Map) return byId.get(npcId) ?? null;
  return (state?.npcs ?? []).find(n => n.id === npcId) ?? null;
}

function calcBarWidth(stat, value) {
  const n = Number(value ?? 0);
  if (stat === "trust") {
    return Math.max(0, Math.min(100, Math.round(((n + 100) / 200) * 100)));
  }
  return Math.max(0, Math.min(100, n));
}

function updateCardFromState(state, npcId) {
  const card = document.querySelector(`[data-npc-id="${npcId}"]`);
  if (!card) return;

  const npc = findNpcById(state, npcId);
  if (!npc) {
    card.remove();
    return;
  }

  const mood = npc.state?.mood ?? "neutral";
  const moodEl = card.querySelector(".npc-mood-badge");
  if (moodEl) {
    moodEl.className = `npc-mood-badge mood-${mood}`;
    moodEl.textContent = mood;
  }

  const dead = Boolean(npc.dead);
  card.classList.toggle("npc-card-dead", dead);
  const deadInput = card.querySelector(".npc-dead-input");
  if (deadInput) deadInput.checked = dead;

  const actionButtons = card.querySelectorAll(".action-btn");
  actionButtons.forEach(btn => {
    btn.disabled = dead;
  });

  for (const stat of state.system.stats ?? []) {
    const statItem = card.querySelector(`[data-stat="${stat}"]`);
    if (!statItem) continue;

    const val = npc.stats?.[stat] ?? 0;
    const bar = statItem.querySelector(".stat-bar");
    const valEl = statItem.querySelector(".stat-val");

    if (bar) bar.style.width = `${calcBarWidth(stat, val)}%`;
    if (valEl) valEl.textContent = String(val);
  }

  const historyRoot = card.querySelector(".npc-history");
  if (historyRoot) {
    historyRoot.innerHTML = renderHistoryHtml(state, npc);
  }
}

function renderHistoryHtml(state, npc, maxItems = 5) {
  const entries = Array.isArray(npc?.memory) ? npc.memory.slice(-maxItems).reverse() : [];
  if (entries.length === 0) {
    return `
      <div class="npc-history-title">Action History</div>
      <p class="npc-history-empty">No tracked actions yet.</p>
    `;
  }

  const items = entries.map(entry => {
    const actionId = String(entry?.actionId ?? "action");
    const text = String(entry?.outcome ?? "No outcome text");
    const deltas = Object.entries(entry?.statDeltas ?? {})
      .filter(([, value]) => Number(value) !== 0)
      .map(([stat, value]) => {
        const n = Number(value);
        const sign = n > 0 ? "+" : "";
        const tone = n > 0 ? "pos" : "neg";
        return `<span class="npc-history-delta ${tone}">${stat} ${sign}${n}</span>`;
      })
      .join(" ");

    const deltasHtml = deltas
      ? `<div class="npc-history-deltas">${deltas}</div>`
      : `<div class="npc-history-deltas npc-history-deltas-empty">No stat changes</div>`;

    const notes = [];
    if (entry?.sourceKind === "spillover" && entry?.sourceNpcName) {
      notes.push(`<span class="npc-history-note">from ${String(entry.sourceNpcName)}</span>`);
    }

    if (Array.isArray(entry?.factionChanges) && entry.factionChanges.length > 0) {
      const factionBits = entry.factionChanges
        .map(change => {
          const id = String(change?.factionId ?? "faction");
          const label = factionName(state, id);
          const n = Number(change?.delta ?? 0);
          const sign = n > 0 ? "+" : "";
          return `${label} ${sign}${n}`;
        })
        .join(" · ");
      notes.push(`<span class="npc-history-note">faction: ${factionBits}</span>`);
    }

    if (Array.isArray(entry?.affectedNpcs) && entry.affectedNpcs.length > 0) {
      const affectedBits = entry.affectedNpcs
        .map(item => String(item?.name ?? item?.id ?? "NPC"))
        .join(", ");
      notes.push(`<span class="npc-history-note">affected: ${affectedBits}</span>`);
    }

    const notesHtml = notes.length
      ? `<div class="npc-history-notes">${notes.join("")}</div>`
      : "";

    return `<li class="npc-history-item"><div><span class="npc-history-action">${actionId}</span>${text}</div>${notesHtml}${deltasHtml}</li>`;
  }).join("");

  return `
    <div class="npc-history-title">Action History</div>
    <ul class="npc-history-list">${items}</ul>
  `;
}

function pushPerfSample(bucket, value, max = 50) {
  if (!Number.isFinite(value)) return;
  bucket.push(value);
  if (bucket.length > max) bucket.shift();
}

function avgPerf(bucket) {
  if (!bucket.length) return 0;
  return bucket.reduce((sum, n) => sum + n, 0) / bucket.length;
}

function updatePerfPanel(state) {
  const root = document.getElementById("perf-metrics");
  if (!root) return;

  const fileQueue = Number(window.__getFileQueueLength?.() ?? 0);
  const storageQueue = Number(window.__getStorageQueueLength?.() ?? 0);
  const queueLen = Number(window.__getPersistenceQueueLength?.() ?? (fileQueue + storageQueue));
  const actionAvg = avgPerf(perfStats.actionMs).toFixed(1);
  const renderAvg = avgPerf(perfStats.renderMs).toFixed(1);
  const total = Array.isArray(state?.npcs) ? state.npcs.length : 0;

  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
    <div class="perf-row"><span>Avg Action</span><strong>${actionAvg} ms</strong></div>
    <div class="perf-row"><span>Avg Render</span><strong>${renderAvg} ms</strong></div>
    <div class="perf-row"><span>File Queue</span><strong>${fileQueue}</strong></div>
    <div class="perf-row"><span>Storage Queue</span><strong>${storageQueue}</strong></div>
    <div class="perf-row"><span>Total Queue</span><strong>${queueLen}</strong></div>
    <div class="perf-row"><span>NPC Count</span><strong>${total}</strong></div>
    <div class="perf-mini">
      <span>Action Trend</span>
      <div class="perf-spark">${renderPerfSparkline(perfStats.actionMs)}</div>
    </div>
    <div class="perf-mini">
      <span>Render Trend</span>
      <div class="perf-spark">${renderPerfSparkline(perfStats.renderMs)}</div>
    </div>
  `;
}

function ensurePaginationControls(state) {
  const wrap = document.getElementById("npc-pagination");
  if (!wrap) return;
  if (wrap.dataset.ready === "1") return;

  wrap.innerHTML = `
    <button id="npc-page-prev" class="npc-page-btn" type="button" aria-label="Previous NPC page">Prev</button>
    <span id="npc-page-info" class="npc-page-info" aria-live="polite"></span>
    <button id="npc-page-next" class="npc-page-btn" type="button" aria-label="Next NPC page">Next</button>
    <select id="npc-page-size" class="npc-page-size" aria-label="NPC page size"></select>
  `;

  const sizeSelect = document.getElementById("npc-page-size");
  if (sizeSelect) {
    sizeSelect.innerHTML = PAGE_SIZE_OPTIONS
      .map(size => `<option value="${size}"${size === _pageSize ? " selected" : ""}>${size}/page</option>`)
      .join("");
    sizeSelect.addEventListener("change", () => {
      _pageSize = Math.max(1, Number(sizeSelect.value) || 24);
      _currentPage = 1;
      persistUIState();
      renderFilteredNPCs(state, _filteredNPCs, true);
    });
  }

  document.getElementById("npc-page-prev")?.addEventListener("click", () => {
    _currentPage = Math.max(1, _currentPage - 1);
    persistUIState();
    renderFilteredNPCs(state, _filteredNPCs, true);
  });

  document.getElementById("npc-page-next")?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(_filteredNPCs.length / _pageSize));
    _currentPage = Math.min(totalPages, _currentPage + 1);
    persistUIState();
    renderFilteredNPCs(state, _filteredNPCs, true);
  });

  wrap.dataset.ready = "1";
}

function updatePaginationUI(totalItems) {
  const wrap = document.getElementById("npc-pagination");
  if (!wrap) return;

  const totalPages = Math.max(1, Math.ceil(totalItems / _pageSize));
  _currentPage = Math.min(_currentPage, totalPages);
  if (_currentPage < 1) _currentPage = 1;

  const info = document.getElementById("npc-page-info");
  const prev = document.getElementById("npc-page-prev");
  const next = document.getElementById("npc-page-next");

  if (info) info.textContent = `Page ${_currentPage}/${totalPages} · ${totalItems} total`;
  if (prev) prev.disabled = _currentPage <= 1;
  if (next) next.disabled = _currentPage >= totalPages;
}

// ── Delta popup ───────────────────────────────────────────────────────────────
function spawnDelta(el, text, positive) {
  const span = document.createElement("span");
  span.className = `delta-popup ${positive ? "positive" : "negative"}`;
  span.textContent = text;
  const r = el.getBoundingClientRect();
  span.style.cssText = `position:absolute;left:${r.left + r.width/2}px;top:${r.top + scrollY - 4}px`;
  document.body.appendChild(span);
  span.addEventListener("animationend", () => span.remove(), { once: true });
}

// ── Card flash ────────────────────────────────────────────────────────────────
function flashCard(card, tone) {
  const cls = tone === "positive" ? "flash-positive" : "flash-negative";
  card.classList.remove("flash-positive","flash-negative");
  void card.offsetWidth;
  card.classList.add(cls);
  card.addEventListener("animationend", () => card.classList.remove(cls), { once: true });
}

// ── Action handler ────────────────────────────────────────────────────────────
async function handleAction(state, npcId, actionId, card) {
  const actionStart = performance.now();
  const actionButtons = card.querySelectorAll(".action-btn");
  actionButtons.forEach(b => b.disabled = true);

  try {
    window.__pushUndoSnapshot?.(state);
    const result = applyAction(state, npcId, actionId);
    saveState(state);

    // Queue persistence without blocking UI updates.
    Promise.allSettled([
      window.__persistFactions?.(),
      window.__persistNPCSnapshot?.()
    ]).catch(() => {});

    for (const changedNpcId of (result.changedNpcIds ?? [npcId])) {
      updateCardFromState(state, changedNpcId);
    }
    renderReputation(state);

    const updated = document.querySelector(`[data-npc-id="${npcId}"]`);
    if (updated) flashCard(updated, result.outcome.tone);

    for (const [stat, delta] of Object.entries(result.statDeltas)) {
      if (!delta) continue;
      const el = updated?.querySelector(`[data-stat="${stat}"]`);
      if (el) spawnDelta(el, (delta > 0 ? "+" : "") + delta + " " + stat, delta > 0);
    }
  } catch (e) {
    console.warn("[ui] action failed", e);
    const body = card.querySelector(".npc-card-body");
    if (body && !body.querySelector(".npc-action-error")) {
      const msg = document.createElement("p");
      msg.className = "npc-action-error";
      msg.textContent = "Action failed. Please retry.";
      body.prepend(msg);
    }
  } finally {
    pushPerfSample(perfStats.actionMs, performance.now() - actionStart);
    updatePerfPanel(state);
    updateCardFromState(state, npcId);
  }
}

// ── Build NPC card ────────────────────────────────────────────────────────────
function buildCard(state, npc) {
  const card  = document.createElement("div");
  card.className  = "npc-card";
  card.dataset.npcId = npc.id;

  const mood   = npc.state?.mood ?? "neutral";
  const custom = isCustom(state, npc.id);
  const isDead = Boolean(npc.dead);

  if (isDead) {
    card.classList.add("npc-card-dead");
  }

  // ── Header
  const hdr = document.createElement("div");
  hdr.className = "npc-card-header";
  hdr.innerHTML = `
    <div class="npc-avatar">${DEFAULT_AVATAR}</div>
    <div class="npc-identity">
      <div class="npc-name">
        ${npc.name}
        ${custom ? '<span class="npc-custom-badge">custom</span>' : ""}
      </div>
      <div class="npc-meta">${npc.role} · ${factionName(state, npc.factionId)}</div>
    </div>
    <div class="npc-header-right">
      <label class="npc-dead-toggle" title="Mark NPC as dead">
        <input type="checkbox" class="npc-dead-input" ${isDead ? "checked" : ""}>
        <span>Dead</span>
      </label>
      <span class="npc-mood-badge mood-${mood}">${mood}</span>
      <button class="npc-card-btn npc-history-btn" title="History" aria-expanded="false">🕘</button>
      <button class="npc-card-btn npc-notes-btn" title="Notes">📝</button>
      ${`
        <button class="npc-card-btn npc-edit-btn"   title="Edit">✎</button>
      `}
      <button class="npc-card-btn npc-delete-btn" title="Delete">✕</button>
    </div>`;

  // ── Body
  const body = document.createElement("div");
  body.className = "npc-card-body";

  // Stats grid
  const grid = document.createElement("div");
  grid.className = "stats-grid";
  for (const stat of state.system.stats) {
    const v = npc.stats?.[stat] ?? 0;
    const barWidth = stat === "trust"
      ? Math.max(0, Math.min(100, Math.round(((Number(v) + 100) / 200) * 100)))
      : Math.max(0, Math.min(100, Number(v)));
    const d = document.createElement("div");
    d.className = "stat-item";
    d.dataset.stat = stat;
    d.innerHTML = `
      <span class="stat-label">${stat}</span>
      <div class="stat-bar-wrap"><div class="stat-bar stat-${stat}" style="width:${barWidth}%"></div></div>
      <span class="stat-val">${v}</span>`;
    grid.appendChild(d);
  }

  // Traits
  const traits = document.createElement("div");
  traits.className = "npc-traits";
  for (const t of (npc.traits ?? [])) {
    const tag = document.createElement("span");
    tag.className = "trait-tag";
    tag.textContent = t;
    traits.appendChild(tag);
  }

  // Action buttons
  const actions = document.createElement("div");
  actions.className = "npc-actions";
  for (const action of state.system.actions) {
    const btn = document.createElement("button");
    btn.className = `action-btn action-${action.id}`;
    btn.textContent = action.label;
    btn.setAttribute("aria-label", `${action.label} (${npc.name})`);
    btn.disabled = isDead;
    btn.addEventListener("click", () => handleAction(state, npc.id, action.id, card));
    actions.appendChild(btn);
  }

  const history = document.createElement("div");
  history.className = "npc-history npc-history-collapsed";
  history.innerHTML = renderHistoryHtml(state, npc);

  body.append(grid, traits, actions, history);
  card.append(hdr, body);

  card.querySelector(".npc-notes-btn")?.setAttribute("aria-label", `Open notes for ${npc.name}`);
  card.querySelector(".npc-edit-btn")?.setAttribute("aria-label", `Edit ${npc.name}`);
  card.querySelector(".npc-delete-btn")?.setAttribute("aria-label", `Delete ${npc.name}`);
  card.querySelector(".npc-dead-input")?.setAttribute("aria-label", `Mark ${npc.name} as dead`);
  card.querySelector(".npc-history-btn")?.setAttribute("aria-label", `Toggle action history for ${npc.name}`);

  // ── Wire edit / delete
  card.querySelector(".npc-notes-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    window.__openNotesModal?.(npc.id);
  });

  card.querySelector(".npc-edit-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    window.__openEditModal?.(npc);
  });

  card.querySelector(".npc-delete-btn")?.addEventListener("click", async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${npc.name}"? This cannot be undone.`)) return;
    await window.__handleNPCDelete?.(npc.id);
  });

  card.querySelector(".npc-dead-input")?.addEventListener("change", async e => {
    e.stopPropagation();
    npc.dead = Boolean(e.target.checked);
    saveState(state);
    await window.__persistNPCSnapshot?.();
    updateCardFromState(state, npc.id);
  });

  card.querySelector(".npc-history-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    const historyEl = card.querySelector(".npc-history");
    if (!historyEl) return;
    const willOpen = historyEl.classList.contains("npc-history-collapsed");
    historyEl.classList.toggle("npc-history-collapsed", !willOpen);
    e.currentTarget?.setAttribute("aria-expanded", willOpen ? "true" : "false");
  });

  return card;
}

// ── Populate faction filter dropdown ──────────────────────────────────────────
function populateFactionFilter(state) {
  const select = document.getElementById("npc-faction-filter");
  if (!select) return;

  // Get all factions from state.factions
  const factions = (state.factions ?? [])
    .map(f => ({
      id: f.id,
      name: f.name
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const nextOptionsKey = factions.map(f => `${f.id}:${f.name}`).join("|");
  if (nextOptionsKey === _lastFactionOptionsKey) {
    return;
  }
  _lastFactionOptionsKey = nextOptionsKey;

  // Keep "All Factions" option and add faction options
  const currentValue = select.value;
  select.innerHTML = '<option value="">All Factions</option>';
  
  for (const faction of factions) {
    const opt = document.createElement("option");
    opt.value = faction.id;
    opt.textContent = faction.name;
    select.appendChild(opt);
  }

  // Restore previous selection if it still exists
  if (currentValue && factions.some(f => f.id === currentValue)) {
    select.value = currentValue;
  }
}

// ── Wire search and filter ────────────────────────────────────────────────────
function wireSearchAndFilter(state) {
  populateFactionFilter(state);

  const searchInput = document.getElementById("npc-search");
  const factionSelect = document.getElementById("npc-faction-filter");
  const includeDeadInput = document.getElementById("npc-include-dead");

  if (!_uiStateHydrated) {
    const saved = loadUIState();
    if (saved) {
      _pageSize = PAGE_SIZE_OPTIONS.includes(Number(saved.pageSize)) ? Number(saved.pageSize) : _pageSize;
      _currentPage = Math.max(1, Number(saved.currentPage) || 1);
      if (searchInput) searchInput.value = String(saved.searchTerm ?? "");
      if (factionSelect) factionSelect.value = String(saved.factionId ?? "");
      if (includeDeadInput) includeDeadInput.checked = saved.includeDead !== false;
    }
    _uiStateHydrated = true;
  }

  ensurePaginationControls(state);
  const sizeSelect = document.getElementById("npc-page-size");
  if (sizeSelect) sizeSelect.value = String(_pageSize);

  const triggerFilter = () => {
    clearTimeout(_filterInputDebounce);
    _filterInputDebounce = setTimeout(() => {
      persistUIState();
      applyFilters(state);
    }, 80);
  };

  if (searchInput) {
    searchInput.oninput = triggerFilter;
  }

  if (factionSelect) {
    factionSelect.onchange = triggerFilter;
  }

  if (includeDeadInput) {
    includeDeadInput.onchange = triggerFilter;
  }

  applyFilters(state);
}

function applyFilters(state) {
  const searchInput = document.getElementById("npc-search");
  const factionSelect = document.getElementById("npc-faction-filter");
  const includeDeadInput = document.getElementById("npc-include-dead");
  
  const searchTerm = (searchInput?.value ?? "").toLowerCase().trim();
  const selectedFactionId = factionSelect?.value ?? "";
  const includeDead = Boolean(includeDeadInput?.checked);

  const filtered = (state.npcs ?? []).filter(npc => {
    if (!includeDead && npc.dead) {
      return false;
    }

    // Filter by search term
    if (searchTerm && !npc.name.toLowerCase().includes(searchTerm)) {
      return false;
    }

    // Filter by faction
    if (selectedFactionId && npc.factionId !== selectedFactionId) {
      return false;
    }

    return true;
  });

  const nextIdsKey = filtered.map(npc => npc.id).join("|");
  if (nextIdsKey !== _lastFilteredIdsKey) {
    _currentPage = 1;
    _lastFilteredIdsKey = nextIdsKey;
  }

  _filteredNPCs = filtered;
  persistUIState();

  renderFilteredNPCs(state, filtered, true);
}

function renderFilteredNPCs(state, npcs, force = false) {
  const c = document.getElementById("npc-list");
  if (!c) return;

  const safeList = Array.isArray(npcs) ? npcs : [];
  const totalPages = Math.max(1, Math.ceil(safeList.length / _pageSize));
  _currentPage = Math.min(Math.max(1, _currentPage), totalPages);
  const start = (_currentPage - 1) * _pageSize;
  const visibleNPCs = safeList.slice(start, start + _pageSize);

  const pageKey = `${_lastFilteredIdsKey}|p:${_currentPage}|s:${_pageSize}`;
  if (!force && pageKey === _lastRenderedPageKey) return;
  _lastRenderedPageKey = pageKey;

  c.innerHTML = "";

  if (safeList.length === 0) {
    updatePaginationUI(0);
    c.innerHTML = `
      <div class="log-empty npc-empty-state">
        <p>No NPCs match your current filters.</p>
        <button id="npc-clear-filters" class="npc-empty-btn" type="button">Clear Filters</button>
      </div>
    `;
    c.querySelector("#npc-clear-filters")?.addEventListener("click", () => {
      const search = document.getElementById("npc-search");
      const faction = document.getElementById("npc-faction-filter");
      const includeDead = document.getElementById("npc-include-dead");
      if (search) search.value = "";
      if (faction) faction.value = "";
      if (includeDead) includeDead.checked = true;
      _currentPage = 1;
      persistUIState();
      applyFilters(state);
    });
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const npc of visibleNPCs) {
    fragment.appendChild(buildCard(state, npc));
  }
  c.replaceChildren(fragment);

  updatePaginationUI(safeList.length);
}

// ── Render NPCs ───────────────────────────────────────────────────────────────
function renderNPCs(state) {
  const c = document.getElementById("npc-list");
  if (!c) return;
  c.innerHTML = "";
  for (const npc of state.npcs) c.appendChild(buildCard(state, npc));
}

// ── Render reputation ─────────────────────────────────────────────────────────
function renderReputation(state) {
  const c = document.getElementById("reputation-list");
  if (!c) return;
  c.innerHTML = "";

  const knownFactions = state.factions ?? [];
  const ids = new Set([
    ...knownFactions.map(f => f.id),
    ...Object.keys(state.player?.reputation ?? {}),
    ...(state.npcs ?? []).map(n => n.factionId).filter(Boolean)
  ]);

  const factionRows = Array.from(ids).map(id => {
    const found = state?._factionById instanceof Map
      ? state._factionById.get(id)
      : knownFactions.find(f => f.id === id);
    const name = found?.name ?? String(id).replace(/^faction[_-]?/i, "").replace(/[_-]+/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
    return { id, name };
  }).sort((a, b) => a.name.localeCompare(b.name));

  if (factionRows.length === 0) {
    c.innerHTML = '<p class="log-empty">No factions available yet. Import factions or create one.</p>';
    return;
  }

  for (const faction of factionRows) {
    const rep = state.player.reputation[faction.id] ?? 20;
    const cls = rep < 35 ? "rep-low" : rep > 65 ? "rep-high" : "rep-mid";
    const row = document.createElement("div");
    row.className = "faction-row";
    row.innerHTML = `
      <div class="faction-header">
        <span class="faction-name">${faction.name}</span>
        <div class="faction-header-right">
          <span class="faction-val">${rep}</span>
          <button class="faction-edit-btn" title="Edit faction standing">✎</button>
        </div>
      </div>
      <div class="rep-bar-wrap">
        <div class="rep-bar ${cls}" style="width:${rep}%"></div>
      </div>`;

    row.querySelector(".faction-edit-btn")?.addEventListener("click", e => {
      e.stopPropagation();
      const targetFaction = state?._factionById instanceof Map
        ? state._factionById.get(faction.id)
        : (state.factions ?? []).find(f => f.id === faction.id);
      if (!targetFaction) return;
      window.__openFactionEditModal?.(targetFaction);
    });

    row.querySelector(".faction-edit-btn")?.setAttribute("aria-label", `Edit faction ${faction.name}`);

    c.appendChild(row);
  }
}

// ── Full render ───────────────────────────────────────────────────────────────
export function render(state) {
  const renderStart = performance.now();
  try {
    _lastFilteredIdsKey = "";
    _lastRenderedPageKey = "";
    renderReputation(state);
    wireSearchAndFilter(state);
  } catch (e) {
    console.error("[ui] render failed", e);
    const npcList = document.getElementById("npc-list");
    if (npcList) {
      npcList.innerHTML = '<p class="log-empty">Render error. Reload the page and try again.</p>';
    }
  } finally {
    pushPerfSample(perfStats.renderMs, performance.now() - renderStart);
    updatePerfPanel(state);
  }
}
