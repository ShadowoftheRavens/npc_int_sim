// notesBuilder.js - NPC notes modal

import { showToast } from "./uiNotifications.js";

function qs(id) {
  return document.getElementById(id);
}

function clampHp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function updateHpFill(slider, fill) {
  if (!slider || !fill) return;
  const min = Number(slider.min || 0);
  const max = Number(slider.max || 100);
  const current = Number(slider.value || min);
  const pct = max === min ? 0 : Math.round(((current - min) / (max - min)) * 100);
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

async function copyTextToClipboard(text) {
  const value = String(text ?? "");

  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }

  return copied;
}

async function copyWithToast(text, successMessage, failureMessage) {
  try {
    const copied = await copyTextToClipboard(text);
    showToast(copied ? successMessage : failureMessage, copied ? "ok" : "err");
  } catch (e) {
    console.warn("[notes] copy failed", e);
    showToast(failureMessage, "err");
  }
}

let _appState = null;
let _currentNpcId = null;
let _onSave = null;
let _built = false;

const LOOT_GENERATOR_URL = "https://www.anima-roleplay.com/resources/tools/loot-generator";
const INITIATIVE_TRACKER_URL = "https://dm.tools/tracker";

function buildModal() {
  if (_built || !document.body) return;
  _built = true;

  const el = document.createElement("div");
  el.id = "notes-overlay";
  el.className = "cb-overlay";
  el.innerHTML = `
    <div class="cb-box notes-box" role="dialog" aria-modal="true" aria-labelledby="notes-heading">
      <div class="cb-header">
        <span class="cb-sigil">📝</span>
        <span class="cb-heading" id="notes-heading">NPC Notes</span>
        <button class="cb-x" id="notes-x" aria-label="Close">✕</button>
      </div>

      <div class="cb-scroll">
        <button id="notes-npc-name" class="notes-npc-name notes-copyable" type="button" title="Click to copy NPC name"></button>
        <div class="cb-section-label notes-section-label">Vitals</div>
        <div class="cb-slider-row notes-hp-row">
          <span class="cb-slider-label">HP</span>
          <div class="cb-slider-track">
            <div id="notes-hp-fill" class="cb-slider-fill fill-hp"></div>
            <input
              id="notes-hp"
              class="cb-slider notes-hp-slider"
              type="range"
              min="0"
              max="100"
              value="100"
            />
          </div>
          <input id="notes-hp-num" class="cb-num-input notes-hp-num" type="number" min="0" max="100" value="100" />
          <button id="notes-hp-copy" class="cb-btn cb-cancel notes-hp-copy" type="button">Copy</button>
        </div>
        <textarea 
          id="notes-textarea" 
          class="notes-textarea" 
          placeholder="Add custom notes about this NPC...&#10;&#10;You can track motivations, history, preferences, relationship details, and any other information you want to remember."
        ></textarea>
      </div>

      <div class="cb-footer">
        <div></div>
        <div class="cb-footer-r">
          <button id="notes-loot" class="cb-btn cb-loot" type="button">Generate Loot</button>
          <button id="notes-initiative" class="cb-btn cb-initiative" type="button">Initiative</button>
          <button id="notes-cancel" class="cb-btn cb-cancel">Cancel</button>
          <button id="notes-save" class="cb-btn cb-save">💾 Save Notes</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(el);
  wireEvents();
}

function wireEvents() {
  qs("notes-npc-name")?.addEventListener("click", () => {
    if (_currentNpcId) {
      const npc = _appState?.npcs?.find(n => n.id === _currentNpcId);
      if (npc) copyWithToast(npc.name, `Copied ${npc.name}`, "Could not copy NPC name");
    }
  });
  qs("notes-npc-name")?.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (_currentNpcId) {
        const npc = _appState?.npcs?.find(n => n.id === _currentNpcId);
        if (npc) copyWithToast(npc.name, `Copied ${npc.name}`, "Could not copy NPC name");
      }
    }
  });
  qs("notes-x")?.addEventListener("click", close);
  qs("notes-loot")?.addEventListener("click", openLootGenerator);
  qs("notes-initiative")?.addEventListener("click", openInitiativeTracker);
  qs("notes-cancel")?.addEventListener("click", close);
  qs("notes-save")?.addEventListener("click", handleSave);
  qs("notes-hp-copy")?.addEventListener("click", () => {
    const hpInput = qs("notes-hp");
    copyWithToast(hpInput?.value ?? "0", "Copied HP", "Could not copy HP");
  });
  qs("notes-overlay")?.addEventListener("mousedown", e => {
    if (e.target === qs("notes-overlay")) close();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && qs("notes-overlay")?.classList.contains("cb-open")) close();
  });
}

async function handleSave() {
  const textarea = qs("notes-textarea");
  const notes = textarea?.value || "";
  const hpInput = qs("notes-hp");
  const hp = clampHp(hpInput?.value ?? 100);

  if (!_currentNpcId || !_appState) return;

  const npc = _appState.npcs.find(n => n.id === _currentNpcId);
  if (!npc) return;

  npc.notes = notes;
  npc.hp = hp;

  try {
    await _onSave?.(_appState);
    close();
  } catch (e) {
    console.error("Failed to save notes:", e);
  }
}

function open(npcId) {
  if (!_built) buildModal();
  
  _currentNpcId = npcId;
  const npc = _appState?.npcs?.find(n => n.id === npcId);
  if (!npc) return;

  const nameEl = qs("notes-npc-name");
  if (nameEl) nameEl.textContent = npc.name;

  const textarea = qs("notes-textarea");
  if (textarea) textarea.value = npc.notes ?? "";

  const hp = clampHp(npc.hp ?? 100);
  const hpSlider = qs("notes-hp");
  const hpNum = qs("notes-hp-num");
  const hpFill = qs("notes-hp-fill");
  if (hpSlider) hpSlider.value = String(hp);
  if (hpNum) hpNum.value = String(hp);
  updateHpFill(hpSlider, hpFill);

  qs("notes-overlay")?.classList.add("cb-open");
  textarea?.focus();
}

function close() {
  qs("notes-overlay")?.classList.remove("cb-open");
  _currentNpcId = null;
}

function openLootGenerator() {
  window.open(LOOT_GENERATOR_URL, "_blank", "noopener,noreferrer");
}

function openInitiativeTracker() {
  window.open(INITIATIVE_TRACKER_URL, "_blank", "noopener,noreferrer");
}

function wireHpControls() {
  const slider = qs("notes-hp");
  const num = qs("notes-hp-num");
  const fill = qs("notes-hp-fill");
  if (!slider || !num || !fill) return;

  const syncFromSlider = () => {
    num.value = slider.value;
    updateHpFill(slider, fill);
  };

  const syncFromNumber = () => {
    const hp = clampHp(num.value);
    num.value = String(hp);
    slider.value = String(hp);
    updateHpFill(slider, fill);
  };

  slider.addEventListener("input", syncFromSlider);
  num.addEventListener("input", syncFromNumber);
  num.addEventListener("change", syncFromNumber);
}

export function initNotesBuilder(appState, onSave) {
  _appState = appState;
  _onSave = onSave;
  buildModal();
  wireHpControls();
}

export function openNotesModal(npcId) {
  open(npcId);
}

export function updateNotesBuilderState(appState) {
  _appState = appState;
}
