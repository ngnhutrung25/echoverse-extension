import { MESSAGE_TYPES, DEFAULTS } from "../constants.js";
import { log, getTodayKey } from "../helpers.js";

document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    hourlyToggle: document.getElementById("hourly-toggle"),
    recurringToggle: document.getElementById("recurring-toggle"),
    hourlySettings: document.getElementById("hourly-settings"),
    recurringSettings: document.getElementById("recurring-settings"),
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

  const nextDueState = { hourly: null, recurring: null };
  let renderTimer = null;
  let statusTimer = null;
  let statusHideTimer = null;

  // ─── Status ────────────────────────────────────────────────────────────────

  function updateStatus(message, isError = false) {
    clearTimeout(statusTimer);
    clearTimeout(statusHideTimer);
    statusHideTimer = null;

    elements.statusBox.classList.remove("hidden");
    elements.statusBox.classList.add("visible");
    elements.statusDiv.dataset.error = String(isError);
    elements.statusDiv.textContent = message;

    statusTimer = setTimeout(clearStatus, DEFAULTS.STATUS_TIMEOUT_MS);
  }

  function clearStatus() {
    clearTimeout(statusTimer);
    statusTimer = null;
    clearTimeout(statusHideTimer);

    elements.statusBox.classList.remove("visible");
    statusHideTimer = setTimeout(() => {
      elements.statusDiv.textContent = "";
      elements.statusBox.classList.add("hidden");
      statusHideTimer = null;
    }, 260);
  }

  // ─── Sound icon ────────────────────────────────────────────────────────────

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
      setSoundIconState(
        response && typeof response.soundEnabled === "boolean"
          ? response.soundEnabled
          : nextEnabled,
      );
    } catch (error) {
      log("Error toggling sound:", error);
      updateStatus("Failed to toggle sound", true);
    }
  }

  // ─── Countdown display ─────────────────────────────────────────────────────

  function formatCountdown(nextDueAt) {
    if (!nextDueAt) return "--";
    const remainingMs = nextDueAt - Date.now();
    if (remainingMs <= 0) return "Sắp tới";

    const totalMinutes = Math.ceil(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) return `Còn ${totalMinutes} phút`;
    if (minutes <= 0) return `Còn ${hours} giờ`;
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

  function startCountdownRenderLoop() {
    clearInterval(renderTimer);
    renderNextReminders();
    renderTimer = setInterval(renderNextReminders, 1000);
  }

  // ─── UI state ──────────────────────────────────────────────────────────────

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

  // ─── Load settings ─────────────────────────────────────────────────────────

  async function loadSettings() {
    clearStatus();
    try {
      const state = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_STATE,
      });

      if (state?.error) throw new Error(state.error);

      const intervalMinutes =
        state.recurringIntervalMinutes || DEFAULTS.RECURRING_INTERVAL_MINUTES;
      const dailyStats = state.dailyStats || {};

      setSoundIconState(state.soundEnabled !== false);
      setMode(state.hourlyEnabled === true, state.recurringEnabled === true);
      elements.recurringIntervalValue.textContent = String(intervalMinutes);

      nextDueState.hourly = state.hourlyEnabled ? state.hourlyNextDueAt : null;
      nextDueState.recurring = state.recurringEnabled
        ? state.recurringNextDueAt
        : null;

      const todayKey = getTodayKey();
      const todayStats = dailyStats[todayKey] || { recurringShown: 0 };
      elements.todayCount.textContent = String(todayStats.recurringShown || 0);

      startCountdownRenderLoop();
    } catch (error) {
      log("Error loading settings:", error);
      updateStatus("Failed to load settings", true);
    }
  }

  // ─── Sync timer state to background ───────────────────────────────────────

  async function syncTimerState() {
    const intervalValue = Number(elements.recurringIntervalValue.textContent);

    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.START_TIMER,
        hourlyEnabled: elements.hourlyToggle.checked,
        recurringEnabled: elements.recurringToggle.checked,
        recurringIntervalMinutes: intervalValue,
        hourlyIntervalMinutes: DEFAULTS.HOURLY_INTERVAL_MINUTES,
      });

      if (response?.hourlyNextDueAt !== undefined) {
        nextDueState.hourly = response.hourlyNextDueAt;
      }
      nextDueState.recurring =
        response?.recurringNextDueAt !== undefined
          ? response.recurringNextDueAt
          : elements.recurringToggle.checked
            ? Date.now() + intervalValue * 60 * 1000
            : null;

      renderNextReminders();

      if (response?.status) {
        updateStatus("Đã cập nhật chuông báo");
      } else if (response?.error) {
        updateStatus(response.error, true);
      }
    } catch (error) {
      log("Error syncing timer state:", error);
      updateStatus("Không thể cập nhật chuông báo", true);
    }
  }

  // ─── Interval controls ─────────────────────────────────────────────────────

  function stepInterval(delta) {
    const current = Number(elements.recurringIntervalValue.textContent);
    const next = Math.max(5, current + delta);
    elements.recurringIntervalValue.textContent = next;
    syncTimerState();
  }

  // ─── Event listeners ───────────────────────────────────────────────────────

  elements.hourlyToggle.addEventListener("change", () => {
    syncModeUI();
    syncTimerState();
  });
  elements.recurringToggle.addEventListener("change", () => {
    syncModeUI();
    syncTimerState();
  });
  elements.decrementButton.addEventListener("click", () => stepInterval(-5));
  elements.incrementButton.addEventListener("click", () => stepInterval(5));
  elements.soundToggleButton.addEventListener("click", handleSoundToggleClick);

  loadSettings();
});
