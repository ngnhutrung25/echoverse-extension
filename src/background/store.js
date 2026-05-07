import { log } from "../helpers.js";
import { createReminderModel } from "./models/reminder-model.js";
import { createSettingsModel } from "./models/settings-model.js";
import { createStatsModel } from "./models/stats-model.js";

// ========================================
// OBSERVABLE STORE
// ========================================

export function createStoreManager() {
  const models = {
    hourly: createReminderModel("HOURLY"),
    recurring: createReminderModel("RECURRING"),
    settings: createSettingsModel(),
    stats: createStatsModel(),
  };

  const observers = new Map();
  let initialized = false;

  async function init() {
    if (initialized) return;

    await Promise.all([
      models.hourly.load(),
      models.recurring.load(),
      models.settings.load(),
      models.stats.load(),
    ]);

    initialized = true;
    log("Store initialized");
  }

  function getModel(name) {
    return models[name];
  }

  async function saveAll() {
    await Promise.all([
      models.hourly.save(),
      models.recurring.save(),
      models.settings.save(),
      models.stats.save(),
    ]);
  }

  function getReminderState(mode) {
    return models[mode.toLowerCase()].state;
  }

  function getSettingsState() {
    return models.settings.state;
  }

  function getStatsState() {
    return models.stats.state;
  }

  async function updateReminderTiming(mode, now) {
    const model = models[mode.toLowerCase()];
    model.updateTiming(now);
    await model.save();
    notify("reminder", { mode, state: model.state });
  }

  async function updateStats(action) {
    await models.stats.updateTodayStats(action);
    notify("stats", { action, stats: models.stats.state });
  }

  async function updateSettings(updates) {
    models.settings.update(updates);
    await models.settings.save();
    notify("ui", { state: models.settings.state });
  }

  function subscribe(type, callback) {
    if (!observers.has(type)) {
      observers.set(type, new Set());
    }
    observers.get(type).add(callback);
  }

  function unsubscribe(type, callback) {
    const targetObservers = observers.get(type);
    if (targetObservers) {
      targetObservers.delete(callback);
    }
  }

  function notify(type, data) {
    const targetObservers = observers.get(type);
    if (targetObservers) {
      targetObservers.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          log(`Observer error: ${error.message}`);
        }
      });
    }
  }

  function shouldTriggerReminder(mode, now) {
    const model = models[mode.toLowerCase()];
    const settingsState = models.settings.state;

    if (mode === "recurring") {
      if (settingsState.recurringPaused) {
        return false;
      }
    }

    if (!model.state.enabled) {
      return false;
    }

    if (model.shouldDebounce(now)) {
      return false;
    }

    return true;
  }

  return {
    models,
    observers,
    get initialized() {
      return initialized;
    },
    init,
    getModel,
    saveAll,
    getReminderState,
    getSettingsState,
    getStatsState,
    updateReminderTiming,
    updateStats,
    updateSettings,
    subscribe,
    unsubscribe,
    notify,
    shouldTriggerReminder,
  };
}

const store = createStoreManager();

export default store;
export { createReminderModel, createSettingsModel, createStatsModel };
