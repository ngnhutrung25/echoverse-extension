import { log } from "../../helpers.js";

// Import StorageUtils for storage operations
import { StorageUtils } from "../storage-utils.js";

/**
 * @typedef {Object} StatsState
 * @property {number} shown - Count of shown reminders
 * @property {number} skipped - Count of skipped reminders
 * @property {number} snoozed - Count of snoozed reminders
 * @property {boolean} disabledToday - Whether disabled for today
 */

export class StatsModel {
  constructor() {
    this.state = {
      dailyStats: {},
    };

    this.keys = {
      DAILY_STATS: "dailyStats",
    };
  }

  async load() {
    const data = await StorageUtils.get(Object.values(this.keys));
    this.state = {
      dailyStats: data[this.keys.DAILY_STATS] || {},
    };
    return this.state;
  }

  async save() {
    await StorageUtils.set({
      [this.keys.DAILY_STATS]: this.state.dailyStats,
    });
  }

  update(updates) {
    Object.assign(this.state, updates);
  }

  getTodayStats(date = new Date()) {
    const todayKey = date.toISOString().slice(0, 10);
    return (
      this.state.dailyStats[todayKey] || {
        shown: 0,
        skipped: 0,
        snoozed: 0,
        disabledToday: false,
      }
    );
  }

  updateTodayStats(action, date = new Date()) {
    const todayKey = date.toISOString().slice(0, 10);
    const today = this.getTodayStats(date);
    const nextToday = { ...today };

    if (action === "SKIP") nextToday.skipped += 1;
    if (action === "SNOOZE") nextToday.snoozed += 1;
    if (action === "DISABLE_TODAY") nextToday.disabledToday = true;
    if (action === "shown") nextToday.shown += 1;

    this.state.dailyStats[todayKey] = nextToday;
    return this.save();
  }
}
