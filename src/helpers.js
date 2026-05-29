/**
 * Log with timestamp
 */
export function log(message) {
  const timestamp = new Date().toLocaleString();
  console.log(`[${timestamp}] ${message}`);
}

/**
 * Returns true if the error message matches any of the excluded patterns.
 * @param {string} errorMessage
 * @param {string[]} excludeList
 */
export function isIgnorableError(errorMessage, excludeList) {
  return excludeList.some((pattern) => errorMessage.includes(pattern));
}
