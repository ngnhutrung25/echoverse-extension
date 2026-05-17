import { log } from "../helpers.js";
import { createReminderModel } from "./reminder-model.js";
import { createCommonModel } from "./common-model.js";

export function createStoreManager() {
  const models = {
    hourly: createReminderModel("HOURLY"),
    recurring: createReminderModel("RECURRING"),
    common: createCommonModel(),
  };

  const observers = new Map();
  let initialized = false;

  async function init() {
    if (initialized) return;

    await Promise.all([
      models.hourly.load(),
      models.recurring.load(),
      models.common.load(),
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
      models.common.save(),
    ]);
  }

  function getReminderState(mode) {
    return models[mode.toLowerCase()].state;
  }

  function getSettingsState() {
    return models.common.state;
  }

  function getStatsState() {
    return models.common.state;
  }

  async function updateReminderTiming(mode, now) {
    const model = models[mode.toLowerCase()];
    model.updateTiming(now);
    await model.save();
    notify("reminder", { mode, state: model.state });
  }

  async function updateStats(action) {
    await models.common.updateTodayStats(action);
    notify("stats", { action, stats: models.common.state });
  }

  async function updateSettings(updates) {
    models.common.update(updates);
    await models.common.save();
    notify("ui", { state: models.common.state });
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
export { createReminderModel, createCommonModel };
