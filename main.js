// main.js — App entry point (Phase 1 + 2 + 3)

import { initialData }                      from "./data.js";
import { loadState, saveState, clearState } from "./storage.js";
import { render }                           from "./ui.js";
import {
  isFileSystemSupported,
  hasFileAccess,
  initFileSystem,
  loadCharactersFromFolder,
  loadFromLocalStorage,
  loadFactionsFromLocalStorage,
  loadFactionsFromFolder,
  saveToLocalStorage,
  persistFactions,
  persistNPC,
  persistNPCSnapshot,
  removePersistedNPC,
  exportNpcAndFactionFiles,
  getFolderName
} from "./fileSystem.js";
import {
  initCharacterBuilder,
  openCreateModal,
  openEditModal,
  updateBuilderState
} from "./characterBuilder.js";
import {
  initFactionBuilder,
  openFactionCreateModal,
  openFactionEditModal,
  updateFactionBuilderState
} from "./factionBuilder.js";

const THEME_KEY = "npc_theme_mode";

// ── Utilities ─────────────────────────────────────────────────────────────────

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function applyTheme(mode) {
  const safeMode = mode === "light" ? "light" : "dark";
  document.body.dataset.theme = safeMode;
  try {
    localStorage.setItem(THEME_KEY, safeMode);
  } catch (_) {}

  const btn = document.getElementById("btn-theme-toggle");
  if (btn) {
    btn.textContent = safeMode === "light" ? "☀ Light" : "☾ Dark";
  }
}

function loadTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (_) {}
  applyTheme(saved === "light" ? "light" : "dark");
}

function titleFromFactionId(id) {
  return String(id ?? "")
    .replace(/^faction[_-]?/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()) || "Unknown Faction";
}

function readinessForNPC(npc) {
  const stats = npc?.stats ?? {};
  const personality = npc?.personality ?? {};
  const trust = Math.max(-100, Math.min(100, Number(stats.trust ?? 50)));
  const fear = Math.max(0, Math.min(100, Number(stats.fear ?? 0)));
  const respect = Math.max(0, Math.min(100, Number(stats.respect ?? 50)));
  const aggression = Math.max(0, Math.min(100, Number(personality.aggression ?? 50)));

  const score =
    20 +
    aggression * 0.5 +
    (100 - trust) * 0.25 +
    (100 - respect) * 0.2 -
    0 +
    fear * 0.15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function trustCapForNPC(npc) {
  const loyalty = Math.max(0, Math.min(100, Number(npc?.personality?.loyalty ?? 50))) / 100;
  return Math.round(70 + loyalty * 30);
}

function respectCapForNPC(npc) {
  const loyalty = Math.max(0, Math.min(100, Number(npc?.personality?.loyalty ?? 50))) / 100;
  return Math.round(85 + loyalty * 15);
}

function syncReadinessFromState(state) {
  for (const npc of (state.npcs ?? [])) {
    if (!npc.stats) npc.stats = {};
    npc.stats.readiness = readinessForNPC(npc);
  }
}

function syncTrustRespectCaps(state) {
  for (const npc of (state.npcs ?? [])) {
    if (!npc.stats) npc.stats = {};
    if (typeof npc.stats.trust === "number") {
      npc.stats.trust = Math.min(npc.stats.trust, trustCapForNPC(npc));
    }
    if (typeof npc.stats.respect === "number") {
      npc.stats.respect = Math.min(npc.stats.respect, respectCapForNPC(npc));
    }
  }
}

function ensureFactionFromName(state, rawName) {
  const name = String(rawName ?? "").trim();
  if (!name) return null;

  const byName = state.factions.find(f => f.name.toLowerCase() === name.toLowerCase());
  if (byName) {
    if (!(byName.id in state.player.reputation)) state.player.reputation[byName.id] = 20;
    return byName.id;
  }

  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!slug) slug = "custom";

  let id = `faction_${slug}`;
  let i = 2;
  while (state.factions.some(f => f.id === id)) {
    id = `faction_${slug}_${i++}`;
  }

  state.factions.push({ id, name, reputation: 50, affiliatedFactions: [], hatedFactions: [] });
  if (!(id in state.player.reputation)) state.player.reputation[id] = 20;
  return id;
}

