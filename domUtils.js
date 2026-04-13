// domUtils.js - Common DOM utilities

/**
 * Query selector shorthand
 * @param {string} id - Element ID
 * @returns {HTMLElement|null}
 */
export function qs(id) {
  return document.getElementById(id);
}

/**
 * Query selector all shorthand
 * @param {string} selector - CSS selector
 * @returns {NodeListOf<Element>}
 */
export function qsAll(selector) {
  return document.querySelectorAll(selector);
}

/**
 * Add event listener with cleanup support
 * @param {HTMLElement} element
 * @param {string} event
 * @param {Function} handler
 * @param {object} options
 */
export function addEventListener(element, event, handler, options = {}) {
  if (!element) return;
  element.addEventListener(event, handler, options);
}

/**
 * Remove all children from element
 * @param {HTMLElement} element
 */
export function clearChildren(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Set element visibility
 * @param {HTMLElement} element
 * @param {boolean} visible
 */
export function setVisible(element, visible = true) {
  if (!element) return;
  element.style.display = visible ? "" : "none";
}

/**
 * Add class to element
 * @param {HTMLElement} element
 * @param {string} className
 */
export function addClass(element, className) {
  if (!element) return;
  element.classList.add(className);
}

/**
 * Remove class from element
 * @param {HTMLElement} element
 * @param {string} className
 */
export function removeClass(element, className) {
  if (!element) return;
  element.classList.remove(className);
}

/**
 * Toggle class on element
 * @param {HTMLElement} element
 * @param {string} className
 * @param {boolean} force - Optional force add/remove
 */
export function toggleClass(element, className, force) {
  if (!element) return;
  element.classList.toggle(className, force);
}

/**
 * Check if element has class
 * @param {HTMLElement} element
 * @param {string} className
 * @returns {boolean}
 */
export function hasClass(element, className) {
  if (!element) return false;
  return element.classList.contains(className);
}

/**
 * Set attribute on element
 * @param {HTMLElement} element
 * @param {string} attr
 * @param {string} value
 */
export function setAttribute(element, attr, value) {
  if (!element) return;
  element.setAttribute(attr, value);
}

/**
 * Get attribute from element
 * @param {HTMLElement} element
 * @param {string} attr
 * @returns {string|null}
 */
export function getAttribute(element, attr) {
  if (!element) return null;
  return element.getAttribute(attr);
}

/**
 * Focus element
 * @param {HTMLElement} element
 */
export function focus(element) {
  if (!element) return;
  element.focus();
}

/**
 * Disable element
 * @param {HTMLElement} element
 * @param {boolean} disabled
 */
export function setDisabled(element, disabled = true) {
  if (!element) return;
  element.disabled = disabled;
}
