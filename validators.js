// validators.js - Centralized validation logic

/**
 * Validate required string field
 * @param {string} value
 * @param {string} fieldName
 * @returns {string|null} Error message or null if valid
 */
export function validateRequired(value, fieldName) {
  if (!String(value ?? "").trim()) {
    return `${fieldName} is required.`;
  }
  return null;
}

/**
 * Validate numeric range
 * @param {number} min
 * @param {number} max
 * @param {string} fieldName
 * @returns {string|null} Error message or null if valid
 */
export function validateNumericRange(min, max, fieldName = "Range") {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return `Invalid numeric range for ${fieldName}.`;
  }
  if (min > max) {
    return `Min value cannot be greater than max value for ${fieldName}.`;
  }
  return null;
}

/**
 * Validate NPC data
 * @param {object} npc
 * @returns {string[]} Array of error messages
 */
export function validateNPC(npc) {
  const errors = [];
  
  let err = validateRequired(npc?.name, "Name");
  if (err) errors.push(err);
  
  err = validateRequired(npc?.role, "Role");
  if (err) errors.push(err);
  
  err = validateRequired(npc?.factionName, "Faction");
  if (err) errors.push(err);
  
  return errors;
}

/**
 * Validate general config
 * @param {object} config
 * @returns {string[]} Array of error messages
 */
export function validateConfig(cfg) {
  const errors = [];
  
  if (!Array.isArray(cfg?.actions) || cfg.actions.length === 0) {
    errors.push("At least one action is required.");
    return errors;
  }

  for (const action of cfg.actions) {
    if (!action.id) {
      errors.push("Each action must have an id.");
    }
    
    for (const [stat, range] of Object.entries(action.ranges ?? {})) {
      const err = validateNumericRange(range.min, range.max, `${action.id}/${stat}`);
      if (err) errors.push(err);
    }
  }

  return errors;
}

/**
 * Validate faction data
 * @param {object} faction
 * @returns {string[]} Array of error messages
 */
export function validateFaction(faction) {
  const errors = [];
  
  let err = validateRequired(faction?.name, "Faction name");
  if (err) errors.push(err);
  
  if (!Number.isFinite(faction?.reputation)) {
    errors.push("Invalid reputation value.");
  }
  
  return errors;
}