function syncFactionsFromNPCs(state) {
  if (!Array.isArray(state.factions)) state.factions = [];
  if (!state.player?.reputation) state.player.reputation = {};

  for (const npc of (state.npcs ?? [])) {
    const factionId = npc?.factionId;
    if (!factionId) continue;

    const existing = state.factions.find(f => f.id === factionId);
    if (!existing) {
      const inferredName = String(npc.factionName ?? "").trim() || titleFromFactionId(factionId);
      state.factions.push({ id: factionId, name: inferredName, reputation: 50, affiliatedFactions: [], hatedFactions: [] });
    }

    if (!(factionId in state.player.reputation)) {
      state.player.reputation[factionId] = 20;
    }
  }
}

// ── Merge custom NPCs into state.npcs (builtin + custom) ─────────────────────

function mergeCustomNPCs(state) {
  if (!Array.isArray(state.customNPCs)) state.customNPCs = [];
  if (!Array.isArray(state.deletedBuiltinNPCIds)) state.deletedBuiltinNPCIds = [];
  const builtinIds = new Set(initialData.npcs.map(n => n.id));
  const deletedBuiltinSet = new Set(state.deletedBuiltinNPCIds);
  // Keep only builtin base NPCs from state.npcs (preserve their modified stats)
  const builtins = state.npcs.filter(n => builtinIds.has(n.id) && !deletedBuiltinSet.has(n.id));
  state.npcs = [...builtins, ...state.customNPCs];
}

// ── NPC save callback (from character builder) ────────────────────────────────

async function handleNPCSave(npc, isEdit) {
  const state = window.__appState;
  if (!Array.isArray(state.customNPCs)) state.customNPCs = [];
  if (!Array.isArray(state.deletedBuiltinNPCIds)) state.deletedBuiltinNPCIds = [];
  const builtinIds = new Set(initialData.npcs.map(n => n.id));

  const factionId = ensureFactionFromName(state, npc.factionName) ?? npc.factionId ?? null;
  const normalizedNPC = {
    ...npc,
    factionId,
    factionName: undefined
  };

  if (isEdit) {
    const idx = state.customNPCs.findIndex(n => n.id === normalizedNPC.id);
    if (idx >= 0) state.customNPCs[idx] = normalizedNPC;
    else if (builtinIds.has(normalizedNPC.id)) {
      state.deletedBuiltinNPCIds = state.deletedBuiltinNPCIds.filter(id => id !== normalizedNPC.id);
      const builtinIdx = state.npcs.findIndex(n => n.id === normalizedNPC.id);
      if (builtinIdx >= 0) state.npcs[builtinIdx] = normalizedNPC;
    } else {
      state.customNPCs.push(normalizedNPC);
    }
  } else {
    state.customNPCs.push(normalizedNPC);
    // Ensure faction rep exists for new NPC's faction
    if (normalizedNPC.factionId && !(normalizedNPC.factionId in state.player.reputation)) {
      state.player.reputation[normalizedNPC.factionId] = 20;
    }
  }

  mergeCustomNPCs(state);
  syncTrustRespectCaps(state);
  syncReadinessFromState(state);
  syncFactionsFromNPCs(state);
  saveState(state);
  await persistFactions(state.factions);
  await persistNPC(normalizedNPC, state.customNPCs);
  render(state);
}

// ── NPC delete callback ───────────────────────────────────────────────────────

