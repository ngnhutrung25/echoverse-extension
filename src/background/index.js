import {
  MESSAGE_TYPES,
  ALARM_NAMES,
  DEFAULTS,
  ACTIONS,
  STORAGE_KEYS,
  MODES,
  SOUNDS,
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
  updateTodayStats,
  invalidate,
} from "../store.js";

// ─── ALARM SCHEDULING ────────────────────────────────────────────────────────

function getNextTopOfHour(now = Date.now()) {
  const date = new Date(now);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date.getTime();
}

async function ensureHourlyAlarm() {
  await chrome.alarms.clear(ALARM_NAMES.HOURLY);
  await chrome.alarms.create(ALARM_NAMES.HOURLY, {
    when: getNextTopOfHour(),
    periodInMinutes: DEFAULTS.HOURLY_INTERVAL_MINUTES,
  });
}

async function ensureRecurringAlarm(intervalMinutes) {
  await chrome.alarms.clear(ALARM_NAMES.RECURRING);
  await chrome.alarms.create(ALARM_NAMES.RECURRING, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });
}

// ─── CORE REMINDER LOGIC ─────────────────────────────────────────────────────

async function triggerReminder(mode) {
  const data = await getData();
  const reminderState = data[mode];

  if (!reminderState.enabled) {
    log(`Reminder skipped because ${mode} is off.`);
    return;
  }

  const now = new Date();
  const hours = now.getHours();

  const message =
    mode === MODES.HOURLY
      ? DEFAULTS.HOURLY_MESSAGE.replace("{hour}", hours)
      : DEFAULTS.RECURRING_MESSAGE;

  await updateTodayStats(ACTIONS.SHOWN);

  sendNotification(message);

  await playSound(mode === MODES.RECURRING ? SOUNDS.BEEP : SOUNDS.BELL);

  if (mode === MODES.RECURRING) {
    const imageUrl = await getRandomPreloadedImage();
    sendToTabs({
      type: MESSAGE_TYPES.SHOW_OVERLAY,
      payload: { imageUrl },
    });
  }

  log(`Reminder fired (${mode}).`);
}

// ─── SYSTEM INITIALIZATION & REHYDRATION ─────────────────────────────────────

async function rehydrateScheduler() {
  const data = await loadAll();

  if (data.hourly.enabled) {
    await ensureHourlyAlarm();
    log(`HOURLY scheduler restored.`);
  } else {
    await chrome.alarms.clear(ALARM_NAMES.HOURLY);
    log(`HOURLY scheduler remains off.`);
  }

  if (data.recurring.enabled) {
    await ensureRecurringAlarm(normalizeInterval(data.recurring));
    log(`RECURRING scheduler restored.`);
  } else {
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
    log(`RECURRING scheduler remains off.`);
  }
}

async function ensureSchedulerReady() {
  const data = await getData();
  const [hourlyAlarm, recurringAlarm] = await Promise.all([
    chrome.alarms.get(ALARM_NAMES.HOURLY),
    chrome.alarms.get(ALARM_NAMES.RECURRING),
  ]);

  if (data.hourly.enabled && !hourlyAlarm) {
    await ensureHourlyAlarm();
    log("HOURLY scheduler healed from missing alarm.");
  }

  if (data.recurring.enabled && !recurringAlarm) {
    await ensureRecurringAlarm(normalizeInterval(data.recurring));
    log("RECURRING scheduler healed from missing alarm.");
  }
}

// ─── MESSAGE HANDLERS ────────────────────────────────────────────────────────

async function handleOverlayActionMessage(message, sendResponse) {
  log(`[overlay] action received: ${message.action}`);

  if (message.action === ACTIONS.PAUSE) {
    await setData({ [STORAGE_KEYS.RECURRING_ENABLED]: false });
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
    sendToTabs({ type: MESSAGE_TYPES.HIDE_OVERLAY });
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === ACTIONS.SKIP) {
    sendToTabs({ type: MESSAGE_TYPES.HIDE_OVERLAY });
    sendResponse({ ok: true });
    return true;
  }
}

