import {
  MESSAGE_TYPES,
  ALARM_NAMES,
  DEFAULTS,
  LIMITS,
  MODES,
  SOURCE_TYPES,
  STORAGE_KEYS,
} from "../constants.js";
import { getRandomPreloadedImage, log } from "../helpers.js";

// Global state variables
let offscreenCreating;
let startupHandling = false;

// ========================================
// OFFSCREEN DOCUMENT & SOUND MANAGEMENT
// ========================================

async function setupOffscreenDocument(path) {
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (offscreenCreating) {
    await offscreenCreating;
  } else {
    offscreenCreating = chrome.offscreen.createDocument({
      url: path,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Playing notification sounds",
    });
    await offscreenCreating;
    offscreenCreating = null;
  }
}

async function playSound() {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEYS.SOUND_ENABLED);
    const soundEnabled = data.soundEnabled !== false;
    log(`Sound enabled state: ${soundEnabled}`);

    if (soundEnabled) {
      await setupOffscreenDocument("src/offscreen/offscreen.html");

      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: MESSAGE_TYPES.PLAY_SOUND_OFFSCREEN,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              log(`Sound message error: ${chrome.runtime.lastError.message}`);
            } else {
              log("Sound playback requested via offscreen document.");
            }
            resolve();
          },
        );
      });
    } else {
      log("Sound is disabled. Notification sent without sound.");
    }
  } catch (error) {
    log(`Sound playback error: ${error.message}`);
  }
}

// ========================================
// NOTIFICATION & COMMUNICATION
// ========================================

function sendNotification(title, message) {
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title,
      message,
      priority: 2,
      requireInteraction: false,
    },
    (notificationId) => {
      if (chrome.runtime.lastError) {
        // Only log if it's not the image download error which is common
        if (
          !chrome.runtime.lastError.message.includes(
            "Unable to download all specified images",
          )
        ) {
          log(
            `Notification error: ${JSON.stringify(chrome.runtime.lastError)}`,
          );
        }
      } else {
        log(`Notification created with ID: ${notificationId}`);
      }
    },
  );
}

function clearAlarm(name) {
  return chrome.alarms.clear(name);
}

function sendToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    const activeTabs = tabs.filter(
      (tab) =>
        tab.id &&
        tab.url &&
        (tab.url.startsWith("http") || tab.url.startsWith("file")),
    );

    if (activeTabs.length === 0) {
      log("No active tabs found to send message to");
      return;
    }

    activeTabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          // Only log if it's not the "receiving end does not exist" error which is expected
          if (
            !chrome.runtime.lastError.message.includes(
              "Receiving end does not exist",
            ) &&
            !chrome.runtime.lastError.message.includes(
              "The message port closed before a response was received",
            )
          ) {
            log(`Tab message error: ${chrome.runtime.lastError.message}`);
          }
        } else {
          log(`Message sent to tab ${tab.id}`);
        }
      });
    });
  });
}

// ========================================
// ALARM CONFIGURATION & MANAGEMENT
// ========================================

function getAlarmNameForMode(mode) {
  return mode === MODES.HOURLY ? ALARM_NAMES.HOURLY : ALARM_NAMES.RECURRING;
}

function getAlarmConfigForMode(mode, intervalMinutes) {
  return {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  };
}

function getNextHourlyDueAt() {
  return Date.now() + DEFAULTS.HOURLY_INTERVAL_MINUTES * 60 * 1000;
}

// ========================================
// TRIGGER VALIDATION & LOGIC
// ========================================

function shouldIgnoreWakeTrigger(data, source) {
  if (source !== "wake") {
    return false;
  }

  const nextDueAt = Number(data.nextDueAt || 0);
  return nextDueAt > 0 && Date.now() - nextDueAt > LIMITS.MAX_TIMER_GAP_MS;
}

function shouldTriggerOnWake(data, mode) {
  if (mode === MODES.HOURLY) {
    return true;
  }

  return data.disableTodayUntil !== getTodayKey();
}

function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getNextDueAt(intervalMinutes) {
  return Date.now() + intervalMinutes * 60 * 1000;
}

