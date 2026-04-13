// fileOperationIntegration.js - Example integration of persistence layer
// Shows how to wrap existing file operations with the queue system

import { 
  persistentRead, 
  persistentWrite, 
  persistentReadUpdate,
  getFilePersistence,
  flushPersistence 
} from "./filePersistenceAdapter.js";
import { createLogger } from "./logger.js";

const log = createLogger("FileOperationIntegration");

/**
 * Wrapper for safe NPC persistence
 */
export const SafeNPCPersistence = {
  /**
   * Save NPC to persistent storage
   */
  async save(npc) {
    try {
      log.debug("Saving NPC", { id: npc.id, name: npc.name });
      await persistentWrite("npcs.json", npc);
      log.info("NPC saved", { id: npc.id });
      return true;
    } catch (error) {
      log.error("NPC save failed", { id: npc.id, error: error.message });
      throw error;
    }
  },

  /**
   * Save multiple NPCs
   */
  async saveMany(npcs) {
    try {
      log.debug("Saving multiple NPCs", { count: npcs.length });
      const persistence = getFilePersistence();
      
      await persistence.writeMultiple([
        { path: "npcs.json", data: npcs }
      ]);
      
      log.info("NPCs saved", { count: npcs.length });
      return true;
    } catch (error) {
      log.error("Multiple NPC save failed", { error: error.message });
      throw error;
    }
  },

  /**
   * Load NPC from persistent storage
   */
  async load() {
    try {
      log.debug("Loading NPCs");
      const npcs = await persistentRead("npcs.json");
      log.info("NPCs loaded", { count: npcs?.length || 0 });
      return npcs || [];
    } catch (error) {
      log.error("NPC load failed", { error: error.message });
      throw error;
    }
  },

  /**
   * Update NPC atomically
   */
  async update(npcId, updates) {
    try {
      log.debug("Updating NPC", { id: npcId });
      
      const updated = await persistentReadUpdate("npcs.json", (npcs) => {
        const idx = npcs.findIndex(n => n.id === npcId);
        if (idx > -1) {
          npcs[idx] = { ...npcs[idx], ...updates };
        }
        return npcs;
      });
      
      log.info("NPC updated", { id: npcId });
      return updated;
    } catch (error) {
      log.error("NPC update failed", { id: npcId, error: error.message });
      throw error;
    }
  },

  /**
   * Add notes to NPC atomically
   */
  async addNotes(npcId, notes) {
    try {
      log.debug("Adding notes to NPC", { id: npcId, length: notes.length });
      
      const updated = await persistentReadUpdate("npcs.json", (npcs) => {
        const idx = npcs.findIndex(n => n.id === npcId);
        if (idx > -1) {
          npcs[idx].notes = notes;
        }
        return npcs;
      });
      
      log.info("Notes added", { id: npcId });
      return updated;
    } catch (error) {
      log.error("Notes add failed", { id: npcId, error: error.message });
      throw error;
    }
  }
};

/**
 * Wrapper for safe Faction persistence
 */
export const SafeFactionPersistence = {
  /**
   * Save faction
   */
  async save(faction) {
    try {
      log.debug("Saving faction", { id: faction.id, name: faction.name });
      await persistentWrite("factions.json", faction);
      log.info("Faction saved", { id: faction.id });
      return true;
    } catch (error) {
      log.error("Faction save failed", { id: faction.id, error: error.message });
      throw error;
    }
  },

  /**
   * Save multiple factions
   */
  async saveMany(factions) {
    try {
      log.debug("Saving factions", { count: factions.length });
      const persistence = getFilePersistence();
      
      await persistence.writeMultiple([
        { path: "factions.json", data: factions }
      ]);
      
      log.info("Factions saved", { count: factions.length });
      return true;
    } catch (error) {
      log.error("Factions save failed", { error: error.message });
      throw error;
    }
  },

  /**
   * Load factions
   */
  async load() {
    try {
      log.debug("Loading factions");
      const factions = await persistentRead("factions.json");
      log.info("Factions loaded", { count: factions?.length || 0 });
      return factions || [];
    } catch (error) {
      log.error("Factions load failed", { error: error.message });
      throw error;
    }
  },

  /**
   * Update faction reputation atomically
   */
  async updateReputation(factionId, delta) {
    try {
      log.debug("Updating faction reputation", { id: factionId, delta });
      
      const updated = await persistentReadUpdate("factions.json", (factions) => {
        const idx = factions.findIndex(f => f.id === factionId);
        if (idx > -1) {
          factions[idx].reputation = Math.max(0, Math.min(100, 
            (factions[idx].reputation || 0) + delta
          ));
        }
        return factions;
      });
      
      log.info("Reputation updated", { id: factionId, delta });
      return updated;
    } catch (error) {
      log.error("Reputation update failed", { id: factionId, error: error.message });
      throw error;
    }
  }
};