async function handleNPCDelete(npcId) {
  const state = window.__appState;
  if (!Array.isArray(state.customNPCs)) state.customNPCs = [];
  if (!Array.isArray(state.deletedBuiltinNPCIds)) state.deletedBuiltinNPCIds = [];

  const builtinIds = new Set(initialData.npcs.map(n => n.id));
  if (builtinIds.has(npcId)) {
    if (!state.deletedBuiltinNPCIds.includes(npcId)) {
      state.deletedBuiltinNPCIds.push(npcId);
    }
    state.npcs = state.npcs.filter(n => n.id !== npcId);
  } else {
    state.customNPCs = state.customNPCs.filter(n => n.id !== npcId);
  }

  mergeCustomNPCs(state);
  syncReadinessFromState(state);
  syncFactionsFromNPCs(state);
  saveState(state);
  if (!builtinIds.has(npcId)) {
    await removePersistedNPC(npcId, state.customNPCs);
  }
  render(state);
}

// ── Faction save callback (from faction builder) ─────────────────────────────

async function handleFactionSave(factionInput, isEdit) {
  const state = window.__appState;
  if (!Array.isArray(state.factions)) state.factions = [];
  if (!state.player?.reputation) state.player.reputation = {};

  const name = String(factionInput?.name ?? "").trim();
  if (!name) throw new Error("Faction name is required");

  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom";

  const ensureFactionIdFromToken = (token) => {
    const t = String(token ?? "").trim();
    if (!t) return null;

    const byId = state.factions.find(f => f.id === t);
    if (byId) return byId.id;

    const byName = state.factions.find(f => f.name.toLowerCase() === t.toLowerCase());
    if (byName) return byName.id;

    const tokenSlug = t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "custom";
    let id = `faction_${tokenSlug}`;
    let i = 2;
    while (state.factions.some(f => f.id === id)) {
      id = `faction_${tokenSlug}_${i++}`;
    }

    state.factions.push({ id, name: t, reputation: 50, affiliatedFactions: [], hatedFactions: [] });
    if (!(id in state.player.reputation)) state.player.reputation[id] = 20;
    return id;
  };

  let baseFaction = null;
  if (isEdit && factionInput?.id) {
    baseFaction = state.factions.find(f => f.id === factionInput.id) ?? null;
  }
  if (!baseFaction) {
    baseFaction = state.factions.find(f => f.name.toLowerCase() === name.toLowerCase()) ?? null;
  }
  if (!baseFaction) {
    let id = `faction_${slugBase}`;
    let i = 2;
    while (state.factions.some(f => f.id === id)) {
      id = `faction_${slugBase}_${i++}`;
    }
    baseFaction = {
      id,
      name,
      reputation: Math.max(0, Math.min(100, Number(factionInput?.reputation ?? 50))),
      affiliatedFactions: [],
      hatedFactions: []
    };
    state.factions.push(baseFaction);
  } else {
    baseFaction.reputation = Math.max(0, Math.min(100, Number(factionInput?.reputation ?? baseFaction.reputation ?? 50)));
  }

  const affiliated = (factionInput?.affiliatedFactions ?? [])
    .map(ensureFactionIdFromToken)
    .filter(Boolean)
    .filter(id => id !== baseFaction.id);

  const affiliatedSet = new Set(affiliated);
  const hated = (factionInput?.hatedFactions ?? [])
    .map(ensureFactionIdFromToken)
    .filter(Boolean)
    .filter(id => id !== baseFaction.id && !affiliatedSet.has(id));

  baseFaction.affiliatedFactions = Array.from(new Set(affiliated));
  baseFaction.hatedFactions = Array.from(new Set(hated));

  if (!(baseFaction.id in state.player.reputation)) {
    state.player.reputation[baseFaction.id] = 20;
  }
  state.player.reputation[baseFaction.id] = baseFaction.reputation;

  saveState(state);
  await persistFactions(state.factions);
  render(state);
}

// ── Import collection helpers ────────────────────────────────────────────────

async function ensureFolderLinkedOrPrompt() {
  if (hasFileAccess()) return { ok: true };

  showToast("Waiting for folder selection…", "info");
  const result = await initFileSystem();
  if (!result.ok && result.reason !== "cancelled") {
    showToast("Could not open folder: " + result.reason, "err");
  }
  return result;
}

