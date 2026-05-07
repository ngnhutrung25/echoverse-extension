import { StorageUtils } from "../storage-utils.js";

/**
 * @typedef {Object} ReminderState
 * @property {boolean} enabled - Whether reminder is enabled
 * @property {number} intervalMinutes - Interval in minutes
 * @property {string} message - Reminder message
 * @property {number|null} lastTriggeredAt - Last trigger timestamp
 * @property {number|null} nextDueAt - Next due timestamp
 */

export function createReminderModel(mode) {
  const isHourly = mode === "HOURLY";

  const state = {
    enabled: true,
    intervalMinutes: isHourly ? 60 : 30,
    message: "Drink water",
    lastTriggeredAt: null,
    nextDueAt: null,
  };

  const keys = isHourly
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

  async function load() {
    const data = await StorageUtils.get(Object.values(keys));
    state.enabled = data[keys.ENABLED] !== false;
    state.intervalMinutes = Math.max(
      1,
      Number(data[keys.INTERVAL] || (isHourly ? 60 : 30)),
    );
    state.message = data[keys.MESSAGE] || data.message || "Drink water";
    state.lastTriggeredAt = data[keys.LAST_TRIGGERED] || null;
    state.nextDueAt = data[keys.NEXT_DUE] || null;
    return state;
  }

  async function save() {
    await StorageUtils.set({
      [keys.ENABLED]: state.enabled,
      [keys.INTERVAL]: state.intervalMinutes,
      [keys.MESSAGE]: state.message,
      [keys.LAST_TRIGGERED]: state.lastTriggeredAt,
      [keys.NEXT_DUE]: state.nextDueAt,
    });
  }

  function update(updates) {
    Object.assign(state, updates);
  }

  function shouldDebounce(now, debounceMs = 90000) {
    return state.lastTriggeredAt && now - state.lastTriggeredAt < debounceMs;
  }

  function updateTiming(now) {
    state.lastTriggeredAt = now;
    state.nextDueAt = now + state.intervalMinutes * 60 * 1000;
  }

  function getNextDueAt() {
    return state.nextDueAt || Date.now() + state.intervalMinutes * 60 * 1000;
  }

  return {
    state,
    keys,
    load,
    save,
    update,
    shouldDebounce,
    updateTiming,
    getNextDueAt,
  };
}
