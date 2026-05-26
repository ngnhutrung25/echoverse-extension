import {
  MESSAGE_TYPES,
  DEFAULTS,
  STORAGE_KEYS,
  ALARM_NAMES,
} from "../constants.js";

// Track whether overlay is currently showing
let overlayActive = false;
import { log } from "../helpers.js";

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
      ? overlayActive
        ? "---"
        : formatCountdown(nextDueState.recurring)
      : "--";
  }

  function renderNextRemindersImmediate() {
    const intervalMinutes =
      Number(elements.recurringIntervalValue.textContent) || 15;
    nextDueState.recurring = elements.recurringToggle.checked
      ? Date.now() + intervalMinutes * 60 * 1000
      : null;
    renderNextReminders();
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

  // ─── Load settings directly from storage ──────────────────────────────────

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

  async function loadSettings() {
    clearStatus();
    try {
      const keys = [
        STORAGE_KEYS.SOUND_ENABLED,
        STORAGE_KEYS.DAILY_STATS,
        STORAGE_KEYS.HOURLY_ENABLED,
        STORAGE_KEYS.HOURLY_NEXT_DUE_AT,
        STORAGE_KEYS.RECURRING_ENABLED,
        STORAGE_KEYS.RECURRING_INTERVAL_MINUTES,
        STORAGE_KEYS.RECURRING_NEXT_DUE_AT,
        STORAGE_KEYS.OVERLAY_ACTIVE,
      ];

      // Fetch storage + both alarms in parallel
      const [raw, hourlyAlarmDue, recurringAlarmDue] = await Promise.all([
        chrome.storage.sync.get(keys),
        getAlarmNextDueAt(ALARM_NAMES.HOURLY),
        getAlarmNextDueAt(ALARM_NAMES.RECURRING),
      ]);

      const hourlyEnabled = raw[STORAGE_KEYS.HOURLY_ENABLED] === true;
      const recurringEnabled = raw[STORAGE_KEYS.RECURRING_ENABLED] === true;
      const soundEnabled = raw[STORAGE_KEYS.SOUND_ENABLED] !== false;
      const intervalMinutes =
        Number(raw[STORAGE_KEYS.RECURRING_INTERVAL_MINUTES]) ||
        DEFAULTS.RECURRING_INTERVAL_MINUTES;
      const dailyStats = raw[STORAGE_KEYS.DAILY_STATS] || {};

      overlayActive = raw[STORAGE_KEYS.OVERLAY_ACTIVE] === true;

      setSoundIconState(soundEnabled);
      setMode(hourlyEnabled, recurringEnabled);
      elements.recurringIntervalValue.textContent = String(intervalMinutes);

      nextDueState.hourly = hourlyEnabled
        ? hourlyAlarmDue || raw[STORAGE_KEYS.HOURLY_NEXT_DUE_AT] || null
        : null;
      // Prefer storage value over alarm scheduled time — storage is updated
      // immediately on snooze (5 min), while the recurring alarm still fires
      // on the original interval.
      nextDueState.recurring = recurringEnabled
        ? raw[STORAGE_KEYS.RECURRING_NEXT_DUE_AT] || recurringAlarmDue || null
        : null;

      const todayKey = new Date().toISOString().slice(0, 10);
      const todayStats = dailyStats[todayKey] || { shown: 0 };
      elements.todayCount.textContent = String(todayStats.shown || 0);

      startCountdownRenderLoop();
    } catch (error) {
      log("Error loading settings:", error);
      updateStatus("Failed to load settings", true);
    }
  }

  // ─── Sync timer state to background ───────────────────────────────────────

  async function syncTimerState() {
    const intervalValue = Number(elements.recurringIntervalValue.textContent);

    const payload = {
      type: MESSAGE_TYPES.START_TIMER,
      hourlyEnabled: elements.hourlyToggle.checked,
      recurringEnabled: elements.recurringToggle.checked,
      recurringIntervalMinutes: intervalValue,
      hourlyIntervalMinutes: DEFAULTS.HOURLY_INTERVAL_MINUTES,
    };

    try {
      const response = await chrome.runtime.sendMessage(payload);

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
    renderNextRemindersImmediate();
    syncTimerState();
  }

  // ─── Event listeners ───────────────────────────────────────────────────────

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

  // Listen for storage changes to update overlay state and snooze countdown in realtime
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (STORAGE_KEYS.OVERLAY_ACTIVE in changes) {
      overlayActive = changes[STORAGE_KEYS.OVERLAY_ACTIVE].newValue === true;
      renderNextReminders();
    }

    if (STORAGE_KEYS.RECURRING_NEXT_DUE_AT in changes) {
      const newVal = changes[STORAGE_KEYS.RECURRING_NEXT_DUE_AT].newValue;
      nextDueState.recurring = newVal || null;
      renderNextReminders();
    }
  });

  loadSettings();
});
