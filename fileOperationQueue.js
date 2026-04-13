// fileOperationQueue.js - Serialized file I/O with queue management
// Prevents race conditions and ensures data persistence

import { createLogger } from "./logger.js";

const log = createLogger("FileOperationQueue");

/**
 * Represents a queued file operation
 */
class FileOperation {
  constructor(id, type, path, data = null, resolve, reject) {
    this.id = id;
    this.type = type; // 'read' or 'write'
    this.path = path;
    this.data = data;
    this.resolve = resolve;
    this.reject = reject;
    this.timestamp = Date.now();
    this.retries = 0;
    this.maxRetries = 3;
  }

  /**
   * Execute the operation
   */
  async execute(handler) {
    try {
      let result;
      
      if (this.type === "read") {
        result = await handler.read(this.path);
        log.debug(`Read operation completed`, { path: this.path, size: JSON.stringify(result).length });
      } else if (this.type === "write") {
        result = await handler.write(this.path, this.data);
        log.debug(`Write operation completed`, { path: this.path });
      }
      
      this.resolve(result);
      return true;
    } catch (error) {
      if (this.retries < this.maxRetries) {
        this.retries += 1;
        log.warn(`Operation failed, retrying (${this.retries}/${this.maxRetries})`, { 
          path: this.path, 
          error: error.message 
        });
        return false; // Signal to retry
      }
      
      log.error(`Operation failed after ${this.maxRetries} retries`, { 
        path: this.path, 
        error: error.message 
      });
      this.reject(error);
      return true; // Signal completion (with error)
    }
  }
}

/**
 * File Operation Queue Manager
 * Serializes all file I/O to prevent race conditions and ensure data consistency
 */
export class FileOperationQueue {
  constructor(handler) {
    this.handler = handler; // Object with read() and write() methods
    this.queue = [];
    this.isProcessing = false;
    this.operationCount = 0;
    this.errorCount = 0;
    this.successCount = 0;
    this.lastOperation = null;
    this.lockTimeout = 30000; // 30 seconds
  }

  /**
   * Get unique operation ID
   */
  getOperationId() {
    return `op_${Date.now()}_${++this.operationCount}`;
  }

  /**
   * Enqueue and execute a read operation
   * @param {string} path
   * @returns {Promise}
   */
  read(path) {
    return new Promise((resolve, reject) => {
      const operation = new FileOperation(
        this.getOperationId(),
        "read",
        path,
        null,
        resolve,
        reject
      );

      this.enqueue(operation);
    });
  }

  /**
   * Enqueue and execute a write operation
   * @param {string} path
   * @param {*} data
   * @returns {Promise}
   */
  write(path, data) {
    return new Promise((resolve, reject) => {
      const operation = new FileOperation(
        this.getOperationId(),
        "write",
        path,
        data,
        resolve,
        reject
      );

      this.enqueue(operation);
    });
  }

  /**
   * Add operation to queue
   */
  enqueue(operation) {
    const waitingCount = this.queue.length;
    log.debug(`Operation enqueued`, { 
      id: operation.id, 
      type: operation.type, 
      path: operation.path,
      queuePosition: waitingCount + 1
    });

    this.queue.push(operation);

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process queued operations sequentially
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const operation = this.queue[0];
        const timeout = setTimeout(() => {
          log.error(`Operation timeout`, { id: operation.id, path: operation.path });
          operation.reject(new Error(`File operation timeout after ${this.lockTimeout}ms`));
          this.queue.shift();
        }, this.lockTimeout);

        try {
          // Retry loop for transient failures
          let shouldRetry = true;
          while (shouldRetry) {
            shouldRetry = !(await operation.execute(this.handler));

            if (shouldRetry && operation.retries < operation.maxRetries) {
              // Wait before retry
              await this.delay(100 * operation.retries);
            }
          }

          clearTimeout(timeout);
          this.queue.shift();
          this.successCount += 1;
          this.lastOperation = operation.id;

        } catch (error) {
          clearTimeout(timeout);
          log.error(`Queue processing error`, { error: error.message });
          this.queue.shift();
          this.errorCount += 1;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Delay for specified milliseconds
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      operationCount: this.operationCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      lastOperation: this.lastOperation,
      pendingOperations: this.queue.map(op => ({
        id: op.id,
        type: op.type,
        path: op.path,
        retries: op.retries
      }))
    };
  }

  /**
   * Clear queue and stop processing
   */
  clear() {
    log.warn(`Clearing file operation queue (${this.queue.length} pending operations)`);
    this.queue.forEach(op => {
      op.reject(new Error("Queue cleared"));
    });
    this.queue = [];
    this.isProcessing = false;
  }

  /**
   * Wait for queue to empty
   */
  async waitForEmpty() {
    while (this.isProcessing || this.queue.length > 0) {
      await this.delay(50);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = this.getStatus();
    return {
      ...stats,
      successRate: this.operationCount > 0 
        ? ((this.successCount / this.operationCount) * 100).toFixed(2) + "%"
        : "N/A"
    };
  }
}

/**
 * Singleton instance for global file operations
 */
let globalQueue = null;

/**
 * Initialize global file operation queue
 * @param {object} handler - Object with read(path) and write(path, data) methods
 */
export function initFileOperationQueue(handler) {
  if (!globalQueue) {
    globalQueue = new FileOperationQueue(handler);
    log.info("File operation queue initialized");
  }
  return globalQueue;
}

/**
 * Get global file operation queue instance
 */
export function getFileOperationQueue() {
  if (!globalQueue) {
    log.warn("File operation queue not initialized");
  }
  return globalQueue;
}

/**
 * Safe read operation via global queue
 */
export async function queuedRead(path) {
  const queue = getFileOperationQueue();
  if (!queue) throw new Error("File operation queue not initialized");
  return queue.read(path);
}

/**
 * Safe write operation via global queue
 */
export async function queuedWrite(path, data) {
  const queue = getFileOperationQueue();
  if (!queue) throw new Error("File operation queue not initialized");
  return queue.write(path, data);
}

/**
 * Wait for all pending operations to complete
 */
export async function waitForFileOperations() {
  const queue = getFileOperationQueue();
  if (queue) {
    await queue.waitForEmpty();
  }
}
