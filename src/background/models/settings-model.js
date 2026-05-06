import { log } from "../../helpers.js";

// Import StorageUtils for storage operations
import { StorageUtils } from "../storage-utils.js";

/**
 * @typedef {Object} SettingsState
 * @property {boolean} soundEnabled - Whether sound is enabled
 * @property {string|null} disableTodayUntil - Date string until disabled
 */

export class SettingsModel {
  constructor() {
    this.state = {
      soundEnabled: true,
      disableTodayUntil: null,
    };

    this.keys = {
      SOUND_ENABLED: "soundEnabled",
      DISABLE_TODAY_UNTIL: "disableTodayUntil",
    };
  }

  async load() {
    const data = await StorageUtils.get(Object.values(this.keys));
    this.state = {
      soundEnabled: data[this.keys.SOUND_ENABLED] !== false,
      disableTodayUntil: data[this.keys.DISABLE_TODAY_UNTIL] || null,
    };
    return this.state;
  }

  async save() {
    await StorageUtils.set({
      [this.keys.SOUND_ENABLED]: this.state.soundEnabled,
      [this.keys.DISABLE_TODAY_UNTIL]: this.state.disableTodayUntil,
    });
  }

  update(updates) {
    Object.assign(this.state, updates);
  }
}
