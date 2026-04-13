// mathUtils.js - Mathematical and numeric utility functions

/**
 * Clamp value between min and max
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Clamp value within range
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampRange(value, min, max) {
  const n = Number(value);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Convert to integer with fallback
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
export function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

/**
 * Normalize trait value (0-100 to 0-1)
 * @param {number} value
 * @returns {number}
 */
export function normalizeTrait(value) {
  return clamp(Number(value ?? 50), 0, 100) / 100;
}

/**
 * Get random factor for variation
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomFactor(min = 0.9, max = 1.1) {
  return min + Math.random() * (max - min);
}

/**
 * Roll inclusive integer between min and max
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function rollInclusive(min, max) {
  const safeMin = Math.floor(min);
  const safeMax = Math.floor(max);
  const range = safeMax - safeMin + 1;
  return Math.floor(Math.random() * range) + safeMin;
}

/**
 * Get sign of number (-1, 0, or 1)
 * @param {number} n
 * @returns {-1|0|1}
 */
export function signOf(n) {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

/**
 * Interpolate between values
 * @param {number} a
 * @param {number} b
 * @param {number} t - 0 to 1
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Normalize value to 0-1 range
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function normalize(value, min, max) {
  return clamp((value - min) / (max - min), 0, 1);
}
