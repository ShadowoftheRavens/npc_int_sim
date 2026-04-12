// storage.js — Persist and load state via localStorage

const STORAGE_KEY = "npc_simulator_state";

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
 * @param {object} state
 */
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[storage] Failed to save state:", e);
  }
}

/**
 * Clear stored state.
 */
export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
