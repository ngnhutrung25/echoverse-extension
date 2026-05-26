import {
  MESSAGE_TYPES,
  ALARM_NAMES,
  DEFAULTS,
  MODES,
  ACTIONS,
  STORAGE_KEYS,
} from "../constants.js";
import { log } from "../helpers.js";
import { getRandomPreloadedImage } from "./image.js";
import { playSound } from "./sound.js";
import { sendToTabs, normalizeInterval } from "./utils.js";
import { sendNotification } from "./notification.js";
import {
  getData,
  loadAll,
  setData,
  updateReminderTiming,
  updateTodayStats,
  updateSettings,
  shouldDebounce,
  invalidate,
} from "../store.js";

// ─── Guard against concurrent startup runs ────────────────────────────────────
let startupHandling = false;

// ========================================
// ALARM SCHEDULING
// ========================================

function getNextTopOfHour(now = Date.now()) {
  const date = new Date(now);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date.getTime();
}

async function ensureHourlyTopOfHourAlarm() {
  const nextDueAt = getNextTopOfHour();
  await chrome.alarms.clear(ALARM_NAMES.HOURLY);
  await chrome.alarms.create(ALARM_NAMES.HOURLY, {
    when: nextDueAt,
    periodInMinutes: DEFAULTS.HOURLY_INTERVAL_MINUTES,
  });
  return nextDueAt;
}

async function ensureReminderAlarm(mode, intervalMinutes) {
  const alarmName =
    mode === MODES.HOURLY ? ALARM_NAMES.HOURLY : ALARM_NAMES.RECURRING;
  await chrome.alarms.clear(alarmName);
  await chrome.alarms.create(alarmName, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });
}

// ========================================
// CORE REMINDER LOGIC
// ========================================

async function triggerReminder(mode, options = {}) {
  const { updateTiming = true } = options;
  const now = Date.now();

  const data = await getData();
  const reminderState = data[mode];

  if (!reminderState.enabled) {
    log(`Reminder skipped because ${mode} is off.`);
    return;
  }

  if (await shouldDebounce(mode, now)) {
    log(`Reminder skipped by debounce.`);
    return;
  }

  const isHourly = mode === MODES.HOURLY;

  if (updateTiming) {
    await updateReminderTiming(mode, now);
  } else {
    // Snooze fired: update lastTriggeredAt and reset nextDueAt to start a fresh cycle
    const data = await getData();
    const intervalMinutes = data[mode].intervalMinutes;
    const nextDueAt = now + intervalMinutes * 60 * 1000;
    await setData({
      [isHourly
        ? STORAGE_KEYS.HOURLY_LAST_TRIGGERED_AT
        : STORAGE_KEYS.RECURRING_LAST_TRIGGERED_AT]: now,
      [isHourly
        ? STORAGE_KEYS.HOURLY_NEXT_DUE_AT
        : STORAGE_KEYS.RECURRING_NEXT_DUE_AT]: nextDueAt,
    });
  }

  await updateTodayStats(ACTIONS.SHOWN);

  sendNotification(reminderState.message);
  await playSound(mode === MODES.RECURRING ? "beep" : "bell");

  if (mode === MODES.RECURRING) {
    const imageUrl = await getRandomPreloadedImage();
    await setData({ [STORAGE_KEYS.OVERLAY_ACTIVE]: true });
    sendToTabs({
      type: MESSAGE_TYPES.SHOW_OVERLAY,
      payload: {
        id: String(now),
        title: "Time to rest",
        message: reminderState.message,
        imageUrl,
      },
    });
  }

  log(`Reminder fired (${mode}).`);
}

// ========================================
// SYSTEM INITIALIZATION & REHYDRATION
// ========================================

async function rehydrateScheduler() {
  const data = await loadAll(); // always reload fresh from storage

  const hourlyEnabled = data.hourly.enabled === true;
  const recurringEnabled = data.recurring.enabled === true;
  const recurringIntervalMinutes = normalizeInterval(data.recurring);

  if (hourlyEnabled) {
    await ensureHourlyTopOfHourAlarm();
    log(`HOURLY scheduler restored.`);
  } else {
    await chrome.alarms.clear(ALARM_NAMES.HOURLY);
    log(`HOURLY scheduler remains off.`);
  }

  if (recurringEnabled) {
    await ensureReminderAlarm(MODES.RECURRING, recurringIntervalMinutes);
    log(`RECURRING scheduler restored.`);
  } else {
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
    log(`RECURRING scheduler remains off.`);
  }
}

// ========================================
// MESSAGE HANDLERS
// ========================================

