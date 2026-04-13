// fileSystem.js — File System Access API + localStorage fallback
// NOTE: showDirectoryPicker requires HTTP/HTTPS (not file://).
//       We detect this and fall back gracefully on file:// origins.

const LS_KEY_NPCS   = "custom_npcs";
const LS_KEY_FOLDER = "custom_npcs_folder_name";
const LS_KEY_NPC_SNAPSHOT = "npc_state_snapshot";
const LS_KEY_FACTIONS = "custom_factions";

let _dirHandle   = null;
let _charsHandle = null;
let _factionsHandle = null;

let _fileIOQueue = Promise.resolve();
let _pendingFileIO = 0;

function enqueueFileIO(task) {
  _pendingFileIO += 1;

  const run = async () => {
    try {
      return await task();
    } finally {
      _pendingFileIO = Math.max(0, _pendingFileIO - 1);
    }
  };

  _fileIOQueue = _fileIOQueue.then(run, run);
  return _fileIOQueue;
}

export function getPendingIOCount() {
  return _pendingFileIO;
}

export async function flushFileIOQueue() {
  await _fileIOQueue;
}

function loadJsonFromLocalStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveJsonToLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
  } catch (e) {
    console.warn(`[fileSystem] saveJsonToLocalStorage(${key}):`, e);
  }
}

async function loadJsonFromFile(fileName, collectionKey = null) {
  return enqueueFileIO(async () => {
    if (!_dirHandle) return [];
    try {
      const fh = await _dirHandle.getFileHandle(fileName, { create: false });
      const file = await fh.getFile();
      const parsed = JSON.parse(await file.text());
      if (collectionKey && parsed && Array.isArray(parsed[collectionKey])) return parsed[collectionKey];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });
}

async function persistJsonToFile(fileName, value, collectionKey = null) {
  return enqueueFileIO(async () => {
    if (!_dirHandle) return;
    try {
      const fh = await _dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fh.createWritable();
      const payload = collectionKey ? { [collectionKey]: Array.isArray(value) ? value : [] } : value;
      await writable.write(JSON.stringify(payload, null, 2));
      await writable.close();
    } catch (e) {
      console.warn(`[fileSystem] persistJsonToFile(${fileName}):`, e);
    }
  });
}

// ── Feature detection ─────────────────────────────────────────────────────────

/** True only when the API exists AND we are on a served origin (http/https) */
export function isFileSystemSupported() {
  const isServed = location.protocol === "http:" || location.protocol === "https:";
  return isServed && typeof window.showDirectoryPicker === "function";
}

export function hasFileAccess() {
  return _charsHandle !== null || _factionsHandle !== null;
}

export function getFolderName() {
  if (_dirHandle) return _dirHandle.name;
  return localStorage.getItem(LS_KEY_FOLDER) ?? null;
}

// ── Directory picker ──────────────────────────────────────────────────────────

/**
 * Prompt user to pick a directory (HTTP/HTTPS only).
 * Returns { ok: true } or { ok: false, reason: string }
 */
export async function initFileSystem() {
  if (!isFileSystemSupported()) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    _dirHandle   = await window.showDirectoryPicker({ mode: "readwrite" });
    _charsHandle = await _dirHandle.getDirectoryHandle("characters", { create: true });
    _factionsHandle = await _dirHandle.getDirectoryHandle("factions", { create: true });
    localStorage.setItem(LS_KEY_FOLDER, _dirHandle.name);
    return { ok: true };
  } catch (err) {
    if (err.name === "AbortError") return { ok: false, reason: "cancelled" };
    console.warn("[fileSystem] initFileSystem error:", err);
    return { ok: false, reason: err.message ?? "unknown error" };
  }
}

// ── Load from folder ──────────────────────────────────────────────────────────

export async function loadCharactersFromFolder() {
  return enqueueFileIO(async () => {
    if (!_charsHandle) return [];
    const npcs = [];
    try {
      for await (const [name, handle] of _charsHandle.entries()) {
        if (handle.kind === "file" && name.endsWith(".json")) {
          try {
            const file = await handle.getFile();
            const npc  = JSON.parse(await file.text());
            if (npc && npc.id) npcs.push(npc);
          } catch (e) {
            console.warn(`[fileSystem] Skipping bad file ${name}:`, e);
          }
        }
      }
    } catch (e) {
      console.warn("[fileSystem] loadCharactersFromFolder:", e);
    }
    return npcs;
  });
}

export async function loadFactionsFromFolder() {
  return enqueueFileIO(async () => {
    if (!_factionsHandle) return [];
    const factions = [];
    try {
      for await (const [name, handle] of _factionsHandle.entries()) {
        if (handle.kind === "file" && name.endsWith(".json")) {
          try {
            const file = await handle.getFile();
            const faction = JSON.parse(await file.text());
            if (faction && faction.id) factions.push(faction);
          } catch (e) {
            console.warn(`[fileSystem] Skipping bad faction file ${name}:`, e);
          }
        }
      }
    } catch (e) {
      console.warn("[fileSystem] loadFactionsFromFolder:", e);
    }
    return factions;
  });
}

