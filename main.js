// main.js — App entry point (Phase 1 + 2 + 3)

import { initialData }                                         from "./data.js";
import { loadState, saveState, clearState, flushStorageWrites, getPendingStorageWriteCount } from "./storage.js";
import { render }                                                from "./ui.js";
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
  getFolderName,
  getPendingIOCount,
  flushFileIOQueue
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
import {
  initGeneralConfigBuilder,
  openGeneralConfigModal,
  updateGeneralConfigBuilderState
} from "./generalConfigBuilder.js";
import {
  initNotesBuilder,
  openNotesModal,
  updateNotesBuilderState
} from "./notesBuilder.js";

const THEME_KEY = "npc_theme_mode";
const DEV_MODE_KEY = "npc_dev_mode";
const MAX_UNDO_DEPTH = 40;
let _undoStack = [];

// ── Utilities ─────────────────────────────────────────────────────────────────

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function sanitizeSnapshotState(state) {
  const snapshot = deepClone(state);
  delete snapshot._npcById;
  delete snapshot._factionById;
  delete snapshot._customNpcIdSet;
  return snapshot;
}

function updateUndoButtonState() {
  const undoBtn = document.getElementById("btn-undo");
  if (!undoBtn) return;
  undoBtn.disabled = _undoStack.length === 0;
}

function pushUndoSnapshot(state) {
  if (!state) return;
  _undoStack.push(sanitizeSnapshotState(state));
  if (_undoStack.length > MAX_UNDO_DEPTH) {
    _undoStack = _undoStack.slice(-MAX_UNDO_DEPTH);
  }
  updateUndoButtonState();
}

async function undoLastAction() {
  if (_undoStack.length === 0) {
    showToast("Nothing to undo", "warn");
    updateUndoButtonState();
    return;
  }

  const restored = _undoStack.pop();
  updateUndoButtonState();
  if (!restored) return;

  restored.system = normalizeSystemConfig(restored.system);
  if (!Array.isArray(restored.customNPCs)) restored.customNPCs = [];
  if (!Array.isArray(restored.deletedBuiltinNPCIds)) restored.deletedBuiltinNPCIds = [];

  mergeCustomNPCs(restored);
  syncReadinessFromState(restored);
  syncFactionsFromNPCs(restored);
  rebuildStateIndexes(restored);

  saveState(restored);
  await window.__persistFactions?.();
  await window.__persistNPCSnapshot?.();

  window.__appState = restored;
  updateBuilderState(restored);
  updateFactionBuilderState(restored);
  updateGeneralConfigBuilderState(restored);
  updateNotesBuilderState(restored);
  render(restored);
  showToast("Undid last action", "ok");
}

function rebuildStateIndexes(state) {
  state._npcById = new Map();
  for (const npc of (state.npcs ?? [])) {
    state._npcById.set(npc.id, npc);
  }

  state._factionById = new Map();
  for (const faction of (state.factions ?? [])) {
    state._factionById.set(faction.id, faction);
  }

  state._customNpcIdSet = new Set((state.customNPCs ?? []).map(n => n.id));

  const devLike = location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (devLike) {
    const npcCount = Array.isArray(state.npcs) ? state.npcs.length : 0;
    const factionCount = Array.isArray(state.factions) ? state.factions.length : 0;

    if (state._npcById.size !== npcCount) {
      console.warn("[state] NPC index mismatch", { index: state._npcById.size, source: npcCount });
    }
    if (state._factionById.size !== factionCount) {
      console.warn("[state] Faction index mismatch", { index: state._factionById.size, source: factionCount });
    }
  }
}

function cloneDefaultSystemConfig() {
  const base = initialData.system ?? { stats: [], actions: [] };
  return {
    stats: Array.isArray(base.stats) ? [...base.stats] : [],
    actions: Array.isArray(base.actions)
      ? base.actions.map(action => ({
          ...action,
          effects: { ...(action?.effects ?? {}) },
          ranges: { ...(action?.ranges ?? {}) }
        }))
      : []
  };
}

