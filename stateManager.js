// stateManager.js - Centralized state management utilities

import { deepClone } from "./stringUtils.js";

/**
 * State manager for managing application state with change tracking
 */
export class StateManager {
  constructor(initialState = {}) {
    this.state = deepClone(initialState);
    this.listeners = new Set();
    this.history = [];
    this.historyIndex = -1;
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Update state
   */
  setState(updates) {
    const previousState = deepClone(this.state);
    this.state = { ...this.state, ...updates };
    
    // Clear history forward if we've navigated
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    // Add to history
    this.history.push(deepClone(this.state));
    this.historyIndex += 1;
    
    this.notifyListeners();
  }

  /**
   * Reset state to initial
   */
  resetState(initialState) {
    this.state = deepClone(initialState);
    this.history = [deepClone(this.state)];
    this.historyIndex = 0;
    this.notifyListeners();
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  notifyListeners() {
    this.listeners.forEach(listener => listener(this.state));
  }

  /**
   * Undo last change
   */
  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex -= 1;
      this.state = deepClone(this.history[this.historyIndex]);
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Redo last undone change
   */
  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
      this.state = deepClone(this.history[this.historyIndex]);
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Check if can undo
   */
  canUndo() {
    return this.historyIndex > 0;
  }

  /**
   * Check if can redo
   */
  canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  /**
   * Merge nested state update
   */
  mergeNested(path, updates) {
    const keys = path.split(".");
    let current = this.state;
    
    // Navigate to nested location
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    
    // Apply updates
    current[keys[keys.length - 1]] = {
      ...current[keys[keys.length - 1]],
      ...updates
    };
    
    this.notifyListeners();
  }
}

/**
 * Utility to find item in state by ID
 */
export function findById(collection = [], id) {
  return collection.find(item => item.id === id) ?? null;
}

/**
 * Utility to update item in collection
 */
export function updateInCollection(collection = [], id, updates) {
  const idx = collection.findIndex(item => item.id === id);
  if (idx > -1) {
    collection[idx] = { ...collection[idx], ...updates };
    return true;
  }
  return false;
}

/**
 * Utility to add item to collection
 */
export function addToCollection(collection = [], item) {
  return [...collection, item];
}

/**
 * Utility to remove item from collection
 */
export function removeFromCollection(collection = [], id) {
  return collection.filter(item => item.id !== id);
}
