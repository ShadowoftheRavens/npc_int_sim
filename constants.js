// constants.js - Centralized configuration and constants

export const THEME = {
  KEY: "npc_theme_mode",
  MODES: { LIGHT: "light", DARK: "dark" }
};

export const STORAGE_KEYS = {
  CUSTOM_NPCS: "custom_npcs",
  CUSTOM_NPCS_FOLDER_NAME: "custom_npcs_folder_name",
  CUSTOM_FACTIONS: "custom_factions",
  STATE: "npc_state"
};

export const MODAL_IDS = {
  CHARACTER: "cb-overlay",
  FACTION: "fb-overlay",
  GENERAL_CONFIG: "gc-overlay",
  NOTES: "notes-overlay"
};

export const UI_CLASS_NAMES = {
  OPEN: "cb-open",
  FLASH_POSITIVE: "flash-positive",
  FLASH_NEGATIVE: "flash-negative"
};

export const DEFAULT_STATS = ["trust", "fear", "respect", "readiness"];

export const STAT_RANGES = {
  trust: { min: -100, max: 100 },
  fear: { min: 0, max: 100 },
  respect: { min: 0, max: 100 },
  readiness: { min: 0, max: 100 }
};

export const MEMORY_LIMIT = 20;

export const CLAMP_DEFAULTS = {
  MIN: 0,
  MAX: 100
};

export const TOAST_DURATION = 3000;

export const CONFIRMATION_MESSAGES = {
  DELETE_NPC: (name) => `Delete "${name}"? This cannot be undone.`,
  RESET_DATA: "Reset ALL data (built-in NPCs + custom characters) to defaults?"
};

export const ERROR_MESSAGES = {
  NPC_NOT_FOUND: (id) => `[npcEngine] NPC not found: ${id}`,
  ACTION_NOT_FOUND: (id) => `[npcEngine] Action not found: ${id}`,
  SAVE_FAILED: (err) => `Save failed: ${err?.message ?? String(err)}`,
  DELETE_FAILED: (err) => `Delete failed: ${err?.message ?? String(err)}`
};

export const SUCCESS_MESSAGES = {
  DATA_RESET: "Data reset to defaults",
  NOTES_SAVED: "Notes saved",
  CONFIG_SAVED: "Config saved"
};
