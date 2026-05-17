import {
  MESSAGE_TYPES,
  ALARM_NAMES,
  DEFAULTS,
  MODES,
  SOURCE_TYPES,
  ACTIONS,
} from "../constants.js";
import { log } from "../helpers.js";
import { getRandomPreloadedImage } from "./image.js";
import { playSound } from "./sound.js";
import { sendToTabs, normalizeInterval } from "./utils.js";
import { sendNotification } from "./notification.js";
import store from "../state/store.js";

// ========================================
// ALARM SCHEDULING
// ========================================

async function ensureReminderAlarm(mode, intervalMinutes) {
  const alarmName =
    mode === MODES.HOURLY ? ALARM_NAMES.HOURLY : ALARM_NAMES.RECURRING;
  await chrome.alarms.clear(alarmName);
  await chrome.alarms.create(alarmName, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });
}

// Hourly alarm bám đầu giờ kế tiếp để hiển thị countdown đúng theo clock.
async function ensureHourlyTopOfHourAlarm() {
  const nextDueAt = getNextTopOfHour();
  await chrome.alarms.clear(ALARM_NAMES.HOURLY);
  await chrome.alarms.create(ALARM_NAMES.HOURLY, {
    when: nextDueAt,
    periodInMinutes: DEFAULTS.HOURLY_INTERVAL_MINUTES,
  });
  return nextDueAt;
}

async function scheduleDailyReset() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  await chrome.alarms.create(ALARM_NAMES.DAILY_RESET, {
    when: nextMidnight.getTime(),
  });
}

function getNextTopOfHour(now = Date.now()) {
  const date = new Date(now);
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date.getTime();
}

// ========================================
// CORE REMINDER LOGIC
// ========================================

