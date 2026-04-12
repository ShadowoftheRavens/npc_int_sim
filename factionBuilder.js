// factionBuilder.js - Faction Create modal

function qs(id) {
  return document.getElementById(id);
}

function clamp(v) {
  const n = Number(v);
  return isNaN(n) ? 50 : Math.max(0, Math.min(100, Math.round(n)));
}

let _appState = null;
let _onSave = null;
let _built = false;
let _editingId = null;

function buildModal() {
  if (_built || !document.body) return;
  _built = true;

  const el = document.createElement("div");
  el.id = "fb-overlay";
  el.className = "cb-overlay";
  el.innerHTML = `
    <div class="cb-box" role="dialog" aria-modal="true" aria-labelledby="fb-heading">
      <div class="cb-header">
        <span class="cb-sigil">🏰</span>
        <span class="cb-heading" id="fb-heading">Create Faction</span>
        <button class="cb-x" id="fb-x" aria-label="Close">✕</button>
      </div>

      <div class="cb-scroll">
        <div id="fb-err-box" class="cb-err-box" style="display:none"></div>

        <div class="cb-section-label">Faction Identity</div>
        <div class="cb-field" style="margin-bottom:.75rem">
          <label class="cb-lbl" for="fb-name">Faction Name *</label>
          <input id="fb-name" class="cb-inp" type="text" placeholder="Faction name" autocomplete="off" spellcheck="false" />
        </div>

        <div class="cb-field" style="margin-bottom:.75rem">
          <label class="cb-lbl" for="fb-reputation">Reputation (0-100)</label>
          <input id="fb-reputation" class="cb-inp" type="number" min="0" max="100" value="50" />
        </div>

        <div class="cb-field" style="margin-bottom:.75rem">
          <label class="cb-lbl" for="fb-affiliated">Affiliated Factions <span class="cb-hint">(names or IDs, comma-separated)</span></label>
          <input id="fb-affiliated" class="cb-inp" type="text" placeholder="City Guard, faction_2" />
        </div>

        <div class="cb-field" style="margin-bottom:.75rem">
          <label class="cb-lbl" for="fb-hated">Hated Factions <span class="cb-hint">(names or IDs, comma-separated)</span></label>
          <input id="fb-hated" class="cb-inp" type="text" placeholder="Shadow Thieves, faction_3" />
        </div>

        <p class="fb-note">Faction links are saved into state and persisted per faction file in the factions folder when folder access is active.</p>
      </div>

      <div class="cb-footer">
        <div></div>
        <div class="cb-footer-r">
          <button id="fb-cancel" class="cb-btn cb-cancel">Cancel</button>
          <button id="fb-save" class="cb-btn cb-save">✦ Save Faction</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(el);
  wireEvents();
}

function showErrors(errs) {
  const box = qs("fb-err-box");
  box.innerHTML = errs.map(e => `<div>⚠ ${e}</div>`).join("");
  box.style.display = "block";
}

function clearErrors() {
  const box = qs("fb-err-box");
  if (box) {
    box.innerHTML = "";
    box.style.display = "none";
  }
}

function collectForm() {
  const affiliated = String(qs("fb-affiliated")?.value ?? "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  const hated = String(qs("fb-hated")?.value ?? "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  const affiliatedSet = new Set(affiliated);
  const hatedFiltered = hated.filter(v => !affiliatedSet.has(v));

  return {
    id: _editingId,
    name: String(qs("fb-name")?.value ?? "").trim(),
    reputation: clamp(qs("fb-reputation")?.value),
    affiliatedFactions: affiliated,
    hatedFactions: hatedFiltered
  };
}

function validateFaction(faction) {
  const errs = [];
  if (!faction.name) errs.push("Faction name is required.");
  return errs;
}

async function handleSave() {
  clearErrors();
  const faction = collectForm();
  const errs = validateFaction(faction);
  if (errs.length) {
    showErrors(errs);
    return;
  }

  const btn = qs("fb-save");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    await _onSave?.(faction, Boolean(_editingId));
    close();
  } catch (e) {
    showErrors(["Save failed: " + (e?.message ?? String(e))]);
  } finally {
    btn.disabled = false;
    btn.textContent = "✦ Save Faction";
  }
}

function wireEvents() {
  qs("fb-x")?.addEventListener("click", close);
  qs("fb-cancel")?.addEventListener("click", close);
  qs("fb-save")?.addEventListener("click", handleSave);
  qs("fb-overlay")?.addEventListener("mousedown", e => {
    if (e.target === qs("fb-overlay")) close();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && qs("fb-overlay")?.classList.contains("cb-open")) close();
  });
}

function open() {
  qs("fb-overlay")?.classList.add("cb-open");
  setTimeout(() => qs("fb-name")?.focus(), 50);
}

function close() {
  qs("fb-overlay")?.classList.remove("cb-open");
  clearErrors();
}

export function initFactionBuilder(appState, callbacks) {
  _appState = appState;
  _onSave = callbacks.onSave;

  if (document.body) {
    buildModal();
  } else {
    document.addEventListener("DOMContentLoaded", buildModal, { once: true });
  }
}

export function openFactionCreateModal() {
  if (!_built) buildModal();
  _editingId = null;
  clearErrors();
  qs("fb-heading").textContent = "Create Faction";
  qs("fb-name").value = "";
  qs("fb-reputation").value = "50";
  qs("fb-affiliated").value = "";
  qs("fb-hated").value = "";
  open();
}

export function openFactionEditModal(faction) {
  if (!_built) buildModal();
  if (!faction?.id) return;

  _editingId = faction.id;
  const liveStanding = Number(_appState?.player?.reputation?.[faction.id]);
  const repValue = Number.isFinite(liveStanding)
    ? liveStanding
    : clamp(faction.reputation ?? 50);
  clearErrors();
  qs("fb-heading").textContent = `Edit Faction - ${faction.name ?? faction.id}`;
  qs("fb-name").value = faction.name ?? "";
  qs("fb-reputation").value = String(clamp(repValue));
  qs("fb-affiliated").value = (faction.affiliatedFactions ?? []).join(", ");
  qs("fb-hated").value = (faction.hatedFactions ?? []).join(", ");
  open();
}

export function updateFactionBuilderState(newState) {
  _appState = newState;
}
