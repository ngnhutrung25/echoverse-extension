chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target === "offscreen") {
    if (message.type === "play-sound") {
      const audio = document.getElementById("notification-sound");
      if (audio) {
        audio.currentTime = 0;
        try {
          await audio.play();
          console.log("Sound played successfully in offscreen document.");
        } catch (error) {
          console.error("Error playing sound in offscreen document:", error);
        }
      }
    }
  }
});