async function handleImportNPCs() {
  const state = window.__appState;

  if (isFileSystemSupported()) {
    const result = await ensureFolderLinkedOrPrompt();
    if (!result.ok) return;

    const loaded = await loadCharactersFromFolder();
    const existingIds = new Set((state.customNPCs ?? []).map(n => n.id));
    const newNPCs = loaded.filter(n => !existingIds.has(n.id));
    state.customNPCs = [...(state.customNPCs ?? []), ...newNPCs];
    mergeCustomNPCs(state);
    syncReadinessFromState(state);
    syncFactionsFromNPCs(state);
    saveState(state);
    saveToLocalStorage(state.customNPCs);
    await persistNPCSnapshot(state.npcs ?? []);
    render(state);
    updateImportButtonsLabel();
    showToast(`Imported ${newNPCs.length} NPC character(s)`, "ok");
  } else {
    showToast("Select one or more NPC .json files", "info");
    triggerFileInputFallback(state, "npcs");
  }
}

async function handleImportFactions() {
  const state = window.__appState;

  if (isFileSystemSupported()) {
    const result = await ensureFolderLinkedOrPrompt();
    if (!result.ok) return;

    const loadedFactions = await loadFactionsFromFolder();
    const existingFactionIds = new Set((state.factions ?? []).map(f => f.id));
    const freshFactions = loadedFactions.filter(f => !existingFactionIds.has(f.id));
    state.factions = [...(state.factions ?? []), ...freshFactions];
    for (const faction of state.factions) {
      if (!Array.isArray(faction.affiliatedFactions)) faction.affiliatedFactions = [];
      if (!Array.isArray(faction.hatedFactions)) faction.hatedFactions = [];
      if (!(faction.id in state.player.reputation)) state.player.reputation[faction.id] = 20;
    }
    syncFactionsFromNPCs(state);
    saveState(state);
    await persistFactions(state.factions);
    render(state);
    updateImportButtonsLabel();
    showToast(`Imported ${freshFactions.length} faction(s)`, "ok");
  } else {
    showToast("Select one or more faction .json files", "info");
    triggerFileInputFallback(state, "factions");
  }
}

// ── <input type="file"> fallback (works on file:// and all browsers) ──────────

