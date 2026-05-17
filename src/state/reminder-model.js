import { DEFAULTS, MODES, STORAGE_KEYS } from "../constants.js";
import { StorageUtils } from "../background/storage-utils.js";

export function createReminderModel(mode) {
  const isHourly = mode === MODES.HOURLY;

  const state = {
    enabled: false,
    intervalMinutes: isHourly
      ? DEFAULTS.HOURLY_INTERVAL_MINUTES
      : DEFAULTS.RECURRING_INTERVAL_MINUTES,
    message: DEFAULTS.MESSAGE,
    lastTriggeredAt: null,
    nextDueAt: null,
  };

  const keys = {
    ENABLED: isHourly
      ? STORAGE_KEYS.HOURLY_ENABLED
      : STORAGE_KEYS.RECURRING_ENABLED,
    INTERVAL: isHourly
      ? STORAGE_KEYS.HOURLY_INTERVAL_MINUTES
      : STORAGE_KEYS.RECURRING_INTERVAL_MINUTES,
    MESSAGE: isHourly
      ? STORAGE_KEYS.HOURLY_MESSAGE
      : STORAGE_KEYS.RECURRING_MESSAGE,
    LAST_TRIGGERED: isHourly
      ? STORAGE_KEYS.HOURLY_LAST_TRIGGERED_AT
      : STORAGE_KEYS.RECURRING_LAST_TRIGGERED_AT,
    NEXT_DUE: isHourly
      ? STORAGE_KEYS.HOURLY_NEXT_DUE_AT
      : STORAGE_KEYS.RECURRING_NEXT_DUE_AT,
  };

  async function load() {
    const data = await StorageUtils.get(Object.values(keys));
    state.enabled = data[keys.ENABLED] === true;
    state.intervalMinutes = Math.max(
      1,
      Number(
        data[keys.INTERVAL] ||
          (isHourly
            ? DEFAULTS.HOURLY_INTERVAL_MINUTES
            : DEFAULTS.RECURRING_INTERVAL_MINUTES),
      ),
    );
    state.message = data[keys.MESSAGE] || DEFAULTS.MESSAGE;
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
