import { MESSAGE_TYPES } from "../constants.js";
import { getData } from "../store.js";
import { log } from "../helpers.js";

const EXCLUDED_SOUND_ERROR_MESSAGES = [
  "The message port closed before a response was received",
];

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
    const data = await getData();
    const soundEnabled = data.common.soundEnabled !== false;
    log(`Sound enabled state: ${soundEnabled}`);

    if (!soundEnabled) {
      log("Sound is disabled. Notification sent without sound.");
      return;
    }

    await setupOffscreenDocument("src/offscreen/index.html");

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: MESSAGE_TYPES.PLAY_SOUND_OFFSCREEN, soundName },
        () => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message;
            if (
              !EXCLUDED_SOUND_ERROR_MESSAGES.some((excluded) =>
                msg.includes(excluded),
              )
            ) {
              log(`Sound message error: ${msg}`);
            }
          } else {
            log("Sound playback requested via offscreen document.");
          }
          resolve();
        },
      );
    });
  } catch (error) {
    log(`Sound playback error: ${error.message}`);
  }
}