// ========================================
// REMINDER CONFIGURATION HELPERS
// ========================================

function getReminderAlarmName(mode) {
  return getAlarmNameForMode(mode);
}

function getReminderIntervalMinutes(data, mode) {
  if (mode === MODES.HOURLY) {
    return Math.max(
      1,
      Number(data.hourlyIntervalMinutes || DEFAULTS.HOURLY_INTERVAL_MINUTES),
    );
  }

  const value = Number(
    data.recurringIntervalMinutes || DEFAULTS.RECURRING_INTERVAL_MINUTES,
  );
  return Math.max(
    1,
    Number.isFinite(value) ? value : DEFAULTS.RECURRING_INTERVAL_MINUTES,
  );
}

function getReminderMessage(data, mode) {
  if (mode === MODES.HOURLY) {
    return data.hourlyMessage || data.message || DEFAULTS.MESSAGE;
  }

  return data.recurringMessage || data.message || DEFAULTS.MESSAGE;
}

function getReminderEnabled(data, mode) {
  return mode === MODES.HOURLY
    ? data.hourlyEnabled !== false
    : data.recurringEnabled !== false;
}

// ========================================
// STORAGE & SETTINGS MANAGEMENT
// ========================================

async function readSettings() {
  return await chrome.storage.sync.get([
    STORAGE_KEYS.MODE,
    STORAGE_KEYS.RECURRING_INTERVAL_MINUTES,
    STORAGE_KEYS.MESSAGE,
    STORAGE_KEYS.MESSAGE_POOL,
    STORAGE_KEYS.SOUND_ENABLED,
    STORAGE_KEYS.LAST_TRIGGERED_AT,
    STORAGE_KEYS.NEXT_DUE_AT,
    STORAGE_KEYS.DISABLE_TODAY_UNTIL,
    STORAGE_KEYS.MIGRATION_DONE,
    STORAGE_KEYS.HOURLY_MESSAGE,
    STORAGE_KEYS.RECURRING_MESSAGE,
    STORAGE_KEYS.DAILY_STATS,
  ]);
}

async function patchStats(patchFn) {
  const data = await readSettings();
  const todayKey = getTodayKey();
  const dailyStats = data.dailyStats || {};
  const today = dailyStats[todayKey] || {
    shown: 0,
    skipped: 0,
    snoozed: 0,
    disabledToday: false,
  };
  const result = patchFn({ dailyStats, today, todayKey });

  await chrome.storage.sync.set({
    dailyStats: result.dailyStats,
  });
}

function normalizeInterval(data) {
  const value = Number(
    data.recurringIntervalMinutes || DEFAULTS.RECURRING_INTERVAL_MINUTES,
  );
  if (Number.isFinite(value)) {
    return Math.max(5, Math.round(value / 5) * 5);
  }
  return DEFAULTS.RECURRING_INTERVAL_MINUTES;
}

async function migrateSettings(data) {
  if (data.migrationDone) {
    return data;
  }

  const intervalMinutes = Number(
    data.recurringIntervalMinutes || DEFAULTS.RECURRING_INTERVAL_MINUTES,
  );
  const hourlyEnabled = data.hourlyEnabled !== false;
  const recurringEnabled = data.recurringEnabled !== false;
  await chrome.storage.sync.set({
    hourlyEnabled,
    recurringEnabled,
    hourlyIntervalMinutes: Number(
      data.hourlyIntervalMinutes || DEFAULTS.HOURLY_INTERVAL_MINUTES,
    ),
    recurringIntervalMinutes: intervalMinutes,
    hourlyMessage: data.hourlyMessage || data.message || DEFAULTS.MESSAGE,
    recurringMessage: data.recurringMessage || data.message || DEFAULTS.MESSAGE,
    messagePool: data.messagePool || DEFAULTS.MESSAGE_POOL,
    soundEnabled: data.soundEnabled !== false,
    volume: data.volume ?? 1,
    lastTriggeredAt: data.lastTriggeredAt || null,
    nextDueAt: data.nextDueAt || null,
    disableTodayUntil: data.disableTodayUntil || null,
    migrationDone: true,
  });

  await chrome.storage.sync.remove([
    STORAGE_KEYS.MODE,
    STORAGE_KEYS.RECURRING_INTERVAL_MINUTES,
    STORAGE_KEYS.MESSAGE,
    STORAGE_KEYS.DAILY_STATS,
  ]);

  return { ...data, hourlyEnabled, recurringEnabled };
}