async function triggerReminder(mode, options = {}) {
  const { updateTiming = true } = options;
  const now = Date.now();
  // Read current reminder state from store.
  const reminderState = store.getReminderState(mode);
  const settingsState = store.getSettingsState();

  if (mode === MODES.RECURRING && settingsState.recurringPaused === true) {
    log(`Reminder skipped because recurring is paused.`);
    return;
  }

  if (!reminderState.enabled) {
    log(`Reminder skipped because ${mode} is off.`);
    return;
  }

  // Stop duplicate fire within debounce window.
  const reminderModel = store.getModel(mode);
  if (reminderModel.shouldDebounce(now)) {
    log(`Reminder skipped by debounce.`);
    return;
  }

  // Persist next due time and usage stats.
  if (updateTiming) {
    await store.updateReminderTiming(mode, now);
  } else {
    reminderModel.update({ lastTriggeredAt: now });
    await reminderModel.save();
  }
  await store.updateStats("SHOWN");

  // Notify user and play corresponding sound.
  sendNotification(reminderState.message);
  await playSound(mode === MODES.RECURRING ? "beep" : "bell");

  if (mode === MODES.RECURRING) {
    // Recurring mode also shows overlay content.
    const imageUrl = await getRandomPreloadedImage();
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

  if (mode === MODES.HOURLY) {
    log("Hourly reminder fired without overlay.");
  }
  log(`Reminder fired.`);
}

// ========================================
// OVERLAY ACTIONS & USER INTERACTIONS
// ========================================

async function handleOverlayAction(action) {
  // Track overlay action first.
  await store.updateStats(action);

  if (action === ACTIONS.SNOOZE) {
    await chrome.alarms.clear(ALARM_NAMES.SNOOZE);
    await chrome.alarms.create(ALARM_NAMES.SNOOZE, {
      delayInMinutes: DEFAULTS.SNOOZE_DELAY_MINUTES,
    });
    log(`Snoozed for ${DEFAULTS.SNOOZE_DELAY_MINUTES} minutes.`);
    sendToTabs({ type: MESSAGE_TYPES.HIDE_OVERLAY });
    return;
  }

  if (action === ACTIONS.PAUSE) {
    await store.updateSettings({
      recurringPaused: true,
    });
    await chrome.alarms.clear(ALARM_NAMES.SNOOZE);
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
    sendToTabs({ type: MESSAGE_TYPES.HIDE_OVERLAY });
    return;
  }

  sendToTabs({ type: MESSAGE_TYPES.HIDE_OVERLAY });
}

// ========================================
// SYSTEM INITIALIZATION & REHYDRATION
// ========================================

async function rehydrateScheduler(source = SOURCE_TYPES.STARTUP) {
  // Load persisted state before rebuilding alarms.
  await store.init();

  // Restore alarms from current stored state.
  const hourlyModel = store.getModel("hourly");
  const recurringModel = store.getModel("recurring");
  const settingsState = store.getSettingsState();

  const recurringIntervalMinutes = normalizeInterval(recurringModel.state);
  const recurringPaused = settingsState.recurringPaused === true;

  if (hourlyModel.state.enabled) {
    await ensureHourlyTopOfHourAlarm();
  } else {
    await chrome.alarms.clear(ALARM_NAMES.HOURLY);
  }

  if (recurringModel.state.enabled && !recurringPaused) {
    await ensureReminderAlarm(MODES.RECURRING, recurringIntervalMinutes);
  } else {
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
  }
  await scheduleDailyReset();

  if (source === SOURCE_TYPES.STARTUP) {
    log(`Scheduler reset from ${source}.`);
  }

  if (source === SOURCE_TYPES.WAKE) {
    const now = Date.now();

    if (hourlyModel.state.enabled) {
      await ensureHourlyTopOfHourAlarm();
      log(`HOURLY scheduler restored after wake.`);
    } else {
      log(`HOURLY scheduler remains off after wake.`);
    }

    if (recurringModel.state.enabled) {
      if (settingsState.recurringPaused === true) {
        await chrome.alarms.clear(ALARM_NAMES.RECURRING);
        log(`RECURRING scheduler paused after wake.`);
      } else {
        await ensureReminderAlarm(
          MODES.RECURRING,
          normalizeInterval(recurringModel.state),
        );
        log(`RECURRING scheduler restored after wake.`);
      }
    } else {
      log(`RECURRING scheduler remains off after wake.`);
    }
  }
}

// ========================================
// MESSAGE HANDLERS
// ========================================

async function handleOverlayActionMessage(message, sendResponse) {
  log(`[overlay] action received: ${message.type}`);
  await handleOverlayAction(message.action);
  sendResponse({ ok: true });
  return true;
}

async function handleRecurringPausedMessage(
  message,
  recurringModel,
  sendResponse,
) {
  const nextPaused = Boolean(message.recurringPaused);
  const recurringIntervalMinutes = normalizeInterval(recurringModel.state);

  await store.updateSettings({
    recurringPaused: nextPaused,
  });

  if (nextPaused) {
    await chrome.alarms.clear(ALARM_NAMES.SNOOZE);
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
    sendToTabs({ type: MESSAGE_TYPES.HIDE_OVERLAY });
  } else if (recurringModel.state.enabled) {
    const now = Date.now();
    recurringModel.updateTiming(now);
    await recurringModel.save();
    await ensureReminderAlarm(MODES.RECURRING, recurringIntervalMinutes);
  } else {
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
  }

  sendResponse({ recurringPaused: nextPaused });
  return true;
}

async function handleStartTimerMessage(
  message,
  hourlyModel,
  recurringModel,
  sendResponse,
) {
  const enabledModes = [];
  const now = Date.now();
  const recurringPaused = Boolean(message.recurringPaused);

  // Hourly mode keeps its own schedule, recurring mode gets refreshed from UI.
  if (message.hourlyEnabled) {
    const hourlyIntervalMinutes = Math.max(
      1,
      Number(
        message.hourlyIntervalMinutes ||
          hourlyModel.state.intervalMinutes ||
          DEFAULTS.HOURLY_INTERVAL_MINUTES,
      ),
    );
    const shouldRefreshHourly =
      hourlyModel.state.enabled !== true ||
      hourlyModel.state.nextDueAt == null ||
      hourlyModel.state.intervalMinutes !== hourlyIntervalMinutes;

    hourlyModel.update({
      enabled: true,
      intervalMinutes: hourlyIntervalMinutes,
      message: DEFAULTS.MESSAGE,
      lastTriggeredAt: shouldRefreshHourly
        ? null
        : hourlyModel.state.lastTriggeredAt,
      nextDueAt: shouldRefreshHourly
        ? await ensureHourlyTopOfHourAlarm()
        : hourlyModel.state.nextDueAt,
    });

    enabledModes.push("theo giờ");
  } else {
    hourlyModel.update({
      enabled: false,
      lastTriggeredAt: null,
      nextDueAt: null,
    });
    await chrome.alarms.clear(ALARM_NAMES.HOURLY);
  }

  // Recurring mode is updated from popup interval changes.
  if (message.recurringEnabled) {
    const recurringIntervalMinutes = Math.max(
      1,
      Number(
        message.recurringIntervalMinutes ||
          recurringModel.state.intervalMinutes ||
          DEFAULTS.RECURRING_INTERVAL_MINUTES,
      ),
    );
    recurringModel.update({
      enabled: true,
      intervalMinutes: recurringIntervalMinutes,
      message: DEFAULTS.MESSAGE,
      lastTriggeredAt: null,
      nextDueAt: now + recurringIntervalMinutes * 60 * 1000,
    });
    await store.updateSettings({ recurringPaused: false });
    await ensureReminderAlarm(MODES.RECURRING, recurringIntervalMinutes);
    enabledModes.push("lặp lại");
  } else {
    recurringModel.update({
      enabled: false,
      lastTriggeredAt: null,
      nextDueAt: null,
    });
    await store.updateSettings({ recurringPaused });
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
  }

  // Persist all changes together, then return next due timestamps for popup.
  await store.saveAll();
  await scheduleDailyReset();
  sendResponse({
    status:
      enabledModes.length > 0
        ? `Echoverse đã bật: ${enabledModes.join(" + ")}.`
        : "Echoverse đã tắt hết chuông báo.",
    hourlyNextDueAt: hourlyModel.state.nextDueAt,
    recurringNextDueAt: recurringModel.state.nextDueAt,
  });
  return true;
}

async function handleToggleSoundMessage(sendResponse) {
  try {
    log("Toggling sound...");
    const currentSoundEnabled = store.getSettingsState().soundEnabled !== false;

    const newSoundEnabled = !currentSoundEnabled;
    await store.updateSettings({ soundEnabled: newSoundEnabled });
    log(`Sound has been ${newSoundEnabled ? "enabled" : "disabled"}.`);

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
      triggerReminder(MODES.RECURRING, {
        updateTiming: false,
      });
      break;
    case ALARM_NAMES.DAILY_RESET:
      scheduleDailyReset();
      break;
  }
});

