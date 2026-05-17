import { MESSAGE_TYPES } from "../constants.js";
import store from "../state/store.js";
import { log } from "../helpers.js";

// Global state variable
let offscreenCreating;

export async function setupOffscreenDocument(path) {
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (offscreenCreating) {
    await offscreenCreating;
  } else {
    offscreenCreating = chrome.offscreen.createDocument({
      url: path,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Playing notification sounds",
    });
    await offscreenCreating;
    offscreenCreating = null;
  }
}

export async function playSound(soundName = "bell") {
  try {
    await store.init();
    const soundEnabled = store.getSettingsState().soundEnabled !== false;
    log(`Sound enabled state: ${soundEnabled}`);

    if (soundEnabled) {
      await setupOffscreenDocument("src/offscreen/index.html");

      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: MESSAGE_TYPES.PLAY_SOUND_OFFSCREEN,
            soundName,
          },
          () => {
            if (chrome.runtime.lastError) {
              log(`Sound message error: ${chrome.runtime.lastError.message}`);
            } else {
              log("Sound playback requested via offscreen document.");
            }
            resolve();
          },
        );
      });
    } else {
      log("Sound is disabled. Notification sent without sound.");
    }
  } catch (error) {
    log(`Sound playback error: ${error.message}`);
  }
}
