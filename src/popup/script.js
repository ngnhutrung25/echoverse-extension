import { MESSAGE_TYPES, DEFAULTS, STORAGE_KEYS } from "../constants.js";
import { log } from "../helpers.js";

document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    hourlyToggle: document.getElementById("hourly-toggle"),
    recurringToggle: document.getElementById("recurring-toggle"),
    hourlySettings: document.getElementById("hourly-settings"),
    recurringSettings: document.getElementById("recurring-settings"),
    pauseButton: document.getElementById("pause-toggle"),
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

  /*
   * Status functions
   */
  let statusTimer = null;

  function updateStatus(message, isError = false) {
    if (statusTimer) {
      clearTimeout(statusTimer);
    }

    elements.statusBox.classList.remove("hidden");
    elements.statusDiv.dataset.error = String(isError);
    elements.statusDiv.textContent = message;

    statusTimer = setTimeout(() => {
      clearStatus();
    }, DEFAULTS.STATUS_TIMEOUT_MS);
  }

  function clearStatus() {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }

    elements.statusDiv.textContent = "";
    elements.statusBox.classList.add("hidden");
  }

  /*
   * Sound toggle functions
   */
  function setSoundIconState(soundEnabled) {
    elements.soundToggleButton
      .querySelector("#sound-toggle-bell")
      ?.classList.toggle("hidden", !soundEnabled);
    elements.soundToggleButton
      .querySelector("#sound-toggle-bell-slash")
      ?.classList.toggle("hidden", soundEnabled);
    elements.soundToggleButton.dataset.enabled = String(soundEnabled);
  }

  function getSoundIconState() {
    return elements.soundToggleButton.dataset.enabled !== "false";
  }

  async function handleSoundToggleClick() {
    const nextEnabled = !getSoundIconState();

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.TOGGLE_SOUND,
      });

      if (response && typeof response.soundEnabled === "boolean") {
        setSoundIconState(response.soundEnabled);
      } else {
        setSoundIconState(nextEnabled);
      }
    } catch (error) {
      log("Error toggling sound:", error);
      updateStatus("Failed to toggle sound", true);
    }
  }

  /*
   * Mode functions
   */
  function syncModeUI() {
    elements.hourlySettings.classList.toggle(
      "hidden",
      !elements.hourlyToggle.checked,
    );
    elements.recurringSettings.classList.toggle(
      "hidden",
      !elements.recurringToggle.checked,
    );
    elements.pauseButton.disabled = !elements.recurringToggle.checked;
  }

  function setMode(hourly, recurring) {
    elements.hourlyToggle.checked = hourly;
    elements.recurringToggle.checked = recurring;
    syncModeUI();
  }

  function setPauseButtonState(paused) {
    elements.pauseButton.dataset.paused = String(paused);
    elements.pauseButton.textContent = paused ? "Bật lại" : "Pause";
    elements.pauseButton.setAttribute(
      "aria-label",
      paused ? "Resume recurring reminders" : "Pause recurring reminders",
    );
  }

  /*
   * Get settings functions
   */
  async function loadSettings() {
    clearStatus();
    try {
      const data = await chrome.storage.sync.get([
        STORAGE_KEYS.HOURLY_ENABLED,
        STORAGE_KEYS.HOURLY_INTERVAL_MINUTES,
        STORAGE_KEYS.RECURRING_ENABLED,
        STORAGE_KEYS.RECURRING_PAUSED,
        STORAGE_KEYS.RECURRING_INTERVAL_MINUTES,
        STORAGE_KEYS.DAILY_STATS,
        STORAGE_KEYS.SOUND_ENABLED,
      ]);

      setSoundIconState(data.soundEnabled !== false);
      setMode(data.hourlyEnabled !== false, data.recurringEnabled !== false);
      setPauseButtonState(data.recurringPaused === true);
      elements.recurringIntervalValue.textContent = String(
        data.recurringIntervalMinutes || 30,
      );

      const statsDayKey = new Date().toISOString().slice(0, 10);
      const todayStats = (data.dailyStats && data.dailyStats[statsDayKey]) || {
        shown: 0,
      };
      elements.todayCount.textContent = String(todayStats.shown || 0);
    } catch (error) {
      log("Error loading settings:", error);
      updateStatus("Failed to load settings", true);
    }
  }

  /*
   * Start button functions
   */
  async function handleStartButtonClick() {
    const intervalValue = +elements.recurringIntervalValue.textContent;

    const payload = {
      type: MESSAGE_TYPES.START_TIMER,
      hourlyEnabled: elements.hourlyToggle.checked,
      recurringEnabled: elements.recurringToggle.checked,
      recurringIntervalMinutes: intervalValue,
    };

    try {
      const response = await chrome.runtime.sendMessage(payload);

      if (response && response.status) {
        updateStatus(response.status);
        await chrome.storage.sync.set({
          hourlyEnabled: payload.hourlyEnabled,
          recurringEnabled: payload.recurringEnabled,
          recurringIntervalMinutes: payload.recurringIntervalMinutes,
        });
      } else if (response && response.error) {
        updateStatus(response.error, true);
      }
    } catch (error) {
      log("Error starting timer:", error);
      updateStatus("Failed to start timer", true);
    }
  }

  async function handlePauseButtonClick() {
    const nextPaused = elements.pauseButton.dataset.paused !== "true";

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.SET_RECURRING_PAUSED,
        recurringPaused: nextPaused,
      });

      if (response && typeof response.recurringPaused === "boolean") {
        setPauseButtonState(response.recurringPaused);
      } else {
        setPauseButtonState(nextPaused);
      }
    } catch (error) {
      log("Error updating pause state:", error);
      updateStatus("Failed to update pause state", true);
    }
  }

  /**
   * Step interval up or down
   * @param {number} delta - Amount to step (positive or negative)
   */
  function stepInterval(delta) {
    const current = +elements.recurringIntervalValue.textContent;
    const next = Math.max(5, current + delta);
    elements.recurringIntervalValue.textContent = next;
  }

  elements.hourlyToggle.addEventListener("change", syncModeUI);
  elements.recurringToggle.addEventListener("change", syncModeUI);
  elements.decrementButton.addEventListener("click", () => stepInterval(-5));
  elements.incrementButton.addEventListener("click", () => stepInterval(5));
  elements.startButton.addEventListener("click", handleStartButtonClick);
  elements.soundToggleButton.addEventListener("click", handleSoundToggleClick);
  elements.pauseButton.addEventListener("click", handlePauseButtonClick);

  loadSettings();
});
