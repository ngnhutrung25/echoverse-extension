import { STORAGE_KEYS, ACTIONS } from "../constants.js";
import { StorageUtils } from "../background/storage-utils.js";

export function createCommonModel() {
  const state = {
    soundEnabled: true,
    dailyStats: {},
  };

  const keys = {
    SOUND_ENABLED: STORAGE_KEYS.SOUND_ENABLED,
    DAILY_STATS: STORAGE_KEYS.DAILY_STATS,
  };

  async function load() {
    const data = await StorageUtils.get(Object.values(keys));
    state.soundEnabled = data[keys.SOUND_ENABLED] !== false;
    state.dailyStats = data[keys.DAILY_STATS] || {};
    return state;
  }

  async function save() {
    await StorageUtils.set({
      [keys.SOUND_ENABLED]: state.soundEnabled,
      [keys.DAILY_STATS]: state.dailyStats,
    });
  }

  function update(updates) {
    Object.assign(state, updates);
  }

  function getTodayStats(date = new Date()) {
    const todayKey = date.toISOString().slice(0, 10);
    return state.dailyStats[todayKey] || { shown: 0 };
  }

  async function updateTodayStats(action) {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const currentStats = getTodayStats(today);
    const nextStats = { ...currentStats };

    if (action === ACTIONS.SHOWN) nextStats.shown += 1;

    state.dailyStats[todayKey] = nextStats;
    await save();
  }

  return { state, keys, load, save, update, getTodayStats, updateTodayStats };
}
