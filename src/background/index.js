import {
  MESSAGE_TYPES,
  ALARM_NAMES,
  DEFAULTS,
  LIMITS,
  MODES,
  SOURCE_TYPES,
  ACTIONS,
} from "../constants.js";
import { log } from "../helpers.js";
import { getRandomPreloadedImage } from "./image.js";
import { playSound } from "./sound.js";
import { sendToTabs } from "./utils.js";
import { sendNotification } from "./notification.js";
import store from "./store.js";

// ========================================
// TRIGGER VALIDATION & LOGIC
// ========================================

function shouldIgnoreWakeTrigger(data, source) {
  if (source !== SOURCE_TYPES.WAKE) {
    return false;
  }

  const nextDueAt = Number(data.nextDueAt || 0);
  return nextDueAt > 0 && Date.now() - nextDueAt > LIMITS.MAX_TIMER_GAP_MS;
}

function shouldTriggerOnWake(data, mode) {
  if (mode === MODES.HOURLY) {
    return true;
  }

  return !isRecurringPaused(data);
}

function isRecurringPaused(settingsState) {
  return settingsState.recurringPaused === true;
}

// ========================================
// STORAGE & SETTINGS MANAGEMENT
// ========================================

function normalizeInterval(data) {
  const value = Number(
    data.recurringIntervalMinutes || DEFAULTS.RECURRING_INTERVAL_MINUTES,
  );
  if (Number.isFinite(value)) {
    return Math.max(5, Math.round(value / 5) * 5);
  }
  return DEFAULTS.RECURRING_INTERVAL_MINUTES;
}

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

async function scheduleDailyReset() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  await chrome.alarms.create(ALARM_NAMES.DAILY_RESET, {
    when: nextMidnight.getTime(),
  });
}

// ========================================
// CORE REMINDER LOGIC
// ========================================

