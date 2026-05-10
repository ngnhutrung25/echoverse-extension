import { STORAGE_KEYS } from "../constants.js";
import { StorageUtils } from "../background/storage-utils.js";

export function createSettingsModel() {
  const state = {
    soundEnabled: true,
    recurringPaused: false,
  };

  const keys = {
    SOUND_ENABLED: STORAGE_KEYS.SOUND_ENABLED,
    RECURRING_PAUSED: STORAGE_KEYS.RECURRING_PAUSED,
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