// ── Save to file ──────────────────────────────────────────────────────────────

export async function saveCharacterToFile(npc) {
  return enqueueFileIO(async () => {
    if (!_charsHandle) return false;
    try {
      const fh  = await _charsHandle.getFileHandle(`${npc.id}.json`, { create: true });
      const writable = await fh.createWritable();
      await writable.write(JSON.stringify(npc, null, 2));
      await writable.close();
      return true;
    } catch (e) {
      console.warn("[fileSystem] saveCharacterToFile:", e);
      return false;
    }
  });
}

// ── Delete from file ──────────────────────────────────────────────────────────

export async function deleteCharacterFile(npcId) {
  return enqueueFileIO(async () => {
    if (!_charsHandle) return false;
    try {
      await _charsHandle.removeEntry(`${npcId}.json`);
      return true;
    } catch (_) {
      return false;
    }
  });
}

export async function saveFactionToFile(faction) {
  return enqueueFileIO(async () => {
    if (!_factionsHandle) return false;
    try {
      const fh = await _factionsHandle.getFileHandle(`${faction.id}.json`, { create: true });
      const writable = await fh.createWritable();
      await writable.write(JSON.stringify(faction, null, 2));
      await writable.close();
      return true;
    } catch (e) {
      console.warn("[fileSystem] saveFactionToFile:", e);
      return false;
    }
  });
}

export async function deleteFactionFile(factionId) {
  return enqueueFileIO(async () => {
    if (!_factionsHandle) return false;
    try {
      await _factionsHandle.removeEntry(`${factionId}.json`);
      return true;
    } catch (_) {
      return false;
    }
  });
}

// ── localStorage fallback ─────────────────────────────────────────────────────

export function loadFromLocalStorage() {
  return loadJsonFromLocalStorage(LS_KEY_NPCS);
}

export function saveToLocalStorage(npcs) {
  saveJsonToLocalStorage(LS_KEY_NPCS, npcs);
}

export function saveNPCSnapshotToLocalStorage(npcs) {
  saveJsonToLocalStorage(LS_KEY_NPC_SNAPSHOT, npcs);
}

export function loadFactionsFromLocalStorage() {
  return loadJsonFromLocalStorage(LS_KEY_FACTIONS);
}

export function saveFactionsToLocalStorage(factions) {
  saveJsonToLocalStorage(LS_KEY_FACTIONS, factions);
}

export async function persistFactions(factions) {
  const safeFactions = Array.isArray(factions) ? factions : [];
  if (_factionsHandle) {
    const keep = new Set();
    for (const faction of safeFactions) {
      if (!faction?.id) continue;
      keep.add(`${faction.id}.json`);
      await saveFactionToFile(faction);
    }
    try {
      await enqueueFileIO(async () => {
        for await (const [name, handle] of _factionsHandle.entries()) {
          if (handle.kind === "file" && name.endsWith(".json") && !keep.has(name)) {
            await _factionsHandle.removeEntry(name);
          }
        }
      });
    } catch (e) {
      console.warn("[fileSystem] persistFactions cleanup:", e);
    }
  }
  saveFactionsToLocalStorage(safeFactions);
}

// ── Unified helpers ───────────────────────────────────────────────────────────

export async function persistNPC(npc, allCustomNPCs) {
  if (hasFileAccess()) {
    await saveCharacterToFile(npc);
  }
  // Always also keep localStorage in sync as a safety net
  saveToLocalStorage(allCustomNPCs);
}

export async function removePersistedNPC(npcId, allCustomNPCs) {
  if (hasFileAccess()) {
    await deleteCharacterFile(npcId);
  }
  saveToLocalStorage(allCustomNPCs);
}

/**
 * Persist a live snapshot of all NPCs after gameplay actions.
 * - With folder access: writes /characters/npc_state.json
 * - Always: mirrors snapshot to localStorage fallback
 */
export async function persistNPCSnapshot(npcs) {
  const safeNPCs = Array.isArray(npcs) ? npcs : [];

  await persistJsonToFile("npc_state.json", safeNPCs);
  saveNPCSnapshotToLocalStorage(safeNPCs);
}

// ── Export download ───────────────────────────────────────────────────────────

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
    style: "display:none"
  });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
}

export function exportNpcAndFactionFiles(state) {
  const stamp = Date.now();
  const npcs = Array.isArray(state?.npcs) ? state.npcs : [];
  const factions = Array.isArray(state?.factions) ? state.factions : [];

  downloadJson(`npc_export_${stamp}.json`, {
    format: "npc_collection_v1",
    exportedAt: new Date().toISOString(),
    npcs
  });

  setTimeout(() => {
    downloadJson(`faction_export_${stamp}.json`, {
      format: "faction_collection_v1",
      exportedAt: new Date().toISOString(),
      factions
    });
  }, 150);
}