async function handleOverlayActionMessage(message, sendResponse) {
  log(`[overlay] action received: ${message.type}`);

  await updateTodayStats(message.action);

  if (message.action === ACTIONS.SNOOZE) {
    const snoozeMs = DEFAULTS.SNOOZE_DELAY_MINUTES * 60 * 1000;
    const nextDueAt = Date.now() + snoozeMs;
    await chrome.alarms.clear(ALARM_NAMES.SNOOZE);
    await chrome.alarms.create(ALARM_NAMES.SNOOZE, {
      delayInMinutes: DEFAULTS.SNOOZE_DELAY_MINUTES,
    });
    await setData({
      [STORAGE_KEYS.OVERLAY_ACTIVE]: false,
      [STORAGE_KEYS.RECURRING_NEXT_DUE_AT]: nextDueAt,
    });
    log(`Snoozed for ${DEFAULTS.SNOOZE_DELAY_MINUTES} minutes.`);
    sendToTabs({ type: MESSAGE_TYPES.HIDE_OVERLAY });
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === ACTIONS.PAUSE) {
    await setData({
      [STORAGE_KEYS.OVERLAY_ACTIVE]: false,
      [STORAGE_KEYS.RECURRING_ENABLED]: false,
      [STORAGE_KEYS.RECURRING_LAST_TRIGGERED_AT]: null,
      [STORAGE_KEYS.RECURRING_NEXT_DUE_AT]: null,
    });
    await chrome.alarms.clear(ALARM_NAMES.SNOOZE);
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
    sendToTabs({ type: MESSAGE_TYPES.HIDE_OVERLAY });
    sendResponse({ ok: true });
    return true;
  }

  // SKIP or any other action
  // Recalculate nextDueAt from the actual recurring alarm so popup shows correct countdown
  const recurringAlarm = await chrome.alarms.get(ALARM_NAMES.RECURRING);
  const nextDueAt = recurringAlarm?.scheduledTime ?? null;
  await setData({
    [STORAGE_KEYS.OVERLAY_ACTIVE]: false,
    ...(nextDueAt !== null && {
      [STORAGE_KEYS.RECURRING_NEXT_DUE_AT]: nextDueAt,
    }),
  });
  sendToTabs({ type: MESSAGE_TYPES.HIDE_OVERLAY });
  sendResponse({ ok: true });
  return true;
}

async function handleStartTimerMessage(message, sendResponse) {
  const data = await getData();
  const now = Date.now();
  const enabledModes = [];
  const patch = {};

  // ── Hourly ──
  if (message.hourlyEnabled) {
    const intervalMinutes = Math.max(
      1,
      Number(
        message.hourlyIntervalMinutes ||
          data.hourly.intervalMinutes ||
          DEFAULTS.HOURLY_INTERVAL_MINUTES,
      ),
    );

    const shouldRefresh =
      data.hourly.enabled !== true ||
      data.hourly.nextDueAt == null ||
      data.hourly.intervalMinutes !== intervalMinutes;

    const nextDueAt = shouldRefresh
      ? await ensureHourlyTopOfHourAlarm()
      : data.hourly.nextDueAt;

    Object.assign(patch, {
      [STORAGE_KEYS.HOURLY_ENABLED]: true,
      [STORAGE_KEYS.HOURLY_INTERVAL_MINUTES]: intervalMinutes,
      [STORAGE_KEYS.HOURLY_MESSAGE]: DEFAULTS.MESSAGE,
      [STORAGE_KEYS.HOURLY_LAST_TRIGGERED_AT]: shouldRefresh
        ? null
        : data.hourly.lastTriggeredAt,
      [STORAGE_KEYS.HOURLY_NEXT_DUE_AT]: nextDueAt,
    });

    enabledModes.push("theo giờ");
  } else {
    Object.assign(patch, {
      [STORAGE_KEYS.HOURLY_ENABLED]: false,
      [STORAGE_KEYS.HOURLY_LAST_TRIGGERED_AT]: null,
      [STORAGE_KEYS.HOURLY_NEXT_DUE_AT]: null,
    });
    await chrome.alarms.clear(ALARM_NAMES.HOURLY);
  }

  // ── Recurring ──
  if (message.recurringEnabled) {
    const intervalMinutes = Math.max(
      1,
      Number(
        message.recurringIntervalMinutes ||
          data.recurring.intervalMinutes ||
          DEFAULTS.RECURRING_INTERVAL_MINUTES,
      ),
    );
    const nextDueAt = now + intervalMinutes * 60 * 1000;

    Object.assign(patch, {
      [STORAGE_KEYS.RECURRING_ENABLED]: true,
      [STORAGE_KEYS.RECURRING_INTERVAL_MINUTES]: intervalMinutes,
      [STORAGE_KEYS.RECURRING_MESSAGE]: DEFAULTS.MESSAGE,
      [STORAGE_KEYS.RECURRING_LAST_TRIGGERED_AT]: null,
      [STORAGE_KEYS.RECURRING_NEXT_DUE_AT]: nextDueAt,
    });

    await ensureReminderAlarm(MODES.RECURRING, intervalMinutes);
    enabledModes.push("lặp lại");
  } else {
    Object.assign(patch, {
      [STORAGE_KEYS.RECURRING_ENABLED]: false,
      [STORAGE_KEYS.RECURRING_LAST_TRIGGERED_AT]: null,
      [STORAGE_KEYS.RECURRING_NEXT_DUE_AT]: null,
    });
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
  }

  await setData(patch);

  const updated = await getData();
  sendResponse({
    status:
      enabledModes.length > 0
        ? `Echoverse đã bật: ${enabledModes.join(" + ")}.`
        : "Echoverse đã tắt hết chuông báo.",
    hourlyNextDueAt: updated.hourly.nextDueAt,
    recurringNextDueAt: updated.recurring.nextDueAt,
  });
  return true;
}