function normalizeSystemConfig(systemInput) {
  const defaults = cloneDefaultSystemConfig();
  const source = systemInput && typeof systemInput === "object" ? systemInput : {};

  const stats = Array.isArray(source.stats) && source.stats.length > 0
    ? [...source.stats]
    : [...(defaults.stats ?? [])];

  const defaultActionsById = new Map((defaults.actions ?? []).map(action => [action.id, action]));
  const sourceActions = Array.isArray(source.actions) && source.actions.length > 0
    ? source.actions
    : (defaults.actions ?? []);

  const actions = sourceActions
    .filter(action => action && typeof action.id === "string")
    .map(action => {
      const fallback = defaultActionsById.get(action.id) ?? null;
      const effectSource = (action.effects && typeof action.effects === "object")
        ? action.effects
        : (fallback?.effects ?? {});

      const effects = {};
      for (const [stat, value] of Object.entries(effectSource)) {
        const n = Number(value);
        effects[stat] = Number.isFinite(n) ? Math.round(n) : 0;
      }

      const rangeSource = (action.ranges && typeof action.ranges === "object")
        ? action.ranges
        : (fallback?.ranges ?? {});

      const ranges = {};
      // Loop through ALL stats, not just effects keys
      for (const stat of stats) {
        const base = effects[stat] ?? 0;
        const raw = rangeSource?.[stat];
        let min = Number(raw?.min);
        let max = Number(raw?.max);

        if (!Number.isFinite(min) || !Number.isFinite(max)) {
          min = base;
          max = base;
        }

        min = Math.round(min);
        max = Math.round(max);
        if (min > max) [min, max] = [max, min];
        ranges[stat] = {
          min,
          max,
          enabled: raw?.enabled !== false
        };
      }

      return {
        id: action.id,
        label: String(action.label ?? fallback?.label ?? action.id),
        effects,
        ranges
      };
    });

  return { stats, actions };
}

function applyTheme(mode) {
  const safeMode = mode === "light" ? "light" : "dark";
  document.body.dataset.theme = safeMode;
  try {
    localStorage.setItem(THEME_KEY, safeMode);
  } catch (_) {}

  const btn = document.getElementById("btn-theme-toggle");
  if (btn) {
    btn.textContent = safeMode === "light" ? "☀ Light" : "☾ Dark";
    btn.setAttribute("aria-pressed", safeMode === "dark" ? "true" : "false");
    btn.setAttribute("aria-label", safeMode === "light" ? "Switch to dark theme" : "Switch to light theme");
  }
}

function loadTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (_) {}
  applyTheme(saved === "light" ? "light" : "dark");
}

function applyDevMode(enabled) {
  window.__devMode = Boolean(enabled);
  try {
    localStorage.setItem(DEV_MODE_KEY, enabled ? "1" : "0");
  } catch (_) {}

  const btn = document.getElementById("btn-dev-toggle");
  if (btn) {
    btn.classList.toggle("active", enabled);
    btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    btn.setAttribute("aria-label", enabled ? "Disable developer mode" : "Enable developer mode");
  }

  const perfPanel = document.querySelector(".panel-perf");
  if (perfPanel) {
    perfPanel.classList.toggle("hidden", !enabled);
  }

  const devOnlyElements = document.querySelectorAll(".dev-only");
  devOnlyElements.forEach(el => {
    el.classList.toggle("hidden", !enabled);
  });
}

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function wireKeyboardShortcuts() {
  document.addEventListener("keydown", evt => {
    if (evt.defaultPrevented || isTypingTarget(evt.target)) return;
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;

    if (evt.key === "/") {
      evt.preventDefault();
      document.getElementById("npc-search")?.focus();
      return;
    }

    const key = String(evt.key || "").toLowerCase();
    if (key === "n" && evt.shiftKey) {
      evt.preventDefault();
      openFactionCreateModal();
      return;
    }
    if (key === "n") {
      evt.preventDefault();
      openCreateModal();
      return;
    }
    if (key === "g") {
      evt.preventDefault();
      openGeneralConfigModal();
      return;
    }
    if (key === "d") {
      evt.preventDefault();
      applyDevMode(!window.__devMode);
      return;
    }
    if (key === "t") {
      evt.preventDefault();
      const current = document.body.dataset.theme === "light" ? "light" : "dark";
      applyTheme(current === "light" ? "dark" : "light");
      return;
    }
    if (key === "u") {
      evt.preventDefault();
      void undoLastAction();
    }
  });
}

