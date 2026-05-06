import { log } from "../../helpers.js";

// Import StorageUtils for storage operations
import { StorageUtils } from "../storage-utils.js";

/**
 * @typedef {Object} ReminderState
 * @property {boolean} enabled - Whether reminder is enabled
 * @property {number} intervalMinutes - Interval in minutes
 * @property {string} message - Reminder message
 * @property {number|null} lastTriggeredAt - Last trigger timestamp
 * @property {number|null} nextDueAt - Next due timestamp
 */

export class ReminderModel {
  /**
   * @param {string} mode - 'HOURLY' or 'RECURRING'
   */
  constructor(mode) {
    this.mode = mode;
    this.isHourly = mode === "HOURLY";

    // Default state
    this.state = {
      enabled: true,
      intervalMinutes: this.isHourly ? 60 : 30,
      message: "Drink water",
      lastTriggeredAt: null,
      nextDueAt: null,
    };

    // Storage keys for this mode
    this.keys = this.isHourly
      ? {
          ENABLED: "hourlyEnabled",
          INTERVAL: "hourlyIntervalMinutes",
          MESSAGE: "hourlyMessage",
          LAST_TRIGGERED: "hourlyLastTriggeredAt",
          NEXT_DUE: "hourlyNextDueAt",
        }
      : {
          ENABLED: "recurringEnabled",
          INTERVAL: "recurringIntervalMinutes",
          MESSAGE: "recurringMessage",
          LAST_TRIGGERED: "recurringLastTriggeredAt",
          NEXT_DUE: "recurringNextDueAt",
        };
  }

  /**
   * Load state from storage
   * @returns {Promise<ReminderState>}
   */
  async load() {
    const data = await StorageUtils.get(Object.values(this.keys));
    this.state = {
      enabled: data[this.keys.ENABLED] !== false,
      intervalMinutes: Math.max(
        1,
        Number(data[this.keys.INTERVAL] || (this.isHourly ? 60 : 30)),
      ),
      message: data[this.keys.MESSAGE] || data.message || "Drink water",
      lastTriggeredAt: data[this.keys.LAST_TRIGGERED] || null,
      nextDueAt: data[this.keys.NEXT_DUE] || null,
    };
    return this.state;
  }

  /**
   * Save state to storage
   * @returns {Promise<void>}
   */
  async save() {
    await StorageUtils.set({
      [this.keys.ENABLED]: this.state.enabled,
      [this.keys.INTERVAL]: this.state.intervalMinutes,
      [this.keys.MESSAGE]: this.state.message,
      [this.keys.LAST_TRIGGERED]: this.state.lastTriggeredAt,
      [this.keys.NEXT_DUE]: this.state.nextDueAt,
    });
  }

  /**
   * Update specific properties
   * @param {Partial<ReminderState>} updates
   */
  update(updates) {
    Object.assign(this.state, updates);
  }

  /**
   * Check if should debounce
   * @param {number} now
   * @param {number} debounceMs
   * @returns {boolean}
   */
  shouldDebounce(now, debounceMs = 90000) {
    return (
      this.state.lastTriggeredAt &&
      now - this.state.lastTriggeredAt < debounceMs
    );
  }

  /**
   * Update timing after trigger
   * @param {number} now
   */
  updateTiming(now) {
    this.state.lastTriggeredAt = now;
    this.state.nextDueAt = now + this.state.intervalMinutes * 60 * 1000;
  }

  /**
   * Get next due time
   * @returns {number}
   */
  getNextDueAt() {
    return (
      this.state.nextDueAt ||
      Date.now() + this.state.intervalMinutes * 60 * 1000
    );
  }
}
