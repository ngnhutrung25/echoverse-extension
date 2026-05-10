import { STORAGE_KEYS, ACTIONS } from "../constants.js";
import { StorageUtils } from "../background/storage-utils.js";

export function createStatsModel() {
  const state = {
    dailyStats: {},
  };

  const keys = {
    DAILY_STATS: STORAGE_KEYS.DAILY_STATS,
  };

  async function load() {
    const data = await StorageUtils.get(Object.values(keys));
    state.dailyStats = data[keys.DAILY_STATS] || {};
    return state;
  }

  async function save() {
    await StorageUtils.set({
      [keys.DAILY_STATS]: state.dailyStats,
    });
  }

  function update(updates) {
    Object.assign(state, updates);
  }

  function getTodayStats(date = new Date()) {
    const todayKey = date.toISOString().slice(0, 10);
    return (
      state.dailyStats[todayKey] || {
        shown: 0,
        skipped: 0,
        snoozed: 0,
        disabledToday: false,
      }
    );
  }

  async function updateTodayStats(action, date = new Date()) {
    const todayKey = date.toISOString().slice(0, 10);
    const today = getTodayStats(date);
    const nextToday = { ...today };

    if (action === ACTIONS.SKIP) nextToday.skipped += 1;
    if (action === ACTIONS.SNOOZE) nextToday.snoozed += 1;
    if (action === ACTIONS.PAUSE) nextToday.disabledToday = true;
    if (action === "SHOWN") nextToday.shown += 1;

    state.dailyStats[todayKey] = nextToday;
    return save();
  }

  return { state, keys, load, save, update, getTodayStats, updateTodayStats };
}