async function handleToggleSoundMessage(sendResponse) {
  try {
    const data = await getData();
    const newSoundEnabled = !data.common.soundEnabled;
    await updateSettings({ soundEnabled: newSoundEnabled });
    log(`Sound ${newSoundEnabled ? "enabled" : "disabled"}.`);
    sendResponse({ soundEnabled: newSoundEnabled });
  } catch (error) {
    log(`Error toggling sound: ${error.message}`);
    sendResponse({ error: error.message });
  }
  return true;
}

// ========================================
// ALARM LISTENERS
// ========================================

chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case ALARM_NAMES.HOURLY:
      triggerReminder(MODES.HOURLY);
      break;
    case ALARM_NAMES.RECURRING:
      triggerReminder(MODES.RECURRING);
      break;
    case ALARM_NAMES.SNOOZE:
      triggerReminder(MODES.RECURRING, { updateTiming: false });
      break;
  }
});

// ========================================
// MESSAGE LISTENERS
// ========================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.OVERLAY_ACTION) {
    handleOverlayActionMessage(message, sendResponse);
    return true;
  }
  if (message?.type === MESSAGE_TYPES.START_TIMER) {
    handleStartTimerMessage(message, sendResponse);
    return true;
  }
  if (message?.type === MESSAGE_TYPES.TOGGLE_SOUND) {
    handleToggleSoundMessage(sendResponse);
    return true;
  }
  return false;
});

// ========================================
// LIFECYCLE LISTENERS
// ========================================

// Rebuild alarms on browser startup
chrome.runtime.onStartup.addListener(async () => {
  if (startupHandling) return;
  startupHandling = true;
  try {
    log("Extension starting up...");
    await rehydrateScheduler();
    log("Extension startup completed.");
  } catch (error) {
    log(`Startup error: ${error.message}`);
  } finally {
    startupHandling = false;
  }
});

// Rebuild alarms on fresh install or update
chrome.runtime.onInstalled.addListener(async (details) => {
  log(`Extension installed/updated: ${details.reason}`);
  await rehydrateScheduler();
});

// Restore alarms on wake; clear on lock/sleep
let wasLocked = false;

chrome.idle.onStateChanged.addListener(async (state) => {
  // Handle lock/sleep state
  if (state === "locked") {
    wasLocked = true;
    log("System locked — clearing alarms...");
    try {
      await Promise.all([
        chrome.alarms.clear(ALARM_NAMES.HOURLY),
        chrome.alarms.clear(ALARM_NAMES.RECURRING),
        chrome.alarms.clear(ALARM_NAMES.SNOOZE),
      ]);
      // Wipe nextDueAt so rehydrate recalculates correctly on wake
      await setData({
        [STORAGE_KEYS.HOURLY_NEXT_DUE_AT]: null,
        [STORAGE_KEYS.RECURRING_NEXT_DUE_AT]: null,
      });
      invalidate(); // force fresh load on next getData()
      log("Alarms cleared on lock.");
    } catch (error) {
      log(`Error clearing alarms on lock: ${error.message}`);
    }
    return;
  }

  if (state === "active" && wasLocked) {
    wasLocked = false;
    log("System active after lock — rehydrating scheduler...");
    try {
      await rehydrateScheduler();
    } catch (error) {
      log(`Error rehydrating on wake: ${error.message}`);
    }
    return;
  }

  // Handle idle state
  if (state === "idle") {
    log("System idle.");
  }

  if (state === "active") {
    log("System active after idle.");
  }
});
