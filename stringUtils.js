// stringUtils.js - String manipulation utilities

/**
 * Parse comma-separated values into array
 * @param {string} input
 * @returns {string[]}
 */
export function parseCommaSeparated(input = "") {
  return String(input)
    .trim()
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * Parse faction references (names or IDs) - resolve to IDs
 * @param {string} input
 * @param {Function} resolver - Function to resolve name/ID to faction ID
 * @returns {string[]}
 */
export function parseFactionReferences(input = "", resolver) {
  const raw = parseCommaSeparated(input);
  return raw
    .map(ref => resolver(ref))
    .filter(Boolean);
}

/**
 * Derive faction title from ID
 * @param {string} id
 * @returns {string}
 */
export function titleFromFactionId(id = "") {
  return String(id)
    .replace(/^faction[_-]?/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()) || "Unknown Faction";
}

/**
 * Generate unique ID
 * @returns {string}
 */
export function genId() {
  return "npc_" + Math.random().toString(36).slice(2, 8) + "_" + Date.now().toString(36);
}

/**
 * Capitalize first letter
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str = "") {
  const s = String(str);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Deep clone object using JSON
 * @param {*} obj
 * @returns {*}
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Merge objects deeply (shallow merge of first level)
 * @param {object} target
 * @param {object} source
 * @returns {object}
 */
export function mergeObjects(target = {}, source = {}) {
  return { ...target, ...source };
}
