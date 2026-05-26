import { MESSAGE_TYPES, SOUNDS } from "../constants.js";
import { log } from "../helpers.js";

const SOUND_SOURCES = {
  [SOUNDS.BELL]: "../../assets/bell.mp3",
  [SOUNDS.BEEP]: "../../assets/beep.mp3",
};

async function playSound(soundName) {
  const audio = document.getElementById("notification-sound");
  if (!audio) {
    log("Audio element not found in offscreen document.");
    return;
  }

  const src = SOUND_SOURCES[soundName] || SOUND_SOURCES[SOUNDS.BELL];
  if (audio.getAttribute("src") !== src) {
    audio.setAttribute("src", src);
  }
  audio.currentTime = 0;

  try {
    await audio.play();
    log("Sound played successfully in offscreen document.");
  } catch (error) {
    log("Error playing sound in offscreen document.\n" + error);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MESSAGE_TYPES.PLAY_SOUND_OFFSCREEN) {
    playSound(message.soundName);
  }
});