/**
 * Wrapper for safe Config persistence
 */
export const SafeConfigPersistence = {
  /**
   * Save config
   */
  async save(config) {
    try {
      log.debug("Saving config");
      await persistentWrite("config.json", config);
      log.info("Config saved");
      return true;
    } catch (error) {
      log.error("Config save failed", { error: error.message });
      throw error;
    }
  },

  /**
   * Load config
   */
  async load() {
    try {
      log.debug("Loading config");
      const config = await persistentRead("config.json");
      log.info("Config loaded");
      return config || {};
    } catch (error) {
      log.error("Config load failed", { error: error.message });
      throw error;
    }
  },

  /**
   * Update config atomically
   */
  async update(updates) {
    try {
      log.debug("Updating config");
      
      const updated = await persistentReadUpdate("config.json", (config) => {
        return { ...config, ...updates, lastModified: Date.now() };
      });
      
      log.info("Config updated");
      return updated;
    } catch (error) {
      log.error("Config update failed", { error: error.message });
      throw error;
    }
  }
};

/**
 * Bulk operation helper - Save multiple related data simultaneously
 */
export async function saveBulk(data) {
  const { npcs, factions, config } = data;
  const persistence = getFilePersistence();

  try {
    log.debug("Starting bulk save operation", {
      npcs: npcs?.length || 0,
      factions: factions?.length || 0,
      hasConfig: !!config
    });

    const operations = [];

    if (npcs) operations.push({ path: "npcs.json", data: npcs });
    if (factions) operations.push({ path: "factions.json", data: factions });
    if (config) operations.push({ path: "config.json", data: config });

    await persistence.writeMultiple(operations);

    log.info("Bulk save completed", { operationCount: operations.length });
    return true;
  } catch (error) {
    log.error("Bulk save failed", { error: error.message });
    throw error;
  }
}

/**
 * Get persistence status for debugging
 */
export function getPersistenceStatus() {
  const persistence = getFilePersistence();
  if (!persistence) return null;

  return {
    status: persistence.getStatus(),
    stats: persistence.getStats(),
    ready: persistence.queue && !persistence.queue.isProcessing,
    queueLength: persistence.queue?.queue.length || 0
  };
}

/**
 * Ensure all file operations are complete
 * Call this before app unload or critical operations
 */
export async function ensurePersistenceComplete() {
  log.info("Ensuring all file operations are complete");
  await flushPersistence();
  const status = getPersistenceStatus();
  log.info("Persistence state verified", { status });
  return status;
}

/**
 * Monitor persistence health
 * Use for debugging and monitoring
 */
export function monitorPersistence(interval = 5000) {
  const log = createLogger("PersistenceMonitor");
  
  const monitor = setInterval(() => {
    const status = getPersistenceStatus();
    if (status && status.queueLength > 0) {
      log.warn("File operations pending", {
        queueLength: status.queueLength,
        isProcessing: status.status.isProcessing
      });
    } else {
      log.debug("File operations healthy", status);
    }
  }, interval);

  return () => clearInterval(monitor);
}

/**
 * Setup unload handler to ensure data is saved
 */
export function setupUnloadHandler() {
  window.addEventListener("beforeunload", async (e) => {
    const status = getPersistenceStatus();
    
    if (status && status.queueLength > 0) {
      log.warn("Pending file operations detected on unload");
      
      // Prevent immediate unload
      e.preventDefault();
      e.returnValue = "";
      
      // Wait for completion
      await ensurePersistenceComplete();
      
      // Now allow unload
      window.location.reload();
    }
  });

  window.addEventListener("unload", () => {
    log.info("Application unloading");
  });
}
