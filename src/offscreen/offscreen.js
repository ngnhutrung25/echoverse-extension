import { MESSAGE_TYPES } from "../constants.js";
import { log } from "../helpers.js";

const AUDIO_ID = "notification-sound";
const LOG_MESSAGES = {
  SOUND_PLAYED: "Sound played successfully in offscreen document.",
  SOUND_ERROR: "Error playing sound in offscreen document.",
  AUDIO_NOT_FOUND: "Audio element not found in offscreen document.",
};

let audioElement = null;

/**
 * Initialize audio element reference
 */
function initializeAudio() {
  if (!audioElement) {
    audioElement = document.getElementById(AUDIO_ID);
    if (!audioElement) {
      log(LOG_MESSAGES.AUDIO_NOT_FOUND);
    }
  }
  return audioElement;
}

/**
 * Reset audio to beginning
 */
function resetAudio(audio) {
  audio.currentTime = 0;
}

/**
 * Play notification sound
 */
async function playSound() {
  const audio = initializeAudio();
  if (!audio) {
    return;
  }

  resetAudio(audio);

  try {
    await audio.play();
    log(LOG_MESSAGES.SOUND_PLAYED);
  } catch (error) {
    log(LOG_MESSAGES.SOUND_ERROR + "\n" + error);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MESSAGE_TYPES.PLAY_SOUND_OFFSCREEN) {
    playSound();
  }
});
