// storage.js — Persist and load state via localStorage

const STORAGE_KEY = "npc_simulator_state";
let _stateWriteQueue = Promise.resolve();
let _pendingStorageWrites = 0;

function queueStateWrite(task) {
  _pendingStorageWrites += 1;

  const run = async () => {
    try {
      return await task();
    } finally {
      _pendingStorageWrites = Math.max(0, _pendingStorageWrites - 1);
    }
  };

  _stateWriteQueue = _stateWriteQueue.then(run, run);
  return _stateWriteQueue;
}

export function getPendingStorageWriteCount() {
  return _pendingStorageWrites;
}

/**
 * Load state from localStorage.
 * Returns parsed state object, or null if nothing stored.
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[storage] Failed to load state:", e);
    return null;
  }
}

/**
 * Save the given state object to localStorage.
 * Writes are serialized to avoid races during rapid action bursts.
 * @param {object} state
 */
export function saveState(state) {
  queueStateWrite(async () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("[storage] Failed to save state:", e);
    }
  });
}

/**
 * Clear stored state.
 */
export function clearState() {
  queueStateWrite(async () => {
    localStorage.removeItem(STORAGE_KEY);
  });
}

/**
 * Flush pending writes for safe unload.
 */
export async function flushStorageWrites() {
  await _stateWriteQueue;
}
