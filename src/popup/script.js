import { MESSAGE_TYPES, DEFAULTS } from "../constants.js";
import { log } from "../helpers.js";
import store from "../state/store.js";

document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    hourlyToggle: document.getElementById("hourly-toggle"),
    recurringToggle: document.getElementById("recurring-toggle"),
    hourlySettings: document.getElementById("hourly-settings"),
    recurringSettings: document.getElementById("recurring-settings"),
    recurringIntervalControls: document.getElementById(
      "recurring-interval-controls",
    ),
    statusBox: document.getElementById("status-box"),
    statusDiv: document.getElementById("status"),
    todayCount: document.getElementById("today-count"),
    hourlyNextReminder: document.getElementById("hourly-next-reminder"),
    recurringNextReminder: document.getElementById("recurring-next-reminder"),
    recurringIntervalValue: document.getElementById("recurring-interval"),
    decrementButton: document.getElementById("decrement-button"),
    incrementButton: document.getElementById("increment-button"),
    soundToggleButton: document.getElementById("sound-toggle"),
  };
  let renderTimer = null;
  const nextDueState = {
    hourly: null,
    recurring: null,
  };

  /*
   * Status functions
   */
  let statusTimer = null;
  let statusHideTimer = null;

  function updateStatus(message, isError = false) {
    if (statusTimer) {
      clearTimeout(statusTimer);
    }
    if (statusHideTimer) {
      clearTimeout(statusHideTimer);
      statusHideTimer = null;
    }

    elements.statusBox.classList.remove("hidden");
    elements.statusBox.classList.add("visible");
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
    if (statusHideTimer) {
      clearTimeout(statusHideTimer);
    }

    elements.statusBox.classList.remove("visible");
    statusHideTimer = setTimeout(() => {
      elements.statusDiv.textContent = "";
      elements.statusBox.classList.add("hidden");
      statusHideTimer = null;
    }, 260);
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

  function formatCountdown(nextDueAt) {
    if (!nextDueAt) {
      return "--";
    }

    const remainingMs = nextDueAt - Date.now();
    if (remainingMs <= 0) {
      return "Sắp tới";
    }

    const totalMinutes = Math.ceil(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) {
      return `Còn ${totalMinutes} phút`;
    }

    if (minutes <= 0) {
      return `Còn ${hours} giờ`;
    }

    return `Còn ${hours} giờ ${minutes} phút`;
  }

  function renderNextReminders() {
    elements.hourlyNextReminder.textContent = elements.hourlyToggle.checked
      ? formatCountdown(nextDueState.hourly)
      : "--";
    elements.recurringNextReminder.textContent = elements.recurringToggle
      .checked
      ? formatCountdown(nextDueState.recurring)
      : "--";
  }

  async function getAlarmNextDueAt(alarmName) {
    return new Promise((resolve) => {
      chrome.alarms.get(alarmName, (alarm) => {
        if (chrome.runtime.lastError || !alarm?.scheduledTime) {
          resolve(null);
          return;
        }

        resolve(alarm.scheduledTime);
      });
    });
  }

  function renderNextRemindersImmediate() {
    const recurringInterval =
      Number(elements.recurringIntervalValue.textContent) || 15;
    nextDueState.recurring = elements.recurringToggle.checked
      ? Date.now() + recurringInterval * 60 * 1000
      : null;
    renderNextReminders();
  }

  function startCountdownRenderLoop() {
    if (renderTimer) {
      clearInterval(renderTimer);
    }

    renderNextReminders();
    renderTimer = setInterval(renderNextReminders, 1000);
  }

  function syncModeUI() {
    elements.hourlySettings.classList.remove("hidden");
    elements.hourlySettings.classList.toggle(
      "disabled",
      !elements.hourlyToggle.checked,
    );
    elements.recurringSettings.classList.remove("hidden");
    elements.recurringSettings.classList.toggle(
      "disabled",
      !elements.recurringToggle.checked,
    );
  }

  function setMode(hourly, recurring) {
    elements.hourlyToggle.checked = hourly;
    elements.recurringToggle.checked = recurring;
    syncModeUI();
  }

  /*
   * Get settings functions
   */
  async function loadSettings() {
    clearStatus();
    try {
      await store.init();
      const settingsState = store.getSettingsState();
      const hourlyState = store.getReminderState("hourly");
      const recurringState = store.getReminderState("recurring");
      const statsState = store.getStatsState();

      setSoundIconState(settingsState.soundEnabled !== false);
      setMode(hourlyState.enabled !== false, recurringState.enabled !== false);
      syncModeUI();
      elements.recurringIntervalValue.textContent = String(
        recurringState.intervalMinutes || 15,
      );
      nextDueState.hourly =
        hourlyState.enabled === true
          ? (await getAlarmNextDueAt("echoverse-hourly-reminder")) ||
            hourlyState.nextDueAt
          : null;
      nextDueState.recurring =
        recurringState.enabled === true
          ? (await getAlarmNextDueAt("echoverse-recurring-reminder")) ||
            recurringState.nextDueAt
          : null;

      const statsDayKey = new Date().toISOString().slice(0, 10);
      const todayStats = (statsState.dailyStats &&
        statsState.dailyStats[statsDayKey]) || {
        shown: 0,
      };
      elements.todayCount.textContent = String(todayStats.shown || 0);
      startCountdownRenderLoop();
    } catch (error) {
      log("Error loading settings:", error);
      updateStatus("Failed to load settings", true);
    }
  }

  async function syncTimerState() {
    const intervalValue = +elements.recurringIntervalValue.textContent;

    const payload = {
      type: MESSAGE_TYPES.START_TIMER,
      hourlyEnabled: elements.hourlyToggle.checked,
      recurringEnabled: elements.recurringToggle.checked,
      recurringIntervalMinutes: intervalValue,
      hourlyIntervalMinutes: DEFAULTS.HOURLY_INTERVAL_MINUTES,
    };

    try {
      const response = await chrome.runtime.sendMessage(payload);

      if (
        response &&
        Object.prototype.hasOwnProperty.call(response, "hourlyNextDueAt")
      ) {
        nextDueState.hourly = response.hourlyNextDueAt;
      }
      if (
        response &&
        Object.prototype.hasOwnProperty.call(response, "recurringNextDueAt")
      ) {
        nextDueState.recurring = response.recurringNextDueAt;
      } else {
        nextDueState.recurring = elements.recurringToggle.checked
          ? Date.now() + intervalValue * 60 * 1000
          : null;
      }

      renderNextReminders();

      if (response && response.status) {
        updateStatus("Đã cập nhật chuông báo");
      } else if (response && response.error) {
        updateStatus(response.error, true);
      }
    } catch (error) {
      log("Error syncing timer state:", error);
      updateStatus("Không thể cập nhật chuông báo", true);
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
    renderNextRemindersImmediate();
    syncTimerState();
  }

  elements.hourlyToggle.addEventListener("change", () => {
    syncModeUI();
    renderNextRemindersImmediate();
    syncTimerState();
  });
  elements.recurringToggle.addEventListener("change", () => {
    syncModeUI();
    renderNextRemindersImmediate();
    syncTimerState();
  });
  elements.decrementButton.addEventListener("click", () => stepInterval(-5));
  elements.incrementButton.addEventListener("click", () => stepInterval(5));
  elements.soundToggleButton.addEventListener("click", handleSoundToggleClick);

  loadSettings();
});