// ========================================
// ALARM SCHEDULING
// ========================================

async function ensureReminderAlarm(mode, intervalMinutes) {
  const alarmName = getReminderAlarmName(mode);
  await chrome.alarms.clear(alarmName);
  await chrome.alarms.create(
    alarmName,
    getAlarmConfigForMode(mode, intervalMinutes),
  );
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

async function triggerReminder(mode, source = SOURCE_TYPES.ALARM) {
  const data = await readSettings();
  const now = Date.now();
  const todayKey = getTodayKey();
  const enabledKey =
    mode === MODES.HOURLY
      ? STORAGE_KEYS.HOURLY_ENABLED
      : STORAGE_KEYS.RECURRING_ENABLED;

  if (shouldIgnoreWakeTrigger(data, source)) {
    log(`Reminder ignored (${source}) after sleep gap.`);
    return;
  }

  if (data.disableTodayUntil === todayKey && mode === MODES.RECURRING) {
    log(`Reminder skipped (${source}) because disabled today.`);
    return;
  }

  if (source === SOURCE_TYPES.STARTUP) {
    log(`Reminder reset (${source}) without firing.`);
    return;
  }

  if (source === SOURCE_TYPES.WAKE && !shouldTriggerOnWake(data, mode)) {
    log(`Reminder reset (${source}) without firing.`);
    return;
  }

  if (!getReminderEnabled(data, mode)) {
    log(`Reminder skipped (${source}) because ${enabledKey} is off.`);
    return;
  }

  if (
    data.lastTriggeredAt &&
    now - data.lastTriggeredAt < LIMITS.TIMER_DEBOUNCE_MS
  ) {
    log(`Reminder skipped (${source}) by debounce.`);
    return;
  }

  const intervalMinutes = getReminderIntervalMinutes(data, mode);
  const message = getReminderMessage(data, mode);

  await chrome.storage.sync.set({
    lastTriggeredAt: now,
    nextDueAt: getNextDueAt(intervalMinutes),
  });

  await patchStats(({ dailyStats, today, todayKey }) => {
    dailyStats[todayKey] = {
      ...today,
      shown: today.shown + 1,
    };
    return { dailyStats };
  });

  sendNotification("Echoverse", message);
  await playSound();

  if (mode === MODES.RECURRING) {
    // Get image URL and send with overlay
    const imageUrl = await getRandomPreloadedImage();
    const messageType = MESSAGE_TYPES?.SHOW_OVERLAY || "SHOW_OVERLAY";
    sendToTabs({
      type: messageType,
      payload: {
        id: String(now),
        title: "Time to rest",
        message,
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

async function handleOverlayAction(type) {
  await patchStats(({ dailyStats, today, todayKey }) => {
    const nextToday = { ...today };
    if (type === MESSAGE_TYPES.SKIP) {
      nextToday.skipped += 1;
    }
    if (type === MESSAGE_TYPES.SNOOZE) {
      nextToday.snoozed += 1;
    }
    if (type === MESSAGE_TYPES.DISABLE_TODAY) {
      nextToday.disabledToday = true;
    }
    dailyStats[todayKey] = nextToday;
    return { dailyStats };
  });

  if (type === MESSAGE_TYPES.SNOOZE) {
    const data = await readSettings();
    chrome.alarms.create(ALARM_NAMES.SNOOZE, {
      delayInMinutes: DEFAULTS.SNOOZE_DELAY_MINUTES,
    });
    log(`Snoozed for ${DEFAULTS.SNOOZE_DELAY_MINUTES} minutes.`);
    return;
  }

  if (type === MESSAGE_TYPES.DISABLE_TODAY) {
    const todayKey = getTodayKey();
    await chrome.storage.sync.set({ disableTodayUntil: todayKey });
    await chrome.alarms.clear(ALARM_NAMES.SNOOZE);
    return;
  }

  const hideMessageType = MESSAGE_TYPES?.HIDE_OVERLAY || "HIDE_OVERLAY";
  sendToTabs({ type: hideMessageType });
}

// ========================================
// SYSTEM INITIALIZATION & REHYDRATION
// ========================================

async function rehydrateScheduler(source = SOURCE_TYPES.STARTUP) {
  const data = await migrateSettings(await readSettings());
  const hourlyIntervalMinutes = Math.max(
    1,
    Number(data.hourlyIntervalMinutes || DEFAULTS.HOURLY_INTERVAL_MINUTES),
  );
  const recurringIntervalMinutes = normalizeInterval(data);

  await clearAlarm(ALARM_NAMES.SNOOZE);
  await ensureReminderAlarm(MODES.HOURLY, hourlyIntervalMinutes);
  await ensureReminderAlarm(MODES.RECURRING, recurringIntervalMinutes);
  await scheduleDailyReset();

  const nextDueAt = data.nextDueAt || 0;
  const shouldResetFromNow =
    source === SOURCE_TYPES.STARTUP || source === SOURCE_TYPES.WAKE;
  if (shouldResetFromNow) {
    await chrome.storage.sync.set({ nextDueAt: getNextHourlyDueAt() });
    log(`Scheduler reset from ${source}.`);
  } else if (nextDueAt && nextDueAt > Date.now()) {
    log("Scheduler restored from storage.");
  }
}

// ========================================
// EVENT LISTENERS
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
      triggerReminder(MODES.RECURRING, SOURCE_TYPES.WAKE);
      break;
    case ALARM_NAMES.DAILY_RESET:
      chrome.storage.sync.set({ disableTodayUntil: null });
      scheduleDailyReset();
      break;
  }
});

chrome.runtime.onMessage.addListener(async (message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.OVERLAY_ACTION) {
    log(`[overlay] action received: ${message.type}`);
    (async () => {
      await handleOverlayAction(message.type);
      sendResponse({ ok: true });
    })();
    return true;
  }

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
      updates.hourlyMessage = message.hourlyMessage || DEFAULTS.MESSAGE;
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
      updates.recurringMessage = message.recurringMessage || DEFAULTS.MESSAGE;
      await ensureReminderAlarm(MODES.RECURRING, recurringIntervalMinutes);
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

  if (message?.type === MESSAGE_TYPES.TOGGLE_SOUND) {
    try {
      log("Toggling sound...");
      const data = await chrome.storage.sync.get("soundEnabled");
      const currentSoundEnabled = data.soundEnabled !== false;
      const newSoundEnabled = !currentSoundEnabled;

      await chrome.storage.sync.set({ soundEnabled: newSoundEnabled });
      log(`Sound has been ${newSoundEnabled ? "enabled" : "disabled"}.`);

      // Verify the setting was saved correctly
      const verifyData = await chrome.storage.sync.get("soundEnabled");
      log(`Sound state verification: ${verifyData.soundEnabled}`);

      sendResponse({ soundEnabled: newSoundEnabled });
    } catch (error) {
      log(`Error toggling sound: ${error.message}`);
      sendResponse({ error: error.message });
    }
    return true;
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
    await rehydrateScheduler(SOURCE_TYPES.STARTUP);
    log("Extension startup completed.");
  } catch (error) {
    log(`Startup error: ${error.message}`);
  } finally {
    startupHandling = false;
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  log(`Extension installed/updated: ${details.reason}`);
  await rehydrateScheduler(SOURCE_TYPES.STARTUP);
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "active") {
    log("Computer has become active.");
    try {
      await rehydrateScheduler(SOURCE_TYPES.WAKE);
    } catch (error) {
      log(`Error rehydrating scheduler on wake: ${error.message}`);
    }
  }
});
