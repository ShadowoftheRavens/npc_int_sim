// uiNotifications.js - Toast/notification management

import { TOAST_DURATION } from "./constants.js";

/**
 * Show toast notification
 * @param {string} message
 * @param {string} type - 'ok', 'err', 'info'
 * @param {number} duration
 */
export function showToast(message, type = "info", duration = TOAST_DURATION) {
  const toast = document.createElement("div");
  toast.className = `app-toast app-toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    z-index: 10000;
    padding: 0.75rem 1.2rem;
    border-radius: 6px;
    border: 1px solid;
    font-size: 0.85rem;
  `;

  document.body.appendChild(toast);

  // Trigger reflow to enable transition
  void toast.offsetWidth;
  toast.classList.add("app-toast-show");

  setTimeout(() => {
    toast.classList.remove("app-toast-show");
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

/**
 * Show successful toast
 */
export function showSuccess(message) {
  showToast(message, "ok");
}

/**
 * Show error toast
 */
export function showError(message) {
  showToast(message, "err");
}

/**
 * Show info toast
 */
export function showInfo(message) {
  showToast(message, "info");
}

/**
 * Confirm dialog
 * @param {string} message
 * @returns {boolean}
 */
export function confirm(message) {
  return window.confirm(message);
}
