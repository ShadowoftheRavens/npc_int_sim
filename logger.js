// logger.js - Centralized logging utility

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

let currentLogLevel = LOG_LEVELS.INFO;
let logs = [];
const maxLogs = 1000;

/**
 * Set minimum log level
 * @param {string} level - 'debug', 'info', 'warn', 'error'
 */
export function setLogLevel(level) {
  const levelKey = String(level).toUpperCase();
  if (LOG_LEVELS[levelKey] !== undefined) {
    currentLogLevel = LOG_LEVELS[levelKey];
  }
}

/**
 * Log debug message
 */
export function debug(message, data) {
  log("DEBUG", message, data, LOG_LEVELS.DEBUG);
}

/**
 * Log info message
 */
export function info(message, data) {
  log("INFO", message, data, LOG_LEVELS.INFO);
}

/**
 * Log warning message
 */
export function warn(message, data) {
  log("WARN", message, data, LOG_LEVELS.WARN);
}

/**
 * Log error message
 */
export function error(message, data) {
  log("ERROR", message, data, LOG_LEVELS.ERROR);
}

/**
 * Internal logging function
 */
function log(level, message, data, levelValue) {
  if (levelValue < currentLogLevel) return;

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data
  };

  logs.push(logEntry);
  if (logs.length > maxLogs) {
    logs = logs.slice(-maxLogs);
  }

  // Console output
  const style = getLogStyle(level);
  const output = data ? [message, data] : [message];
  
  if (typeof console[level.toLowerCase()] === "function") {
    console[level.toLowerCase()](`[${timestamp}] ${message}`, data);
  } else {
    console.log(`%c[${level}]%c ${message}`, style, "", data);
  }
}

/**
 * Get styling for console output
 */
function getLogStyle(level) {
  const styles = {
    DEBUG: "color: #7b7b7b; font-weight: normal;",
    INFO: "color: #0066cc; font-weight: normal;",
    WARN: "color: #ff9900; font-weight: bold;",
    ERROR: "color: #cc0000; font-weight: bold;"
  };
  return styles[level] || "";
}

/**
 * Get all logs
 */
export function getLogs() {
  return [...logs];
}

/**
 * Clear all logs
 */
export function clearLogs() {
  logs = [];
}

/**
 * Get logs by level
 */
export function getLogsByLevel(level) {
  return logs.filter(log => log.level === level.toUpperCase());
}

/**
 * Export logs to JSON
 */
export function exportLogs() {
  return JSON.stringify(logs, null, 2);
}

/**
 * Group related logs
 */
export function logGroup(groupName, fn) {
  console.group(groupName);
  fn();
  console.groupEnd();
}

/**
 * Time an operation
 */
export function time(label, fn) {
  const start = performance.now();
  const result = fn();
  const duration = (performance.now() - start).toFixed(2);
  info(`${label} took ${duration}ms`);
  return result;
}

/**
 * Create scoped logger for a module
 */
export function createLogger(moduleName) {
  return {
    debug: (msg, data) => debug(`[${moduleName}] ${msg}`, data),
    info: (msg, data) => info(`[${moduleName}] ${msg}`, data),
    warn: (msg, data) => warn(`[${moduleName}] ${msg}`, data),
    error: (msg, data) => error(`[${moduleName}] ${msg}`, data)
  };
}