async function handleStartTimerMessage(message, sendResponse) {
  const data = await getData();
  const enabledModes = [];
  const patch = {};

  // ── Hourly ──
  if (message.hourlyEnabled) {
    if (!data.hourly.enabled) {
      await ensureHourlyAlarm();
    }
    Object.assign(patch, { [STORAGE_KEYS.HOURLY_ENABLED]: true });
    enabledModes.push("theo giờ");
  } else {
    Object.assign(patch, { [STORAGE_KEYS.HOURLY_ENABLED]: false });
    await chrome.alarms.clear(ALARM_NAMES.HOURLY);
  }

  // ── Recurring ──
  if (message.recurringEnabled) {
    const intervalMinutes = normalizeInterval(message);
    Object.assign(patch, {
      [STORAGE_KEYS.RECURRING_ENABLED]: true,
      [STORAGE_KEYS.RECURRING_INTERVAL_MINUTES]: intervalMinutes,
    });
    await ensureRecurringAlarm(intervalMinutes);
    enabledModes.push("lặp lại");
  } else {
    Object.assign(patch, { [STORAGE_KEYS.RECURRING_ENABLED]: false });
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
  }

  await setData(patch);

  const [hourlyAlarm, recurringAlarm] = await Promise.all([
    chrome.alarms.get(ALARM_NAMES.HOURLY),
    chrome.alarms.get(ALARM_NAMES.RECURRING),
  ]);

  sendResponse({
    status:
      enabledModes.length > 0
        ? `Echoverse đã bật: ${enabledModes.join(" + ")}.`
        : "Echoverse đã tắt hết chuông báo.",
    hourlyNextDueAt: hourlyAlarm?.scheduledTime ?? null,
    recurringNextDueAt: recurringAlarm?.scheduledTime ?? null,
  });
  return true;
}

async function handleToggleSoundMessage(sendResponse) {
  try {
    const data = await getData();
    const newSoundEnabled = !data.common.soundEnabled;
    await setData({ [STORAGE_KEYS.SOUND_ENABLED]: newSoundEnabled });
    log(`Sound ${newSoundEnabled ? "enabled" : "disabled"}.`);
    sendResponse({ soundEnabled: newSoundEnabled });
  } catch (error) {
    log(`Error toggling sound: ${error.message}`);
    sendResponse({ error: error.message });
  }
  return true;
}

// ─── ALARM LISTENERS ─────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case ALARM_NAMES.HOURLY:
      triggerReminder(MODES.HOURLY);
      break;
    case ALARM_NAMES.RECURRING:
      triggerReminder(MODES.RECURRING);
      break;
  }
});

// ─── MESSAGE LISTENERS ───────────────────────────────────────────────────────

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

// ─── LIFECYCLE LISTENERS ─────────────────────────────────────────────────────

// Guard against concurrent startup runs
let startupHandling = false;

// Chrome extension startup: initialize scheduler
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

chrome.runtime.onInstalled.addListener(async (details) => {
  log(`Extension installed/updated: ${details.reason}`);
  await rehydrateScheduler();
});

// Chrome tab changes: rehydrateScheduler fallback
chrome.tabs.onActivated.addListener(async () => {
  try {
    await ensureSchedulerReady();
  } catch (error) {
    log(`Error healing on tab activation: ${error.message}`);
  }
});

// Chrome window focus changes: rehydrateScheduler fallback
chrome.windows.onFocusChanged.addListener(async () => {
  try {
    await ensureSchedulerReady();
  } catch (error) {
    log(`Error healing on window focus change: ${error.message}`);
  }
});

let wasLocked = false;

// Chrome idle state changes: main logic
chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "locked") {
    wasLocked = true;
    log("System locked — clearing alarms...");
    try {
      await Promise.all([
        chrome.alarms.clear(ALARM_NAMES.HOURLY),
        chrome.alarms.clear(ALARM_NAMES.RECURRING),
      ]);
      invalidate();
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

  if (state === "idle") log("System idle.");
  if (state === "active") log("System active after idle.");
});
