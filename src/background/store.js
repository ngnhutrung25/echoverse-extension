import { log } from "../helpers.js";
import { StorageUtils } from "./storage-utils.js";
import { ReminderModel } from "./models/reminder-model.js";
import { SettingsModel } from "./models/settings-model.js";
import { StatsModel } from "./models/stats-model.js";

// ========================================
// OBSERVABLE STORE MANAGER
// ========================================

class StoreManager {
  constructor() {
    this.models = {
      hourly: new ReminderModel("HOURLY"),
      recurring: new ReminderModel("RECURRING"),
      settings: new SettingsModel(),
      stats: new StatsModel(),
    };

    this.observers = new Map();
    this.initialized = false;
  }

  /**
   * Initialize all models
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;

    await Promise.all([
      this.models.hourly.load(),
      this.models.recurring.load(),
      this.models.settings.load(),
      this.models.stats.load(),
    ]);

    this.initialized = true;
    log("StoreManager initialized");
  }

  /**
   * Get model instance
   * @param {string} name - Model name
   * @returns {ReminderModel|UIModel|StatsModel}
   */
  getModel(name) {
    return this.models[name];
  }

  /**
   * Save all models
   * @returns {Promise<void>}
   */
  async saveAll() {
    await Promise.all([
      this.models.hourly.save(),
      this.models.recurring.save(),
      this.models.settings.save(),
      this.models.stats.save(),
    ]);
  }

  /**
   * Get reminder state by mode
   * @param {string} mode
   * @returns {ReminderState}
   */
  getReminderState(mode) {
    return this.models[mode.toLowerCase()].state;
  }

  /**
   * Get settings state
   * @returns {SettingsState}
   */
  getSettingsState() {
    return this.models.settings.state;
  }

  /**
   * Get stats state
   * @returns {Object}
   */
  getStatsState() {
    return this.models.stats.state;
  }

  /**
   * Update reminder timing
   * @param {string} mode
   * @param {number} now
   * @returns {Promise<void>}
   */
  async updateReminderTiming(mode, now) {
    const model = this.models[mode.toLowerCase()];
    model.updateTiming(now);
    await model.save();
    this.notify("reminder", { mode, state: model.state });
  }

  /**
   * Update statistics
   * @param {string} action
   * @returns {Promise<void>}
   */
  async updateStats(action) {
    await this.models.stats.updateTodayStats(action);
    this.notify("stats", { action, stats: this.models.stats.state });
  }

  /**
   * Update settings state
   * @param {Partial<SettingsState>} updates
   * @returns {Promise<void>}
   */
  async updateSettings(updates) {
    this.models.settings.update(updates);
    await this.models.settings.save();
    this.notify("ui", { state: this.models.settings.state });
  }

  /**
   * Subscribe to state changes
   * @param {string} type - 'reminder', 'ui', 'stats'
   * @param {Function} callback
   */
  subscribe(type, callback) {
    if (!this.observers.has(type)) {
      this.observers.set(type, new Set());
    }
    this.observers.get(type).add(callback);
  }

  /**
   * Unsubscribe from state changes
   * @param {string} type
   * @param {Function} callback
   */
  unsubscribe(type, callback) {
    const observers = this.observers.get(type);
    if (observers) {
      observers.delete(callback);
    }
  }

  /**
   * Notify observers of state change
   * @param {string} type
   * @param {*} data
   */
  notify(type, data) {
    const observers = this.observers.get(type);
    if (observers) {
      observers.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          log(`Observer error: ${error.message}`);
        }
      });
    }
  }

  /**
   * Check if reminder should trigger
   * @param {string} mode
   * @param {number} now
   * @param {string} source
   * @returns {boolean}
   */
  shouldTriggerReminder(mode, now, source) {
    const model = this.models[mode.toLowerCase()];
    const settingsState = this.models.settings.state;
    const todayKey = new Date().toISOString().slice(0, 10);

    // Check if disabled today
    if (mode === "recurring" && settingsState.disableTodayUntil === todayKey) {
      return false;
    }

    // Check if enabled
    if (!model.state.enabled) {
      return false;
    }

    // Check debounce
    if (model.shouldDebounce(now)) {
      return false;
    }

    return true;
  }
}

// Create singleton instance
const store = new StoreManager();

export default store;
export { ReminderModel, SettingsModel, StatsModel, StoreManager };