// ========================================
// MESSAGE LISTENERS
// ========================================

chrome.runtime.onMessage.addListener(async (message, _sender, sendResponse) => {
  const hourlyModel = store.getModel("hourly");
  const recurringModel = store.getModel("recurring");

  // Route popup and overlay messages to dedicated handlers.
  if (message?.type === MESSAGE_TYPES.OVERLAY_ACTION) {
    return handleOverlayActionMessage(message, sendResponse);
  }

  if (message?.type === MESSAGE_TYPES.SET_RECURRING_PAUSED) {
    return handleRecurringPausedMessage(message, recurringModel, sendResponse);
  }

  if (message?.type === MESSAGE_TYPES.START_TIMER) {
    return handleStartTimerMessage(
      message,
      hourlyModel,
      recurringModel,
      sendResponse,
    );
  }

  if (message?.type === MESSAGE_TYPES.TOGGLE_SOUND) {
    return handleToggleSoundMessage(sendResponse);
  }

  return false;
});

chrome.runtime.onStartup.addListener(async () => {
  if (startupHandling) {
    return;
  }
  startupHandling = true;
  try {
    log("Extension starting up...");
    await store.init();
    await rehydrateScheduler(SOURCE_TYPES.STARTUP);
    log("Extension startup completed.");
  } catch (error) {
    log(`Startup error: ${error.message}`);
  } finally {
    startupHandling = false;
  }
});

// Rebuild alarms on fresh install or update.
chrome.runtime.onInstalled.addListener(async (details) => {
  log(`Extension installed/updated: ${details.reason}`);
  await rehydrateScheduler(SOURCE_TYPES.STARTUP);
});

// Clear alarms on sleep; restore them on wake.
chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "idle" || state === "locked") {
    log(`Computer became ${state}, clearing alarms...`);
    try {
      await chrome.alarms.clear(ALARM_NAMES.HOURLY);
      await chrome.alarms.clear(ALARM_NAMES.RECURRING);
      await chrome.alarms.clear(ALARM_NAMES.SNOOZE);
      log("All reminder alarms cleared on sleep.");
    } catch (error) {
      log(`Error clearing alarms on sleep: ${error.message}`);
    }
    return;
  }

  if (state === "active") {
    log("Computer has become active, rehydrating scheduler...");
    try {
      await rehydrateScheduler(SOURCE_TYPES.WAKE);
    } catch (error) {
      log(`Error rehydrating scheduler on wake: ${error.message}`);
    }
  }
});
