async function playSound() {
  const audio = document.getElementById("notification-sound");
  if (!audio) {
    return;
  }

  audio.currentTime = 0;
  try {
    await audio.play();
    const timestamp = new Date().toLocaleString();
    console.log(
      `[${timestamp}] Sound played successfully in offscreen document.`,
    );
  } catch (error) {
    console.error("Error playing sound in offscreen document:", error);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.target === "offscreen" && message.type === "play-sound") {
    playSound();
  }

  if (message?.type === "PLAY_SOUND") {
    playSound();
  }
});