function triggerFileInputFallback(state, kind) {
  const input = document.createElement("input");
  input.type     = "file";
  input.accept   = ".json,application/json";
  input.multiple = true;
  input.style.display = "none";

  input.addEventListener("change", async () => {
    const files  = Array.from(input.files ?? []);
    const loadedNPCs = [];
    const loadedFactions = [];
    let importedSnapshotState = null;
    let importedNpcCount = 0;
    let importedFactionCount = 0;

    for (const file of files) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Accept full state export payload
        if (
          data &&
          data.format === "npc_simulator_state_v1" &&
          data.state &&
          Array.isArray(data.state.npcs)
        ) {
          importedSnapshotState = data.state;
          continue;
        }

        if ((kind === "npcs" || !kind) && data && data.format === "npc_collection_v1" && Array.isArray(data.npcs)) {
          for (const npc of data.npcs) {
            if (npc && typeof npc.id === "string" && typeof npc.name === "string") {
              loadedNPCs.push(npc);
            }
          }
          continue;
        }

        if ((kind === "factions" || !kind) && data && data.format === "faction_collection_v1" && Array.isArray(data.factions)) {
          for (const faction of data.factions) {
            if (faction && typeof faction.id === "string" && typeof faction.name === "string") {
              loadedFactions.push(faction);
            }
          }
          continue;
        }

        // Accept legacy single object OR array, routed by requested import kind
        const candidates = Array.isArray(data) ? data : [data];
        for (const item of candidates) {
          if (item && typeof item.id === "string" && typeof item.name === "string") {
            if (kind === "factions" || (!kind && (typeof item.reputation === "number" || Array.isArray(item.affiliatedFactions) || Array.isArray(item.hatedFactions)) && !item.role)) {
              loadedFactions.push(item);
            } else if (kind === "npcs" || item.role || Array.isArray(item.stats)) {
              loadedNPCs.push(item);
            } else {
              loadedNPCs.push(item);
            }
          }
        }
      } catch (e) {
        console.warn("[main] Could not parse:", file.name, e);
      }
    }

    if (importedSnapshotState) {
      const next = importedSnapshotState;
      if (!Array.isArray(next.customNPCs)) next.customNPCs = [];

      mergeCustomNPCs(next);
      syncReadinessFromState(next);
      syncFactionsFromNPCs(next);
      saveState(next);
      saveToLocalStorage(next.customNPCs);
      await persistFactions(next.factions ?? []);

      window.__appState = next;
      updateBuilderState(next);
      updateFactionBuilderState(next);
      render(next);

      showToast("Imported full session state", "ok");
      input.remove();
      return;
    }

    if (loadedNPCs.length) {
      const existingIds = new Set((state.customNPCs ?? []).map(n => n.id));
      const fresh = loadedNPCs.filter(n => !existingIds.has(n.id));
      importedNpcCount = fresh.length;
      state.customNPCs = [...(state.customNPCs ?? []), ...fresh];
      mergeCustomNPCs(state);
      syncReadinessFromState(state);
      syncFactionsFromNPCs(state);
      saveState(state);
      saveToLocalStorage(state.customNPCs);
      await persistNPCSnapshot(state.npcs ?? []);
      render(state);
    }

    if (loadedFactions.length) {
      const existingFactionIds = new Set((state.factions ?? []).map(f => f.id));
      const freshFactions = loadedFactions.filter(f => !existingFactionIds.has(f.id));
      importedFactionCount = freshFactions.length;
      state.factions = [...(state.factions ?? []), ...freshFactions];
      for (const faction of state.factions) {
        if (!Array.isArray(faction.affiliatedFactions)) faction.affiliatedFactions = [];
        if (!Array.isArray(faction.hatedFactions)) faction.hatedFactions = [];
        if (!(faction.id in state.player.reputation)) state.player.reputation[faction.id] = 20;
      }
      syncFactionsFromNPCs(state);
      saveState(state);
      await persistFactions(state.factions);
      render(state);
    }

    if (loadedNPCs.length || loadedFactions.length) {
      showToast(`Imported ${importedNpcCount} character(s) and ${importedFactionCount} faction(s)`, "ok");
    } else if (files.length) {
      showToast("No valid NPC or faction data found in selected files", "err");
    }

    input.remove();
  });

  document.body.appendChild(input);
  input.click();
}

// ── Update import button labels ──────────────────────────────────────────────

function updateImportButtonsLabel() {
  const npcsBtn = document.getElementById("btn-import-npcs");
  const factionsBtn = document.getElementById("btn-import-factions");
  const folderName = getFolderName();

  for (const btn of [npcsBtn, factionsBtn]) {
    if (!btn) continue;
    if (hasFileAccess()) {
      btn.title = `Folder linked: ${folderName ?? "linked"}`;
    } else if (isFileSystemSupported()) {
      btn.title = "Pick a folder to load/save files";
    } else {
      btn.title = "Select JSON files to import (running from file://)";
    }
  }
}

// ── Simple toast notifications ────────────────────────────────────────────────

let _toastTimer = null;

function showToast(msg, type = "info") {
  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }

  clearTimeout(_toastTimer);
  toast.textContent = msg;
  toast.className = `app-toast app-toast-${type} app-toast-show`;

  _toastTimer = setTimeout(() => {
    toast.classList.remove("app-toast-show");
  }, 3000);
}

// ── Wire toolbar ──────────────────────────────────────────────────────────────

