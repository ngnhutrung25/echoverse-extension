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
    recurringIntervalValue: document.getElementById("recurring-interval"),
    decrementButton: document.getElementById("decrement-button"),
    incrementButton: document.getElementById("increment-button"),
    soundToggleButton: document.getElementById("sound-toggle"),
    soundToggleIcon: document.getElementById("sound-toggle-icon"),
  };

  let statusTimer = null;

  function setSoundIconState(soundEnabled) {
    elements.soundToggleButton.querySelector("#sound-toggle-bell")?.classList.toggle("hidden", !soundEnabled);
    elements.soundToggleButton
      .querySelector("#sound-toggle-bell-slash")
      ?.classList.toggle("hidden", soundEnabled);
    elements.soundToggleButton.dataset.enabled = String(soundEnabled);
  }

  function getSoundIconState() {
    return elements.soundToggleButton.dataset.enabled !== "false";
  }

  function updateSoundToggleIcon(soundEnabled) {
    setSoundIconState(soundEnabled);
  }


  function updateStatus(message, isError = false) {
    if (statusTimer) {
      clearTimeout(statusTimer);
    }

    elements.statusBox.classList.remove("hidden");
    elements.statusDiv.classList.toggle("text-black", !isError);
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

  async function loadSettings() {
    clearStatus();
    chrome.storage.sync.get(
      [
        "hourlyEnabled",
        "hourlyIntervalMinutes",
        "recurringEnabled",
        "intervalMinutes",
        "customIntervalMinutes",
        "message",
        "dailyStats",
        "soundEnabled",
      ],
      (data) => {
        updateSoundToggleIcon(data.soundEnabled !== false);
        setMode(data.hourlyEnabled !== false, data.recurringEnabled !== false);
        elements.recurringIntervalValue.textContent = String(data.customIntervalMinutes || data.intervalMinutes || 30);

        const todayKey = new Date().toISOString().slice(0, 10);
        const todayStats = (data.dailyStats && data.dailyStats[todayKey]) || { shown: 0 };
        elements.todayCount.textContent = String(todayStats.shown || 0);
      }
    );
  }

  function stepInterval(delta) {
    const current = parseInt(elements.recurringIntervalValue.textContent, 10) || 30;
    const next = Math.max(5, current + delta);
    elements.recurringIntervalValue.textContent = String(Math.round(next / 5) * 5);
  }

  function handleStartButtonClick() {
    const payload = {
      action: "start-timer",
      hourlyEnabled: elements.hourlyToggle.checked,
      recurringEnabled: elements.recurringToggle.checked,
      recurringIntervalMinutes: parseInt(elements.recurringIntervalValue.textContent, 10),
      customIntervalMinutes: parseInt(elements.recurringIntervalValue.textContent, 10),
      message: "",
    };

    chrome.runtime.sendMessage(payload, (response) => {
      if (response && response.status) {
        updateStatus(response.status);
        chrome.storage.sync.set({
          hourlyEnabled: payload.hourlyEnabled,
          recurringEnabled: payload.recurringEnabled,
          recurringIntervalMinutes: payload.recurringIntervalMinutes || 30,
          customIntervalMinutes: payload.customIntervalMinutes || 30,
          message: "",
        });
      } else if (response && response.error) {
        updateStatus(response.error, true);
      }
    });
  }

  async function handleSoundToggleClick() {
    elements.soundToggleButton.disabled = true;
    setSoundIconState(!getSoundIconState());
    chrome.runtime.sendMessage({ action: "toggle-sound" }, (response) => {
      updateSoundToggleIcon(response?.soundEnabled !== false);
      elements.soundToggleButton.disabled = false;
    });
  }

  elements.hourlyToggle.addEventListener("change", syncModeUI);
  elements.recurringToggle.addEventListener("change", syncModeUI);
  elements.decrementButton.addEventListener("click", () => stepInterval(-5));
  elements.incrementButton.addEventListener("click", () => stepInterval(5));
  elements.startButton.addEventListener("click", handleStartButtonClick);
  elements.soundToggleButton.addEventListener("click", handleSoundToggleClick);

  loadSettings();
});
