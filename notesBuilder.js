// notesBuilder.js - NPC notes modal

function qs(id) {
  return document.getElementById(id);
}

let _appState = null;
let _currentNpcId = null;
let _onSave = null;
let _built = false;

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
        <div id="notes-npc-name" class="notes-npc-name"></div>
        <textarea 
          id="notes-textarea" 
          class="notes-textarea" 
          placeholder="Add custom notes about this NPC...&#10;&#10;You can track motivations, history, preferences, relationship details, and any other information you want to remember."
        ></textarea>
      </div>

      <div class="cb-footer">
        <div></div>
        <div class="cb-footer-r">
          <button id="notes-cancel" class="cb-btn cb-cancel">Cancel</button>
          <button id="notes-save" class="cb-btn cb-save">💾 Save Notes</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(el);
  wireEvents();
}

function wireEvents() {
  qs("notes-x")?.addEventListener("click", close);
  qs("notes-cancel")?.addEventListener("click", close);
  qs("notes-save")?.addEventListener("click", handleSave);
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

  if (!_currentNpcId || !_appState) return;

  const npc = _appState.npcs.find(n => n.id === _currentNpcId);
  if (!npc) return;

  npc.notes = notes;

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

  qs("notes-overlay")?.classList.add("cb-open");
  textarea?.focus();
}

function close() {
  qs("notes-overlay")?.classList.remove("cb-open");
  _currentNpcId = null;
}

export function initNotesBuilder(appState, onSave) {
  _appState = appState;
  _onSave = onSave;
  buildModal();
}

export function openNotesModal(npcId) {
  open(npcId);
}

export function updateNotesBuilderState(appState) {
  _appState = appState;
}
