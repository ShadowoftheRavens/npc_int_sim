// characterBuilder.js — NPC Create / Edit / Delete modal
// Fully self-contained. No external CSS deps beyond what style.css provides.

import { saveToLocalStorage } from "./fileSystem.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId() {
  return "npc_" + Math.random().toString(36).slice(2, 8) + "_" + Date.now().toString(36);
}

function clamp(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.round(n)));
}

function clampRange(v, min, max) {
  const n = Number(v);
  if (isNaN(n)) return 0;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function qs(id) {
  return document.getElementById(id);
}

// ── Module-level state ────────────────────────────────────────────────────────

let _appState  = null;
let _onSave    = null;
let _onDelete  = null;
let _editingId = null;
let _built     = false;

// ── Slider HTML helper ────────────────────────────────────────────────────────

function sliderRow(id, label, colorClass, defaultVal = 50, minVal = 0, maxVal = 100) {
  const fillPercent = Math.round(((defaultVal - minVal) / (maxVal - minVal)) * 100);
  return `
    <div class="cb-slider-row">
      <span class="cb-slider-label">${label}</span>
      <div class="cb-slider-track">
        <div class="cb-slider-fill ${colorClass}" id="fill-${id}" style="width:${fillPercent}%"></div>
        <input class="cb-slider" type="range" id="sl-${id}" min="${minVal}" max="${maxVal}" value="${defaultVal}" />
      </div>
      <input class="cb-num-input" type="number" id="num-${id}" min="${minVal}" max="${maxVal}" value="${defaultVal}" />
    </div>`;
}

// ── Build modal (only once) ───────────────────────────────────────────────────

function buildModal() {
  if (_built || !document.body) return;
  _built = true;

  const el = document.createElement("div");
  el.id = "cb-overlay";
  el.className = "cb-overlay";
  el.innerHTML = `
    <div class="cb-box" role="dialog" aria-modal="true" aria-labelledby="cb-heading">
      <div class="cb-header">
        <span class="cb-sigil">✦</span>
        <span class="cb-heading" id="cb-heading">Create Character</span>
        <button class="cb-x" id="cb-x" aria-label="Close">✕</button>
      </div>

      <div class="cb-scroll">
        <div id="cb-err-box" class="cb-err-box" style="display:none"></div>

        <div class="cb-section-label">Identity</div>
        <div class="cb-row2">
          <div class="cb-field">
            <label class="cb-lbl" for="cb-name">Name *</label>
            <input id="cb-name" class="cb-inp" type="text" placeholder="Character name" autocomplete="off" spellcheck="false" />
          </div>
          <div class="cb-field">
            <label class="cb-lbl" for="cb-role">Role *</label>
            <input id="cb-role" class="cb-inp" type="text" placeholder="Merchant, Guard…" />
          </div>
        </div>
        <div class="cb-field" style="margin-bottom:.75rem">
          <label class="cb-lbl" for="cb-faction">Faction *</label>
          <input id="cb-faction" class="cb-inp" type="text" list="cb-faction-list" placeholder="City Guard, Traders Guild..." />
          <datalist id="cb-faction-list"></datalist>
        </div>
        <div class="cb-field" style="margin-bottom:.75rem">
          <label class="cb-lbl" for="cb-traits">Traits <span class="cb-hint">(comma-separated)</span></label>
          <input id="cb-traits" class="cb-inp" type="text" placeholder="brave, greedy, loyal…" />
        </div>
        <div class="cb-field" style="margin-bottom:.75rem">
          <label class="cb-lbl" for="cb-affiliated">Affiliated Factions <span class="cb-hint">(faction IDs, comma-separated)</span></label>
          <input id="cb-affiliated" class="cb-inp" type="text" placeholder="faction_1, faction_2…" />
        </div>
        <div class="cb-field" style="margin-bottom:.75rem">
          <label class="cb-lbl" for="cb-hated">Hated Factions <span class="cb-hint">(faction IDs, comma-separated)</span></label>
          <input id="cb-hated" class="cb-inp" type="text" placeholder="faction_1, faction_2…" />
        </div>
        <div class="cb-dead-row" style="margin-bottom:.75rem">
          <label class="cb-dead-label" for="cb-dead">
            <input id="cb-dead" type="checkbox" />
            Dead
          </label>
          <span class="cb-hint">If dead, action buttons are disabled and stats no longer change.</span>
        </div>

        <div class="cb-section-label" style="margin-top:1rem">Stats</div>
        ${sliderRow("trust",   "Trust",   "fill-trust", 50, -100, 100)}
        ${sliderRow("fear",    "Fear",    "fill-fear")}
        ${sliderRow("respect", "Respect", "fill-respect")}

        <div class="cb-section-label" style="margin-top:1rem">Personality</div>
        ${sliderRow("brave",      "Brave",      "fill-brave")}
        ${sliderRow("greed",      "Greed",      "fill-greed")}
        ${sliderRow("loyalty",    "Loyalty",    "fill-loyalty")}
        ${sliderRow("aggression", "Aggression", "fill-aggression")}
      </div>

      <div class="cb-footer">
        <button id="cb-del" class="cb-btn cb-del" style="display:none">🗑 Delete</button>
        <div class="cb-footer-r">
          <button id="cb-cancel" class="cb-btn cb-cancel">Cancel</button>
          <button id="cb-save"   class="cb-btn cb-save">✦ Save</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(el);
  wireEvents();
}

// ── Wire all events ───────────────────────────────────────────────────────────

function wireEvents() {
  // Close paths
  qs("cb-x").addEventListener("click", close);
  qs("cb-cancel").addEventListener("click", close);
  qs("cb-overlay").addEventListener("mousedown", e => {
    if (e.target === qs("cb-overlay")) close();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && qs("cb-overlay")?.classList.contains("cb-open")) close();
  });

  // Save / Delete
  qs("cb-save").addEventListener("click", handleSave);
  qs("cb-del").addEventListener("click", handleDelete);

  // Sync all sliders ↔ number inputs
  const ids = ["trust","fear","respect","brave","greed","loyalty","aggression"];
  for (const id of ids) {
    const sl   = qs(`sl-${id}`);
    const num  = qs(`num-${id}`);
    const fill = qs(`fill-${id}`);
    if (!sl || !num || !fill) continue;

    sl.addEventListener("input", () => {
      num.value = sl.value;
      const min = Number(sl.min);
      const max = Number(sl.max);
      const fillPercent = Math.round(((Number(sl.value) - min) / (max - min)) * 100);
      fill.style.width = fillPercent + "%";
    });
    num.addEventListener("input", () => {
      const v = clampRange(num.value, Number(sl.min), Number(sl.max));
      num.value = v;
      sl.value  = v;
      const min = Number(sl.min);
      const max = Number(sl.max);
      const fillPercent = Math.round(((Number(v) - min) / (max - min)) * 100);
      fill.style.width = fillPercent + "%";
    });
    num.addEventListener("change", () => {
      const v = clampRange(num.value, Number(sl.min), Number(sl.max));
      num.value = v;
      sl.value  = v;
      const min = Number(sl.min);
      const max = Number(sl.max);
      const fillPercent = Math.round(((Number(v) - min) / (max - min)) * 100);
      fill.style.width = fillPercent + "%";
    });
  }
}

// ── Populate faction dropdown ─────────────────────────────────────────────────

function populateFactions() {
  const list = qs("cb-faction-list");
  if (!list) return;
  list.innerHTML = "";
  for (const f of (_appState?.factions ?? [])) {
    const opt = document.createElement("option");
    opt.value = f.name;
    list.appendChild(opt);
  }
}

function factionNameFromId(id) {
  return (_appState?.factions ?? []).find(f => f.id === id)?.name ?? "";
}

function factionIdFromNameOrId(nameOrId) {
  // Try exact ID match first
  const byId = (_appState?.factions ?? []).find(f => f.id === nameOrId);
  if (byId) return byId.id;
  
  // Try name match (case-insensitive)
  const byName = (_appState?.factions ?? []).find(f => f.name.toLowerCase() === String(nameOrId).toLowerCase());
  if (byName) return byName.id;
  
  // Return as-is if no match (will be handled upstream)
  return nameOrId;
}

// ── Set a slider + number + fill ──────────────────────────────────────────────

function setSlider(id, val) {
  const sl   = qs(`sl-${id}`);
  const num  = qs(`num-${id}`);
  const fill = qs(`fill-${id}`);
  const min  = Number(sl?.min ?? 0);
  const max  = Number(sl?.max ?? 100);
  const v    = clampRange(val, min, max);
  const fillPercent = Math.round(((v - min) / (max - min)) * 100);
  if (sl)   sl.value  = v;
  if (num)  num.value = v;
  if (fill) fill.style.width = fillPercent + "%";
}

// ── Fill form from NPC object ─────────────────────────────────────────────────

function fillForm(npc) {
  qs("cb-name").value    = npc.name    ?? "";
  qs("cb-role").value    = npc.role    ?? "";
  qs("cb-traits").value  = (npc.traits ?? []).join(", ");
  
  // Display faction names for affiliated/hated factions instead of IDs
  const affiliatedNames = (npc.affiliatedFactions ?? []).map(f => factionNameFromId(f)).join(", ");
  qs("cb-affiliated").value = affiliatedNames;
  
  const hatedNames = (npc.hatedFactions ?? []).map(f => factionNameFromId(f)).join(", ");
  qs("cb-hated").value = hatedNames;
  qs("cb-dead").checked = Boolean(npc.dead);

  populateFactions();
  qs("cb-faction").value = npc.factionName ?? factionNameFromId(npc.factionId) ?? npc.factionId ?? "";

  setSlider("trust",      npc.stats?.trust      ?? 50);
  setSlider("fear",       npc.stats?.fear       ?? 20);
  setSlider("respect",    npc.stats?.respect    ?? 50);
  setSlider("brave",      npc.personality?.brave      ?? 50);
  setSlider("greed",      npc.personality?.greed      ?? 50);
  setSlider("loyalty",    npc.personality?.loyalty    ?? 50);
  setSlider("aggression", npc.personality?.aggression ?? 50);
}

// ── Collect form → NPC ────────────────────────────────────────────────────────

function collectForm(existing = null) {
  const traitsRaw = qs("cb-traits").value.trim();
  const traits = traitsRaw
    ? traitsRaw.split(",").map(t => t.trim()).filter(Boolean)
    : [];

  // Resolve affiliated faction inputs (names or IDs) to actual faction IDs
  const affiliatedRaw = qs("cb-affiliated").value.trim();
  let affiliatedFactions = affiliatedRaw
    ? affiliatedRaw.split(",").map(f => factionIdFromNameOrId(f.trim())).filter(Boolean)
    : [];

  // Resolve hated faction inputs (names or IDs) to actual faction IDs
  const hatedRaw = qs("cb-hated").value.trim();
  let hatedFactions = hatedRaw
    ? hatedRaw.split(",").map(f => factionIdFromNameOrId(f.trim())).filter(Boolean)
    : [];

  // De-duplicate: remove any faction from hated that also appears in affiliated
  const affiliatedSet = new Set(affiliatedFactions);
  hatedFactions = hatedFactions.filter(f => !affiliatedSet.has(f));

  return {
    id:        existing?.id ?? genId(),
    name:      qs("cb-name").value.trim(),
    role:      qs("cb-role").value.trim(),
    factionName: qs("cb-faction").value.trim(),
    dead: Boolean(qs("cb-dead")?.checked),
    stats: {
      trust:   clampRange(qs("sl-trust").value, -100, 100),
      fear:    clamp(qs("sl-fear").value),
      respect: clamp(qs("sl-respect").value),
    },
    personality: {
      brave:      clamp(qs("sl-brave").value),
      greed:      clamp(qs("sl-greed").value),
      loyalty:    clamp(qs("sl-loyalty").value),
      aggression: clamp(qs("sl-aggression").value),
    },
    traits,
    affiliatedFactions,
    hatedFactions,
    memory: existing?.memory ?? [],
    notes: existing?.notes ?? "",
    state:  existing?.state  ?? { mood: "neutral" }
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(npc) {
  const errors = [];
  if (!npc.name)      errors.push("Name is required.");
  if (!npc.role)      errors.push("Role is required.");
  if (!npc.factionName) errors.push("Faction is required.");
  return errors;
}

// ── Error display ─────────────────────────────────────────────────────────────

function showErrors(errs) {
  const box = qs("cb-err-box");
  box.innerHTML = errs.map(e => `<div>⚠ ${e}</div>`).join("");
  box.style.display = "block";
}

function clearErrors() {
  const box = qs("cb-err-box");
  if (box) { box.innerHTML = ""; box.style.display = "none"; }
}

// ── Save handler ──────────────────────────────────────────────────────────────

async function handleSave() {
  clearErrors();

  const existing = _editingId
    ? (_appState?.customNPCs ?? []).find(n => n.id === _editingId)
      ?? (_appState?.npcs ?? []).find(n => n.id === _editingId)
      ?? null
    : null;

  const npc    = collectForm(existing);
  const errors = validate(npc);

  if (errors.length) { showErrors(errors); return; }

  const btn = qs("cb-save");
  btn.disabled    = true;
  btn.textContent = "Saving…";

  try {
    await _onSave(npc, !!_editingId);
    close();
  } catch (e) {
    showErrors(["Save failed: " + e.message]);
  } finally {
    btn.disabled    = false;
    btn.textContent = "✦ Save";
  }
}

// ── Delete handler ────────────────────────────────────────────────────────────

async function handleDelete() {
  if (!_editingId) return;
  const npc  = (_appState?.customNPCs ?? []).find(n => n.id === _editingId);
  const name = npc?.name ?? "this character";
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

  const btn = qs("cb-del");
  btn.disabled = true;

  try {
    await _onDelete(_editingId);
    close();
  } catch (e) {
    showErrors(["Delete failed: " + e.message]);
  } finally {
    btn.disabled = false;
  }
}

// ── Open/Close ────────────────────────────────────────────────────────────────

function open() {
  const overlay = qs("cb-overlay");
  if (!overlay) return;
  overlay.classList.add("cb-open");
  // Focus first input after transition
  setTimeout(() => qs("cb-name")?.focus(), 50);
}

function close() {
  qs("cb-overlay")?.classList.remove("cb-open");
  clearErrors();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initCharacterBuilder(appState, callbacks) {
  _appState = appState;
  _onSave   = callbacks.onSave;
  _onDelete = callbacks.onDelete;

  // Build modal only when DOM is ready
  if (document.body) {
    buildModal();
  } else {
    document.addEventListener("DOMContentLoaded", buildModal, { once: true });
  }
}

export function openCreateModal() {
  if (!_built) buildModal();

  _editingId = null;
  qs("cb-heading").textContent = "Create Character";
  qs("cb-del").style.display   = "none";
  clearErrors();

  fillForm({
    name: "", role: "", factionId: "", traits: [], affiliatedFactions: [], hatedFactions: [], dead: false,
    stats:       { trust: 50, fear: 20, respect: 50 },
    personality: { brave: 50, greed: 50, loyalty: 50, aggression: 50 },
    memory: [], notes: "", state: { mood: "neutral" }
  });

  open();
}

export function openEditModal(npc) {
  if (!_built) buildModal();

  _editingId = npc.id;
  qs("cb-heading").textContent = `Edit — ${npc.name}`;
  qs("cb-del").style.display   = "inline-flex";
  clearErrors();

  fillForm(npc);
  open();
}

/** Call after state object is replaced (e.g. on reset) */
export function updateBuilderState(newState) {
  _appState = newState;
}
