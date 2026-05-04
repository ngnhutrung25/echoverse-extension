document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    hourlyToggle: document.getElementById("hourly-toggle"),
    recurringToggle: document.getElementById("recurring-toggle"),
    hourlySettings: document.getElementById("hourly-settings"),
    recurringSettings: document.getElementById("recurring-settings"),
    startButton: document.getElementById("start-timer"),
    statusBox: document.getElementById("status-box"),
    statusDiv: document.getElementById("status"),
    todayCount: document.getElementById("today-count"),
    streakCount: document.getElementById("streak-count"),
    hourlyMessageInput: document.getElementById("hourly-message"),
    recurringIntervalInput: document.getElementById("recurring-interval"),
    recurringMessageInput: document.getElementById("recurring-message"),
    soundToggleButton: document.getElementById("sound-toggle"),
    soundToggleIcon: document.getElementById("sound-toggle-icon"),
  };

  let statusTimer = null;

  function updateSoundToggleIcon(soundEnabled) {
    if (soundEnabled) {
      elements.soundToggleIcon.src = "/assets/noti.png";
      elements.soundToggleIcon.alt = "Sound On";
    } else {
      elements.soundToggleIcon.src = "/assets/mute.png";
      elements.soundToggleIcon.alt = "Sound Off";
    }
  }

  function updateStatus(message, isError = false) {
    if (statusTimer) {
      clearTimeout(statusTimer);
    }

    elements.statusBox.classList.remove("hidden");
    elements.statusDiv.classList.toggle("text-blue-600", !isError);
    elements.statusDiv.classList.toggle("text-red-500", isError);
    elements.statusDiv.textContent = message;

    statusTimer = setTimeout(() => {
      clearStatus();
    }, 3000);
  }

  function clearStatus() {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }

    elements.statusDiv.textContent = "";
    elements.statusBox.classList.add("hidden");
  }

  function syncModeUI() {
    elements.hourlySettings.classList.toggle("hidden", !elements.hourlyToggle.checked);
    elements.recurringSettings.classList.toggle("hidden", !elements.recurringToggle.checked);
  }

  function setMode(hourly, recurring) {
    elements.hourlyToggle.checked = hourly;
    elements.recurringToggle.checked = recurring;
    syncModeUI();
  }

  function loadSettings() {
    clearStatus();
    chrome.storage.sync.get(
      [
        "hourlyEnabled",
        "hourlyMessage",
        "hourlyIntervalMinutes",
        "recurringEnabled",
        "intervalMinutes",
        "message",
        "dailyStats",
        "streak",
        "soundEnabled",
      ],
      (data) => {
        updateSoundToggleIcon(data.soundEnabled !== false);
        setMode(data.hourlyEnabled !== false, data.recurringEnabled !== false);
        elements.hourlyMessageInput.value = data.hourlyMessage || data.message || "";
        elements.recurringIntervalInput.value = data.intervalMinutes || 30;
        elements.recurringMessageInput.value = data.message || "";

        const todayKey = new Date().toISOString().slice(0, 10);
        const todayStats = (data.dailyStats && data.dailyStats[todayKey]) || { shown: 0 };
        const streak = data.streak || { current: 0 };
        elements.todayCount.textContent = String(todayStats.shown || 0);
        elements.streakCount.textContent = String(streak.current || 0);
      }
    );
  }

  function handleStartButtonClick() {
    const payload = {
      action: "start-timer",
      hourlyEnabled: elements.hourlyToggle.checked,
      recurringEnabled: elements.recurringToggle.checked,
      hourlyMessage: elements.hourlyMessageInput.value.trim(),
      recurringIntervalMinutes: parseInt(elements.recurringIntervalInput.value, 10),
      recurringMessage: elements.recurringMessageInput.value.trim(),
    };

    chrome.runtime.sendMessage(payload, (response) => {
      if (response && response.status) {
        updateStatus(response.status);
        chrome.storage.sync.set({
          hourlyEnabled: payload.hourlyEnabled,
          recurringEnabled: payload.recurringEnabled,
          hourlyMessage: payload.hourlyMessage,
          recurringIntervalMinutes: payload.recurringIntervalMinutes || 30,
          recurringMessage: payload.recurringMessage,
        });
      } else if (response && response.error) {
        updateStatus(response.error, true);
      }
    });
  }

  function handleSoundToggleClick() {
    chrome.runtime.sendMessage({ action: "toggle-sound" }, (response) => {
      updateSoundToggleIcon(response.soundEnabled);
    });
  }

  elements.hourlyToggle.addEventListener("change", syncModeUI);
  elements.recurringToggle.addEventListener("change", syncModeUI);
  elements.startButton.addEventListener("click", handleStartButtonClick);
  elements.soundToggleButton.addEventListener("click", handleSoundToggleClick);

  loadSettings();
});
