// generalConfigBuilder.js - General interaction config modal

function qs(id) {
  return document.getElementById(id);
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function normalizeRange(minRaw, maxRaw) {
  let min = toInt(minRaw, 0);
  let max = toInt(maxRaw, 0);
  return { min, max };
}

let _appState = null;
let _onSave = null;
let _built = false;

function buildActionEditor(action, actionIdx) {
  const allStats = _appState?.system?.stats ?? ["trust", "fear", "respect", "readiness"];

  let rows = `
    <div class="gc-action-rows">
      <div class="gc-grid gc-grid-head">
        <div style="grid-column: 1;">Stat</div>
        <div style="grid-column: 2;">Min Base</div>
        <div style="grid-column: 3;">Max Base</div>
        <div style="grid-column: 4; text-align: center;">Enabled</div>
      </div>`;

  for (const stat of allStats) {
    const fallback = toInt(action.effects?.[stat] ?? 0, 0);
    const existing = action?.ranges?.[stat] ?? { min: fallback, max: fallback, enabled: fallback !== 0 };
    const normalized = normalizeRange(existing.min, existing.max);
    const isEnabled = existing.enabled !== false;
    rows += `
      <div class="gc-grid">
        <div class="gc-stat-name" style="grid-column: 1;">${stat}</div>
        <input class="cb-inp gc-num-input" type="number" id="gc-min-${actionIdx}-${stat}" style="grid-column: 2;" value="${normalized.min}" ${!isEnabled ? 'disabled' : ''} />
        <input class="cb-inp gc-num-input" type="number" id="gc-max-${actionIdx}-${stat}" style="grid-column: 3;" value="${normalized.max}" ${!isEnabled ? 'disabled' : ''} />
        <div style="grid-column: 4; text-align: center;"><input class="gc-stat-toggle" type="checkbox" id="gc-ena-${actionIdx}-${stat}" data-action-idx="${actionIdx}" data-stat="${stat}" ${isEnabled ? 'checked' : ''} /></div>
      </div>`;
  }
  rows += `</div>`;

  return `
    <div class="gc-action-box" data-action-id="${action.id}">
      <div class="gc-action-title">${action.label ?? action.id}</div>
      ${rows}
    </div>`;
}

function buildModal() {
  if (_built || !document.body) return;
  _built = true;

  const el = document.createElement("div");
  el.id = "gc-overlay";
  el.className = "cb-overlay";
  el.innerHTML = `
    <div class="cb-box" role="dialog" aria-modal="true" aria-labelledby="gc-heading">
      <div class="cb-header">
        <span class="cb-sigil">⚙</span>
        <span class="cb-heading" id="gc-heading">Edit General Config</span>
        <button class="cb-x" id="gc-x" aria-label="Close">✕</button>
      </div>

      <div class="cb-scroll">
        <div id="gc-err-box" class="cb-err-box" style="display:none"></div>
        <p class="gc-note">Set min and max base values per action. These values define the random base range and still pass through each NPC's personality/trait modifiers.</p>
        <div id="gc-actions-wrap"></div>
      </div>

      <div class="cb-footer">
        <div></div>
        <div class="cb-footer-r">
          <button id="gc-cancel" class="cb-btn cb-cancel">Cancel</button>
          <button id="gc-save" class="cb-btn cb-save">✦ Save Config</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(el);
  wireEvents();
}

function showErrors(errs) {
  const box = qs("gc-err-box");
  if (!box) return;
  box.innerHTML = errs.map(e => `<div>⚠ ${e}</div>`).join("");
  box.style.display = "block";
}

function clearErrors() {
  const box = qs("gc-err-box");
  if (!box) return;
  box.innerHTML = "";
  box.style.display = "none";
}

function renderActionRows() {
  const wrap = qs("gc-actions-wrap");
  if (!wrap) return;

  const actions = _appState?.system?.actions ?? [];
  wrap.innerHTML = actions.map((action, idx) => buildActionEditor(action, idx)).join("");
  
  // Wire up toggle listeners for all checkboxes
  const toggles = wrap.querySelectorAll(".gc-stat-toggle");
  toggles.forEach(toggle => {
    toggle.addEventListener("change", (e) => {
      const actionIdx = e.target.dataset.actionIdx;
      const stat = e.target.dataset.stat;
      const minInput = qs(`gc-min-${actionIdx}-${stat}`);
      const maxInput = qs(`gc-max-${actionIdx}-${stat}`);
      const isChecked = e.target.checked;
      
      if (minInput) minInput.disabled = !isChecked;
      if (maxInput) maxInput.disabled = !isChecked;
    });
  });
}

function collectConfig() {
  const current = _appState?.system ?? { stats: [], actions: [] };
  const allStats = Array.isArray(current.stats) ? current.stats : ["trust", "fear", "respect", "readiness"];
  const next = {
    stats: [...allStats],
    actions: []
  };

  for (const [idx, action] of (current.actions ?? []).entries()) {
    const effects = { ...(action.effects ?? {}) };
    const ranges = {};

    for (const stat of allStats) {
      const enabledInput = qs(`gc-ena-${idx}-${stat}`);
      const minInput = qs(`gc-min-${idx}-${stat}`);
      const maxInput = qs(`gc-max-${idx}-${stat}`);
      const normalized = normalizeRange(minInput?.value, maxInput?.value);
      ranges[stat] = {
        ...normalized,
        enabled: Boolean(enabledInput?.checked)
      };

      // Keep legacy deterministic effect value as midpoint fallback (only if enabled).
      if (ranges[stat].enabled) {
        effects[stat] = Math.round((normalized.min + normalized.max) / 2);
      }
    }

    next.actions.push({
      id: action.id,
      label: action.label,
      effects,
      ranges
    });
  }

  return next;
}

function validateConfig(cfg) {
  const errs = [];
  if (!Array.isArray(cfg?.actions) || cfg.actions.length === 0) {
    errs.push("At least one action is required.");
    return errs;
  }

  for (const action of cfg.actions) {
    if (!action.id) errs.push("Each action must have an id.");
    for (const [stat, range] of Object.entries(action.ranges ?? {})) {
      if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) {
        errs.push(`Invalid numeric range for ${action.id}/${stat}.`);
      }
      if (range.min > range.max) {
        errs.push(`Min value cannot be greater than max value for ${action.id}/${stat}.`);
      }
    }
  }

  return errs;
}

async function handleSave() {
  clearErrors();
  const cfg = collectConfig();
  const errs = validateConfig(cfg);
  if (errs.length) {
    showErrors(errs);
    return;
  }

  const btn = qs("gc-save");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    await _onSave?.(cfg);
    close();
  } catch (e) {
    showErrors(["Save failed: " + (e?.message ?? String(e))]);
  } finally {
    btn.disabled = false;
    btn.textContent = "✦ Save Config";
  }
}

function wireEvents() {
  qs("gc-x")?.addEventListener("click", close);
  qs("gc-cancel")?.addEventListener("click", close);
  qs("gc-save")?.addEventListener("click", handleSave);
  qs("gc-overlay")?.addEventListener("mousedown", e => {
    if (e.target === qs("gc-overlay")) close();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && qs("gc-overlay")?.classList.contains("cb-open")) close();
  });
}

function open() {
  renderActionRows();
  qs("gc-overlay")?.classList.add("cb-open");
}

function close() {
  qs("gc-overlay")?.classList.remove("cb-open");
  clearErrors();
}

export function initGeneralConfigBuilder(appState, callbacks) {
  _appState = appState;
  _onSave = callbacks.onSave;

  if (document.body) {
    buildModal();
  } else {
    document.addEventListener("DOMContentLoaded", buildModal, { once: true });
  }
}

export function openGeneralConfigModal() {
  if (!_built) buildModal();
  clearErrors();
  open();
}

export function updateGeneralConfigBuilderState(newState) {
  _appState = newState;
}
