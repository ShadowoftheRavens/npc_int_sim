// appConfig.js - Application configuration and defaults

/**
 * Application configuration object
 */
export const appConfig = {
  app: {
    name: "NPC Builder",
    version: "1.0.0",
    description: "Interactive NPC relationship simulator"
  },

  features: {
    enableFileSystem: true,
    enableLocalStorage: true,
    enableExport: true,
    enableImport: true
  },

  performance: {
    memoryLimit: 20,
    maxToastDuration: 5000,
    minToastDuration: 1000,
    debounceDelay: 300,
    throttleDelay: 100
  },

  ui: {
    animationDuration: 200,
    toastDuration: 3000,
    modalMaxWidth: "620px",
    cardMaxWidth: "400px"
  },

  stats: {
    default: ["trust", "fear", "respect", "readiness"],
    ranges: {
      trust: { min: -100, max: 100 },
      fear: { min: 0, max: 100 },
      respect: { min: 0, max: 100 },
      readiness: { min: 0, max: 100 }
    },
    defaultValues: {
      trust: 50,
      fear: 20,
      respect: 50,
      readiness: 50
    }
  },

  personality: {
    traits: ["brave", "greed", "loyalty", "aggression"],
    default: {
      brave: 50,
      greed: 50,
      loyalty: 50,
      aggression: 50
    }
  },

  actions: {
    count: 5,
    ids: ["help", "charm", "threaten", "betray", "pay"],
    defaultEnabled: true
  },

  factions: {
    minReputation: 0,
    maxReputation: 100,
    defaultReputation: 50
  }
};

/**
 * Get config value by path
 * @param {string} path - Dot-separated path (e.g., "stats.ranges.trust.max")
 * @param {*} defaultValue
 * @returns {*}
 */
export function getConfig(path, defaultValue = null) {
  const keys = String(path).split(".");
  let current = appConfig;

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return defaultValue;
    }
  }

  return current ?? defaultValue;
}

/**
 * Set config value by path
 * @param {string} path - Dot-separated path
 * @param {*} value
 */
export function setConfig(path, value) {
  const keys = String(path).split(".");
  let current = appConfig;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Reset config to defaults
 */
export function resetConfig() {
  // Reload module to reset
  location.reload();
}

/**
 * Validate config integrity
 */
export function validateConfig() {
  const errors = [];

  // Check required stats
  if (!Array.isArray(appConfig.stats.default) || appConfig.stats.default.length === 0) {
    errors.push("Stats configuration is missing");
  }

  // Check action count matches ID count
  if (appConfig.actions.count !== appConfig.actions.ids.length) {
    errors.push("Action count mismatch with IDs");
  }

  return errors;
}

/**
 * Export config for debugging
 */
export function exportConfig() {
  return JSON.stringify(appConfig, null, 2);
}