function loadDevMode() {
  let saved = null;
  try {
    saved = localStorage.getItem(DEV_MODE_KEY);
  } catch (_) {}
  applyDevMode(saved === "1");
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

  const knownFactionIds = new Set((state.factions ?? []).map(f => f.id));

  for (const npc of (state.npcs ?? [])) {
    const factionId = npc?.factionId;
    if (!factionId) continue;

    if (!knownFactionIds.has(factionId)) {
      const inferredName = String(npc.factionName ?? "").trim() || titleFromFactionId(factionId);
      state.factions.push({ id: factionId, name: inferredName, reputation: 50, affiliatedFactions: [], hatedFactions: [] });
      knownFactionIds.add(factionId);
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
  rebuildStateIndexes(state);
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
  rebuildStateIndexes(state);
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

  rebuildStateIndexes(state);
  saveState(state);
  await persistFactions(state.factions);
  render(state);
}

async function handleGeneralConfigSave(systemConfig) {
  const state = window.__appState;
  state.system = normalizeSystemConfig(systemConfig);
  rebuildStateIndexes(state);
  saveState(state);
  updateGeneralConfigBuilderState(state);
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
    rebuildStateIndexes(state);
    saveState(state);
    saveToLocalStorage(state.customNPCs);
    await persistNPCSnapshot(state.npcs ?? []);
    render(state);
    updateImportButtonsLabel();
    if (newNPCs.length === 0) {
      showToast("No new NPC files found in linked folder", "warn");
    } else {
      showToast(`Imported ${newNPCs.length} NPC character(s)`, "ok");
    }
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
    rebuildStateIndexes(state);
    saveState(state);
    await persistFactions(state.factions);
    render(state);
    updateImportButtonsLabel();
    if (freshFactions.length === 0) {
      showToast("No new faction files found in linked folder", "warn");
    } else {
      showToast(`Imported ${freshFactions.length} faction(s)`, "ok");
    }
  } else {
    showToast("Select one or more faction .json files", "info");
    triggerFileInputFallback(state, "factions");
  }
}

function extractSystemConfig(payload) {
  if (!payload || typeof payload !== "object") return null;

  if (payload.format === "general_config_v1" && payload.system) {
    return payload.system;
  }

  if (Array.isArray(payload.actions)) {
    return { stats: payload.stats ?? initialData.system.stats, actions: payload.actions };
  }

  if (payload.system && Array.isArray(payload.system.actions)) {
    return payload.system;
  }

  if (
    payload.format === "npc_simulator_state_v1" &&
    payload.state?.system &&
    Array.isArray(payload.state.system.actions)
  ) {
    return payload.state.system;
  }

  return null;
}

async function handleImportGeneralConfig() {
  showToast("Select a general config JSON file", "info");

  const state = window.__appState;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.multiple = false;
  input.style.display = "none";

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      input.remove();
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const parsedSystem = extractSystemConfig(payload);
      if (!parsedSystem) {
        showToast("No valid general config found in selected file", "err");
        input.remove();
        return;
      }

      state.system = normalizeSystemConfig(parsedSystem);
      saveState(state);
      updateGeneralConfigBuilderState(state);
      render(state);
      showToast("General config imported", "ok");
    } catch (e) {
      showToast("Failed to import config: " + (e?.message ?? String(e)), "err");
    }

    input.remove();
  });

  document.body.appendChild(input);
  input.click();
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
      next.system = normalizeSystemConfig(next.system);

      mergeCustomNPCs(next);
      syncReadinessFromState(next);
      syncFactionsFromNPCs(next);
      rebuildStateIndexes(next);
      saveState(next);
      saveToLocalStorage(next.customNPCs);
      await persistFactions(next.factions ?? []);

      window.__appState = next;
      updateBuilderState(next);
      updateFactionBuilderState(next);
      updateGeneralConfigBuilderState(next);
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
      rebuildStateIndexes(state);
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
      rebuildStateIndexes(state);
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

  for (const btn of [npcsBtn, factionsBtn]) {
    if (!btn) continue;
    delete btn.dataset.tooltip;
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
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }

  const safeType = ["ok", "err", "warn", "info"].includes(type) ? type : "info";
  clearTimeout(_toastTimer);
  toast.textContent = msg;
  toast.className = `app-toast app-toast-${safeType} app-toast-show`;
  toast.setAttribute("aria-live", safeType === "err" ? "assertive" : "polite");
  toast.setAttribute("role", safeType === "err" ? "alert" : "status");

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

  const importConfigBtn = document.getElementById("btn-import-general-config");
  if (importConfigBtn) {
    importConfigBtn.addEventListener("click", handleImportGeneralConfig);
  }

  const editConfigBtn = document.getElementById("btn-edit-general-config");
  if (editConfigBtn) {
    editConfigBtn.setAttribute("aria-keyshortcuts", "G");
    editConfigBtn.addEventListener("click", () => {
      openGeneralConfigModal();
    });
  }

  const builderBtn = document.getElementById("btn-open-builder");
  if (builderBtn) {
    builderBtn.setAttribute("aria-keyshortcuts", "N");
    builderBtn.addEventListener("click", () => {
      openCreateModal();
    });
  }

  const factionBuilderBtn = document.getElementById("btn-open-faction-builder");
  if (factionBuilderBtn) {
    factionBuilderBtn.setAttribute("aria-keyshortcuts", "Shift+N");
    factionBuilderBtn.addEventListener("click", () => {
      openFactionCreateModal();
    });
  }

  const exportBtn = document.getElementById("btn-export-npcs");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      try {
        exportNpcAndFactionFiles(state);
        showToast(`Exported NPC and faction files (${(state.npcs ?? []).length} NPCs, ${(state.factions ?? []).length} factions)`, "ok");
      } catch (e) {
        showToast("Export failed: " + (e?.message ?? String(e)), "err");
      }
    });
  }

  const themeBtn = document.getElementById("btn-theme-toggle");
  if (themeBtn) {
    themeBtn.setAttribute("aria-keyshortcuts", "T");
    themeBtn.addEventListener("click", () => {
      const current = document.body.dataset.theme === "light" ? "light" : "dark";
      applyTheme(current === "light" ? "dark" : "light");
    });
  }

  const devBtn = document.getElementById("btn-dev-toggle");
  if (devBtn) {
    devBtn.setAttribute("aria-keyshortcuts", "D");
    devBtn.addEventListener("click", () => {
      applyDevMode(!window.__devMode);
    });
  }

  const undoBtn = document.getElementById("btn-undo");
  if (undoBtn) {
    undoBtn.setAttribute("aria-keyshortcuts", "U");
    undoBtn.addEventListener("click", () => {
      void undoLastAction();
    });
  }

  const resetBtn = document.getElementById("btn-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Reset ALL data (built-in NPCs + custom characters) to defaults?")) return;
      clearState();
      _undoStack = [];
      updateUndoButtonState();
      localStorage.removeItem("custom_npcs");
      localStorage.removeItem("custom_npcs_folder_name");
      localStorage.removeItem("custom_factions");
      const fresh = deepClone(initialData);
      fresh.customNPCs = [];
      fresh.deletedBuiltinNPCIds = [];
      
      // Clear all notes from NPCs on reset
      for (const npc of fresh.npcs) {
        npc.notes = "";
      }
      for (const npc of fresh.customNPCs) {
        npc.notes = "";
      }
      
      saveState(fresh);
      await persistFactions(fresh.factions ?? []);
      rebuildStateIndexes(fresh);
      window.__appState = fresh;
      updateBuilderState(fresh);
      updateFactionBuilderState(fresh);
      updateGeneralConfigBuilderState(fresh);
      updateNotesBuilderState(fresh);
      render(fresh);
      updateImportButtonsLabel();
      showToast("Data reset to defaults", "ok");
    });
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  loadTheme();
  loadDevMode();

  // 1. Load or create state
  let state = loadState();
  if (!state) state = deepClone(initialData);
  state.system = normalizeSystemConfig(state.system);
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
  rebuildStateIndexes(state);
  saveState(state);

  // 4. Expose globally
  window.__appState = state;

  // 5. Expose edit/delete helpers so ui.js card buttons can reach them
  window.__openEditModal   = (npc) => openEditModal(npc);
  window.__openNotesModal  = (npcId) => openNotesModal(npcId);
  window.__handleNPCDelete = (id)  => handleNPCDelete(id);
  window.__persistNPCSnapshot = async () => persistNPCSnapshot(window.__appState?.npcs ?? []);
  window.__persistFactions = async () => persistFactions(window.__appState?.factions ?? []);
  window.__openFactionCreateModal = () => openFactionCreateModal();
  window.__openFactionEditModal = (faction) => openFactionEditModal(faction);
  window.__pushUndoSnapshot = (snapshotState) => pushUndoSnapshot(snapshotState);
  window.__getFileQueueLength = () => Number(getPendingIOCount?.() ?? 0);
  window.__getStorageQueueLength = () => Number(getPendingStorageWriteCount?.() ?? 0);
  window.__getPersistenceQueueLength = () => {
    return window.__getFileQueueLength() + window.__getStorageQueueLength();
  };

  // 6. Init character builder (attaches modal to DOM)
  initCharacterBuilder(state, {
    onSave:   handleNPCSave,
    onDelete: handleNPCDelete
  });

  initFactionBuilder(state, {
    onSave: handleFactionSave
  });

  initGeneralConfigBuilder(state, {
    onSave: handleGeneralConfigSave
  });

  initNotesBuilder(state, async (updatedState) => {
    saveState(updatedState);
    await window.__persistNPCSnapshot?.();
    render(updatedState);
  });

  // 7. Render and wire UI
  render(state);
  wireToolbar(state);
  wireKeyboardShortcuts();
  updateUndoButtonState();
  updateImportButtonsLabel();

  // 8. Show a hint if running from file:// about FS API limitation
  if (location.protocol === "file:") {
    console.info(
      "[NPC Simulator] Running from file://. File System Access API is disabled by the browser.\n" +
      "Import uses <input type='file'> fallback. To enable folder sync, serve via: npx serve ."
    );
  }

  // 9. Ensure queued persistence drains on tab close/navigation.
  window.addEventListener("beforeunload", async () => {
    await Promise.all([
      flushStorageWrites(),
      flushFileIOQueue()
    ]);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
