// modalBase.js - Base class for modal builders

import { qs, addClass, removeClass, addEventListener, setVisible } from "./domUtils.js";

/**
 * Base class for modal dialogs
 * Handles common modal lifecycle, error display, and event wiring
 */
export class ModalBase {
  constructor(config = {}) {
    this.overlayId = config.overlayId;
    this.headingId = config.headingId;
    this.errBoxId = config.errBoxId ?? config.overlayId?.replace("-overlay", "-err-box");
    this.closeSelectors = [".cb-x", ".cb-cancel"];
    this.appState = null;
    this.onSave = null;
    this.built = false;
  }

  /**
   * Initialize modal with app state and callbacks
   */
  init(appState, callbacks = {}) {
    this.appState = appState;
    this.onSave = callbacks.onSave;
    this.buildModal();
  }

  /**
   * Build modal DOM (override in subclass)
   */
  buildModal() {
    if (this.built || !document.body) return;
    this.built = true;
    
    const el = document.createElement("div");
    el.id = this.overlayId;
    el.className = "cb-overlay";
    el.innerHTML = this.getHTML();
    document.body.appendChild(el);
    
    this.wireEvents();
  }

  /**
   * Get modal HTML (override in subclass)
   */
  getHTML() {
    return "";
  }

  /**
   * Wire up event listeners
   */
  wireEvents() {
    const overlay = qs(this.overlayId);
    if (!overlay) return;

    // Close button handlers
    this.closeSelectors.forEach(selector => {
      const el = overlay.querySelector(selector);
      if (el) {
        addEventListener(el, "click", () => this.close());
      }
    });

    // Overlay click outside to close
    addEventListener(overlay, "mousedown", (e) => {
      if (e.target === overlay) this.close();
    });

    // Escape key to close
    addEventListener(document, "keydown", (e) => {
      if (e.key === "Escape" && this.isOpen()) this.close();
    });
  }

  /**
   * Show error messages
   */
  showErrors(errors = []) {
    const errBox = qs(this.errBoxId);
    if (!errBox) return;

    if (errors.length === 0) {
      this.clearErrors();
      return;
    }

    errBox.innerHTML = errors
      .map(err => `<div>⚠ ${err}</div>`)
      .join("");
    setVisible(errBox, true);
  }

  /**
   * Clear all error messages
   */
  clearErrors() {
    const errBox = qs(this.errBoxId);
    if (!errBox) return;
    errBox.innerHTML = "";
    setVisible(errBox, false);
  }

  /**
   * Open modal
   */
  open() {
    if (!this.built) this.buildModal();
    const overlay = qs(this.overlayId);
    if (overlay) addClass(overlay, "cb-open");
  }

  /**
   * Close modal
   */
  close() {
    const overlay = qs(this.overlayId);
    if (overlay) removeClass(overlay, "cb-open");
  }

  /**
   * Check if modal is open
   */
  isOpen() {
    const overlay = qs(this.overlayId);
    return overlay?.classList.contains("cb-open") ?? false;
  }

  /**
   * Update app state reference
   */
  updateState(newState) {
    this.appState = newState;
  }
}
