import { log } from "../helpers.js";

/**
 * Storage utilities for chrome.storage.sync operations
 */
export class StorageUtils {
  /**
   * Get specific storage keys
   * @param {string[]} keys
   * @returns {Promise<Object>}
   */
  static async get(keys) {
    try {
      return await chrome.storage.sync.get(keys);
    } catch (error) {
      log(`Storage get error: ${error.message}`);
      return {};
    }
  }

  /**
   * Set storage values
   * @param {Object} data
   * @returns {Promise<void>}
   */
  static async set(data) {
    try {
      await chrome.storage.sync.set(data);
      log(`Storage set: ${Object.keys(data).join(", ")}`);
    } catch (error) {
      log(`Storage set error: ${error.message}`);
    }
  }

  /**
   * Remove storage keys
   * @param {string[]} keys
   * @returns {Promise<void>}
   */
  static async remove(keys) {
    try {
      await chrome.storage.sync.remove(keys);
      log(`Storage removed: ${keys.join(", ")}`);
    } catch (error) {
      log(`Storage remove error: ${error.message}`);
    }
  }
}
