import { MESSAGE_TYPES, TARGETS } from "../constants.js";

const AUDIO_ID = "notification-sound";
const LOG_SOUND_PLAYED = "Sound played successfully in offscreen document.";
const LOG_SOUND_ERROR = "Error playing sound in offscreen document:";

async function playSound() {
  const audio = document.getElementById(AUDIO_ID);
  if (!audio) {
    return;
  }

  audio.currentTime = 0;
  try {
    await audio.play();
    const timestamp = new Date().toLocaleString();
    console.log(`[${timestamp}] ${LOG_SOUND_PLAYED}`);
  } catch (error) {
    console.error(LOG_SOUND_ERROR, error);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (
    message.target === TARGETS.OFFSCREEN &&
    message.type === MESSAGE_TYPES.PLAY_SOUND
  ) {
    playSound();
  }
});