async function triggerReminder(
  mode,
  source = SOURCE_TYPES.ALARM,
  options = {},
) {
  const { updateTiming = true } = options;
  const now = Date.now();

  // Use store pattern - get state directly
  const reminderState = store.getReminderState(mode);
  const settingsState = store.getSettingsState();

  if (mode === MODES.RECURRING && isRecurringPaused(settingsState)) {
    log(`Reminder skipped (${source}) because recurring is paused.`);
    return;
  }

  if (shouldIgnoreWakeTrigger({ ...reminderState, ...settingsState }, source)) {
    log(`Reminder ignored (${source}) after sleep gap.`);
    return;
  }

  if (source === SOURCE_TYPES.STARTUP) {
    log(`Reminder reset (${source}) without firing.`);
    return;
  }

  if (
    source === SOURCE_TYPES.WAKE &&
    !shouldTriggerOnWake({ ...reminderState, ...settingsState }, mode)
  ) {
    log(`Reminder reset (${source}) without firing.`);
    return;
  }

  if (!reminderState.enabled) {
    log(`Reminder skipped (${source}) because ${mode} is off.`);
    return;
  }

  // Check debounce using model method
  const reminderModel = store.getModel(mode);
  if (reminderModel.shouldDebounce(now)) {
    log(`Reminder skipped (${source}) by debounce.`);
    return;
  }

  // Update timing and stats using store methods
  if (updateTiming) {
    await store.updateReminderTiming(mode, now);
  } else {
    reminderModel.update({ lastTriggeredAt: now });
    await reminderModel.save();
  }
  await store.updateStats("SHOWN");

  // Send notification and sound
  sendNotification(reminderState.message);
  await playSound();

  if (mode === MODES.RECURRING) {
    // Get image URL and send with overlay
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
  log(`Reminder fired from ${source}.`);
}

// ========================================
// OVERLAY ACTIONS & USER INTERACTIONS
// ========================================

async function handleOverlayAction(action) {
  // Update statistics using store
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
  // Initialize store if not already done
  await store.init();

  // Get reminder models
  const hourlyModel = store.getModel("hourly");
  const recurringModel = store.getModel("recurring");
  const settingsState = store.getSettingsState();

  const hourlyIntervalMinutes = Math.max(1, hourlyModel.state.intervalMinutes);
  const recurringIntervalMinutes = normalizeInterval(recurringModel.state);
  const recurringPaused = isRecurringPaused(settingsState);

  await ensureReminderAlarm(MODES.HOURLY, hourlyIntervalMinutes);
  if (recurringPaused) {
    await chrome.alarms.clear(ALARM_NAMES.RECURRING);
  } else {
    await ensureReminderAlarm(MODES.RECURRING, recurringIntervalMinutes);
  }
  await scheduleDailyReset();

  const shouldResetFromNow = source === SOURCE_TYPES.STARTUP;

  if (shouldResetFromNow) {
    // Reset timing for both models
    const now = Date.now();
    hourlyModel.updateTiming(now);
    recurringModel.updateTiming(now);
    await store.saveAll();
    log(`Scheduler reset from ${source}.`);
  } else if (source === SOURCE_TYPES.WAKE) {
    const now = Date.now();

    // Check HOURLY alarm missed during sleep
    if (hourlyModel.state.nextDueAt && hourlyModel.state.nextDueAt <= now) {
      if (store.shouldTriggerReminder("hourly", now)) {
        log(`Missed HOURLY alarm detected, triggering immediately.`);
        await triggerReminder(MODES.HOURLY, SOURCE_TYPES.WAKE);
      }
    } else if (
      hourlyModel.state.nextDueAt &&
      hourlyModel.state.nextDueAt > now
    ) {
      log(`HOURLY alarm still pending, restoring from storage.`);
    } else {
      hourlyModel.updateTiming(now);
      await store.saveAll();
      log(`No HOURLY alarm found, setting new one from wake.`);
    }

    // Check RECURRING alarm missed during sleep
    if (
      recurringModel.state.nextDueAt &&
      recurringModel.state.nextDueAt <= now
    ) {
      if (store.shouldTriggerReminder("recurring", now)) {
        log(`Missed RECURRING alarm detected, triggering immediately.`);
        await triggerReminder(MODES.RECURRING, SOURCE_TYPES.WAKE);
      }
    } else if (
      recurringModel.state.nextDueAt &&
      recurringModel.state.nextDueAt > now
    ) {
      log(`RECURRING alarm still pending, restoring from storage.`);
    } else {
      recurringModel.updateTiming(now);
      await store.saveAll();
      log(`No RECURRING alarm found, setting new one from wake.`);
    }
  } else {
    // Restore from storage
    if (
      hourlyModel.state.nextDueAt &&
      hourlyModel.state.nextDueAt > Date.now()
    ) {
      log("HOURLY scheduler restored from storage.");
    }
    if (
      recurringModel.state.nextDueAt &&
      recurringModel.state.nextDueAt > Date.now()
    ) {
      log("RECURRING scheduler restored from storage.");
    }
  }
}

// ========================================
// ALARM LISTENERS
// ========================================

chrome.alarms.onAlarm.addListener((alarm) => {
  switch (alarm.name) {
    case ALARM_NAMES.HOURLY:
      triggerReminder(MODES.HOURLY, SOURCE_TYPES.ALARM);
      break;
    case ALARM_NAMES.RECURRING:
      triggerReminder(MODES.RECURRING, SOURCE_TYPES.ALARM);
      break;
    case ALARM_NAMES.SNOOZE:
      triggerReminder(MODES.RECURRING, SOURCE_TYPES.ALARM, {
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
  /**
   * Overlay action handler
   */
  if (message?.type === MESSAGE_TYPES.OVERLAY_ACTION) {
    log(`[overlay] action received: ${message.type}`);
    await handleOverlayAction(message.action);
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.SET_RECURRING_PAUSED) {
    const nextPaused = Boolean(message.recurringPaused);
    const recurringModel = store.getModel("recurring");
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

  /**
   * Start timer handler
   */
  if (message.type === MESSAGE_TYPES.START_TIMER) {
    const updates = {};
    const enabledModes = [];

    if (message.hourlyEnabled) {
      const hourlyIntervalMinutes = Math.max(
        1,
        Number(
          message.hourlyIntervalMinutes || DEFAULTS.HOURLY_INTERVAL_MINUTES,
        ),
      );
      updates.hourlyEnabled = true;
      updates.hourlyIntervalMinutes = hourlyIntervalMinutes;
      updates.hourlyMessage = DEFAULTS.MESSAGE;
      await ensureReminderAlarm(MODES.HOURLY, hourlyIntervalMinutes);
      enabledModes.push("theo giờ");
    } else {
      updates.hourlyEnabled = false;
      await chrome.alarms.clear(ALARM_NAMES.HOURLY);
    }

    if (message.recurringEnabled) {
      const recurringIntervalMinutes = Math.max(
        1,
        Number(
          message.recurringIntervalMinutes ||
            DEFAULTS.RECURRING_INTERVAL_MINUTES,
        ),
      );
      updates.recurringEnabled = true;
      updates.recurringIntervalMinutes = recurringIntervalMinutes;
      updates.recurringMessage = DEFAULTS.MESSAGE;
      if (!isRecurringPaused(store.getSettingsState())) {
        await ensureReminderAlarm(MODES.RECURRING, recurringIntervalMinutes);
      } else {
        await chrome.alarms.clear(ALARM_NAMES.RECURRING);
      }
      enabledModes.push("lặp lại");
    } else {
      updates.recurringEnabled = false;
      await chrome.alarms.clear(ALARM_NAMES.RECURRING);
    }

    updates.lastTriggeredAt = null;
    await chrome.storage.sync.set(updates);
    await scheduleDailyReset();
    sendResponse({
      status: `Echoverse đã bật: ${enabledModes.join(" + ")}.`,
    });
    return true;
  }

  /**
   * Toggle sound handler
   */
  if (message?.type === MESSAGE_TYPES.TOGGLE_SOUND) {
    try {
      log("Toggling sound...");
      const data = await chrome.storage.sync.get("soundEnabled");
      const currentSoundEnabled = data.soundEnabled !== false;

      const newSoundEnabled = !currentSoundEnabled;
      await chrome.storage.sync.set({ soundEnabled: newSoundEnabled });
      log(`Sound has been ${newSoundEnabled ? "enabled" : "disabled"}.`);

      sendResponse({ soundEnabled: newSoundEnabled });
    } catch (error) {
      log(`Error toggling sound: ${error.message}`);
      sendResponse({ error: error.message });
    }
    return true;
  }

  return false;
});

// ========================================
// STARTUP & IDLE LISTENERS
// ========================================

let startupHandling = false;

// on chrome startup
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

// on extension installed/updated
chrome.runtime.onInstalled.addListener(async (details) => {
  log(`Extension installed/updated: ${details.reason}`);
  await rehydrateScheduler(SOURCE_TYPES.STARTUP);
});

// on computer sleep/wake
chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "active") {
    log("Computer has become active, rehydrating scheduler...");
    try {
      await rehydrateScheduler(SOURCE_TYPES.WAKE);
    } catch (error) {
      log(`Error rehydrating scheduler on wake: ${error.message}`);
    }
  }
});