function wireToolbar(state) {
  const importNpcBtn = document.getElementById("btn-import-npcs");
  if (importNpcBtn) {
    importNpcBtn.addEventListener("click", handleImportNPCs);
  }

  const importFactionBtn = document.getElementById("btn-import-factions");
  if (importFactionBtn) {
    importFactionBtn.addEventListener("click", handleImportFactions);
  }

  const builderBtn = document.getElementById("btn-open-builder");
  if (builderBtn) {
    builderBtn.addEventListener("click", () => {
      openCreateModal();
    });
  }

  const factionBuilderBtn = document.getElementById("btn-open-faction-builder");
  if (factionBuilderBtn) {
    factionBuilderBtn.addEventListener("click", () => {
      openFactionCreateModal();
    });
  }

  const exportBtn = document.getElementById("btn-export-npcs");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      exportNpcAndFactionFiles(state);
      showToast(`Exported NPC and faction files (${(state.npcs ?? []).length} NPCs, ${(state.factions ?? []).length} factions)`, "ok");
    });
  }

  const themeBtn = document.getElementById("btn-theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const current = document.body.dataset.theme === "light" ? "light" : "dark";
      applyTheme(current === "light" ? "dark" : "light");
    });
  }

  const resetBtn = document.getElementById("btn-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Reset ALL data (built-in NPCs + custom characters) to defaults?")) return;
      clearState();
      localStorage.removeItem("custom_npcs");
      localStorage.removeItem("custom_npcs_folder_name");
      localStorage.removeItem("custom_factions");
      const fresh = deepClone(initialData);
      fresh.customNPCs = [];
      fresh.deletedBuiltinNPCIds = [];
      saveState(fresh);
      await persistFactions(fresh.factions ?? []);
      window.__appState = fresh;
      updateBuilderState(fresh);
      updateFactionBuilderState(fresh);
      render(fresh);
      updateImportButtonsLabel();
      showToast("Data reset to defaults", "ok");
    });
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  loadTheme();

  // 1. Load or create state
  let state = loadState();
  if (!state) state = deepClone(initialData);
  // Keep core system config up to date for existing saved states.
  state.system = deepClone(initialData.system);
  if (!Array.isArray(state.customNPCs)) state.customNPCs = [];
  if (!Array.isArray(state.deletedBuiltinNPCIds)) state.deletedBuiltinNPCIds = [];

  const lsFactions = loadFactionsFromLocalStorage();
  if (lsFactions.length > 0) {
    state.factions = lsFactions;
  }
  for (const f of (state.factions ?? [])) {
    if (!Array.isArray(f.affiliatedFactions)) f.affiliatedFactions = [];
    if (!Array.isArray(f.hatedFactions)) f.hatedFactions = [];
    if (!(f.id in state.player.reputation)) state.player.reputation[f.id] = 20;
  }

  // 2. Merge localStorage custom NPCs into state.customNPCs
  const lsNPCs = loadFromLocalStorage();
  if (lsNPCs.length > 0) {
    const existingIds = new Set(state.customNPCs.map(n => n.id));
    const fresh = lsNPCs.filter(n => !existingIds.has(n.id));
    state.customNPCs = [...state.customNPCs, ...fresh];
  }

  // 3. Merge into state.npcs and persist
  mergeCustomNPCs(state);
  syncReadinessFromState(state);
  syncFactionsFromNPCs(state);
  saveState(state);

  // 4. Expose globally
  window.__appState = state;

  // 5. Expose edit/delete helpers so ui.js card buttons can reach them
  window.__openEditModal   = (npc) => openEditModal(npc);
  window.__handleNPCDelete = (id)  => handleNPCDelete(id);
  window.__persistNPCSnapshot = async () => persistNPCSnapshot(window.__appState?.npcs ?? []);
  window.__persistFactions = async () => persistFactions(window.__appState?.factions ?? []);
  window.__openFactionCreateModal = () => openFactionCreateModal();
  window.__openFactionEditModal = (faction) => openFactionEditModal(faction);

  // 6. Init character builder (attaches modal to DOM)
  initCharacterBuilder(state, {
    onSave:   handleNPCSave,
    onDelete: handleNPCDelete
  });

  initFactionBuilder(state, {
    onSave: handleFactionSave
  });

  // 7. Render and wire UI
  render(state);
  wireToolbar(state);
  updateImportButtonsLabel();

  // 8. Show a hint if running from file:// about FS API limitation
  if (location.protocol === "file:") {
    console.info(
      "[NPC Simulator] Running from file://. File System Access API is disabled by the browser.\n" +
      "Import uses <input type='file'> fallback. To enable folder sync, serve via: npx serve ."
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
