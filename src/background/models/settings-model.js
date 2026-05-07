import { StorageUtils } from "../storage-utils.js";

/**
 * @typedef {Object} SettingsState
 * @property {boolean} soundEnabled - Whether sound is enabled
 * @property {boolean} recurringPaused - Whether recurring reminders are paused
 */

export function createSettingsModel() {
  const state = {
    soundEnabled: true,
    recurringPaused: false,
  };

  const keys = {
    SOUND_ENABLED: "soundEnabled",
    RECURRING_PAUSED: "recurringPaused",
  };

  async function load() {
    const data = await StorageUtils.get(Object.values(keys));
    state.soundEnabled = data[keys.SOUND_ENABLED] !== false;
    state.recurringPaused = data[keys.RECURRING_PAUSED] === true;
    return state;
  }

  async function save() {
    await StorageUtils.set({
      [keys.SOUND_ENABLED]: state.soundEnabled,
      [keys.RECURRING_PAUSED]: state.recurringPaused,
    });
  }

  function update(updates) {
    Object.assign(state, updates);
  }

  return { state, keys, load, save, update };
}
