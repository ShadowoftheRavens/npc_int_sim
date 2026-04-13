// arrayUtils.js - Array and collection utilities

/**
 * Deduplicate array
 * @param {Array} arr
 * @returns {Array}
 */
export function deduplicate(arr = []) {
  return [...new Set(arr)];
}

/**
 * Find item in array by property
 * @param {Array} arr
 * @param {string} prop
 * @param {*} value
 * @returns {*|null}
 */
export function findByProp(arr = [], prop, value) {
  return arr.find(item => item?.[prop] === value) ?? null;
}

/**
 * Filter array by property value
 * @param {Array} arr
 * @param {string} prop
 * @param {*} value
 * @returns {Array}
 */
export function filterByProp(arr = [], prop, value) {
  return arr.filter(item => item?.[prop] === value);
}

/**
 * Map array to single property
 * @param {Array} arr
 * @param {string} prop
 * @returns {Array}
 */
export function mapToProp(arr = [], prop) {
  return arr.map(item => item?.[prop]).filter(item => item != null);
}

/**
 * Remove duplicates from array of objects by property
 * @param {Array} arr
 * @param {string} prop
 * @returns {Array}
 */
export function deduplicateByProp(arr = [], prop) {
  const seen = new Set();
  return arr.filter(item => {
    const val = item?.[prop];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

/**
 * Remove item from array
 * @param {Array} arr
 * @param {*} item
 * @returns {Array}
 */
export function remove(arr = [], item) {
  const idx = arr.indexOf(item);
  if (idx > -1) arr.splice(idx, 1);
  return arr;
}

/**
 * Remove item from array by property
 * @param {Array} arr
 * @param {string} prop
 * @param {*} value
 * @returns {Array}
 */
export function removeByProp(arr = [], prop, value) {
  const idx = arr.findIndex(item => item?.[prop] === value);
  if (idx > -1) arr.splice(idx, 1);
  return arr;
}

/**
 * Chunk array into smaller arrays
 * @param {Array} arr
 * @param {number} size
 * @returns {Array[]}
 */
export function chunk(arr = [], size = 1) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get first item of array
 * @param {Array} arr
 * @returns {*|null}
 */
export function first(arr = []) {
  return arr[0] ?? null;
}

/**
 * Get last item of array
 * @param {Array} arr
 * @returns {*|null}
 */
export function last(arr = []) {
  return arr[arr.length - 1] ?? null;
}

/**
 * Check if any item matches condition
 * @param {Array} arr
 * @param {Function} predicate
 * @returns {boolean}
 */
export function some(arr = [], predicate) {
  return arr.some(predicate);
}

/**
 * Check if all items match condition
 * @param {Array} arr
 * @param {Function} predicate
 * @returns {boolean}
 */
export function every(arr = [], predicate) {
  return arr.every(predicate);
}
