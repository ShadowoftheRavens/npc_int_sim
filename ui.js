// ui.js — DOM rendering (Phase 3: Edit/Delete on custom NPC cards)

import { applyAction } from "./npcEngine.js";
import { saveState }   from "./storage.js";

// ── Avatar ────────────────────────────────────────────────────────────────────
const DEFAULT_AVATAR = "👤";

// ── Faction name ──────────────────────────────────────────────────────────────
function factionName(state, id) {
  return state.factions.find(f => f.id === id)?.name ?? (id || "Unknown");
}

// ── Is custom NPC? ────────────────────────────────────────────────────────────
function isCustom(state, npcId) {
  return (state.customNPCs ?? []).some(n => n.id === npcId);
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
  card.querySelectorAll(".action-btn").forEach(b => b.disabled = true);

  const result = applyAction(state, npcId, actionId);
  saveState(state);
  await window.__persistFactions?.();
  await window.__persistNPCSnapshot?.();
  render(state);

  const updated = document.querySelector(`[data-npc-id="${npcId}"]`);
  if (updated) flashCard(updated, result.outcome.tone);

  for (const [stat, delta] of Object.entries(result.statDeltas)) {
    if (!delta) continue;
    const el = updated?.querySelector(`[data-stat="${stat}"]`);
    if (el) spawnDelta(el, (delta > 0 ? "+" : "") + delta + " " + stat, delta > 0);
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
    btn.disabled = isDead;
    btn.addEventListener("click", () => handleAction(state, npc.id, action.id, card));
    actions.appendChild(btn);
  }

  body.append(grid, traits, actions);
  card.append(hdr, body);

  // ── Wire edit / delete
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
    render(state);
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

  if (searchInput) {
    searchInput.oninput = () => applyFilters(state);
  }

  if (factionSelect) {
    factionSelect.onchange = () => applyFilters(state);
  }

  if (includeDeadInput) {
    includeDeadInput.onchange = () => applyFilters(state);
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

  const filtered = state.npcs.filter(npc => {
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

  renderFilteredNPCs(state, filtered);
}

function renderFilteredNPCs(state, npcs) {
  const c = document.getElementById("npc-list");
  if (!c) return;
  c.innerHTML = "";
  
  if (npcs.length === 0) {
    c.innerHTML = '<p class="log-empty">No NPCs match your filters…</p>';
    return;
  }

  for (const npc of npcs) {
    c.appendChild(buildCard(state, npc));
  }
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
    const found = knownFactions.find(f => f.id === id);
    const name = found?.name ?? String(id).replace(/^faction[_-]?/i, "").replace(/[_-]+/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
    return { id, name };
  }).sort((a, b) => a.name.localeCompare(b.name));

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
      const targetFaction = (state.factions ?? []).find(f => f.id === faction.id);
      if (!targetFaction) return;
      window.__openFactionEditModal?.(targetFaction);
    });

    c.appendChild(row);
  }
}

// ── Full render ───────────────────────────────────────────────────────────────
export function render(state) {
  renderNPCs(state);
  renderReputation(state);
  wireSearchAndFilter(state);
}
