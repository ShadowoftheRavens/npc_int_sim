// filePersistenceAdapter.js - Adapter for safe file persistence with queue management
// Wraps file system operations with automatic queuing

import { 
  initFileOperationQueue, 
  getFileOperationQueue,
  waitForFileOperations 
} from "./fileOperationQueue.js";
import { createLogger } from "./logger.js";

const log = createLogger("FilePersistenceAdapter");

/**
 * File handler for file operations
 * Implements read/write methods for the queue system
 */
class FileHandler {
  constructor(fileSystemModule) {
    this.fs = fileSystemModule;
  }

  /**
   * Read file contents
   * @param {string} path - File path or key
   * @returns {Promise<*>}
   */
  async read(path) {
    try {
      // Determine if it's a file path or a key
      if (path.startsWith("file://") || path.includes(".json")) {
        // File system read
        return await this.fs.readFile?.(path);
      } else {
        // localStorage read
        const data = localStorage.getItem(path);
        return data ? JSON.parse(data) : null;
      }
    } catch (error) {
      log.error(`Error reading file`, { path, error: error.message });
      throw error;
    }
  }

  /**
   * Write file contents
   * @param {string} path - File path or key
   * @param {*} data - Data to write
   * @returns {Promise<void>}
   */
  async write(path, data) {
    try {
      // Determine if it's a file path or a key
      if (path.startsWith("file://") || path.includes(".json")) {
        // File system write
        return await this.fs.writeFile?.(path, data);
      } else {
        // localStorage write
        localStorage.setItem(path, JSON.stringify(data));
        return true;
      }
    } catch (error) {
      log.error(`Error writing file`, { path, error: error.message });
      throw error;
    }
  }
}

/**
 * File Persistence Manager - Main interface for safe file I/O
 */
export class FilePersistenceManager {
  constructor(fileSystemModule) {
    this.fs = fileSystemModule;
    this.handler = new FileHandler(fileSystemModule);
    this.queue = initFileOperationQueue(this.handler);
  }

  /**
   * Read data safely through queue
   * @param {string} path - File path or storage key
   * @returns {Promise<*>}
   */
  async read(path) {
    log.debug(`Queuing read operation`, { path });
    return this.queue.read(path);
  }

  /**
   * Write data safely through queue
   * @param {string} path - File path or storage key
   * @param {*} data - Data to write
   * @returns {Promise<boolean>}
   */
  async write(path, data) {
    log.debug(`Queuing write operation`, { path });
    return this.queue.write(path, data);
  }

  /**
   * Read and update atomically
   * Prevents issues with concurrent modify operations
   * @param {string} path - File path or storage key
   * @param {Function} updateFn - Function to update data: (oldData) => newData
   * @returns {Promise<*>}
   */
  async readAndUpdate(path, updateFn) {
    log.debug(`Queuing read-update operation`, { path });
    
    // Both read and update happen in queue, ensuring atomicity
    const oldData = await this.queue.read(path);
    const newData = updateFn(oldData);
    await this.queue.write(path, newData);
    
    return newData;
  }

  /**
   * Write multiple files atomically
   * All writes succeed or all fail
   * @param {Array<{path, data}>} operations - Array of {path, data} objects
   * @returns {Promise<boolean>}
   */
  async writeMultiple(operations) {
    log.debug(`Queuing multiple write operations`, { count: operations.length });
    
    try {
      const promises = operations.map(op => 
        this.queue.write(op.path, op.data)
      );
      
      const results = await Promise.all(promises);
      const success = results.every(r => r === true || r);
      
      if (success) {
        log.info(`Multiple writes successful`, { count: operations.length });
      }
      
      return success;
    } catch (error) {
      log.error(`Multiple write failed`, { count: operations.length, error: error.message });
      throw error;
    }
  }

  /**
   * Get queue status
   */
  getStatus() {
    return this.queue.getStatus();
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return this.queue.getStats();
  }

  /**
   * Wait for all pending operations to complete
   */
  async flush() {
    log.info(`Flushing file operation queue`);
    await this.queue.waitForEmpty();
    log.info(`File operations flushed`);
  }

  /**
   * Clear queue (use with caution)
   */
  clear() {
    log.warn(`Clearing file persistence queue`);
    this.queue.clear();
  }
}

/**
 * Singleton instance
 */
let globalPersistenceManager = null;

/**
 * Initialize global file persistence manager
 * @param {*} fileSystemModule - The fileSystem.js module
 */
export function initFilePersistence(fileSystemModule) {
  if (!globalPersistenceManager) {
    globalPersistenceManager = new FilePersistenceManager(fileSystemModule);
    log.info("File persistence manager initialized");
  }
  return globalPersistenceManager;
}

/**
 * Get global file persistence manager
 */
export function getFilePersistence() {
  if (!globalPersistenceManager) {
    log.warn("File persistence manager not initialized");
  }
  return globalPersistenceManager;
}

/**
 * Safe read shortcut
 */
export async function persistentRead(path) {
  const manager = getFilePersistence();
  if (!manager) throw new Error("File persistence not initialized");
  return manager.read(path);
}

/**
 * Safe write shortcut
 */
export async function persistentWrite(path, data) {
  const manager = getFilePersistence();
  if (!manager) throw new Error("File persistence not initialized");
  return manager.write(path, data);
}

/**
 * Safe read-update shortcut
 */
export async function persistentReadUpdate(path, updateFn) {
  const manager = getFilePersistence();
  if (!manager) throw new Error("File persistence not initialized");
  return manager.readAndUpdate(path, updateFn);
}

/**
 * Flush all pending operations
 */
export async function flushPersistence() {
  const manager = getFilePersistence();
  if (manager) {
    await manager.flush();
  }
}
