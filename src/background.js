import {
  ACTIONS,
  ALARM_NAMES,
  ASSETS,
  DEFAULTS,
  LIMITS,
  MESSAGE_TYPES,
  MODES,
  STORAGE_KEYS,
  TARGETS,
  UI,
} from "./constants.js";

function log(message) {
  const timestamp = new Date().toLocaleString();
  console.log(`[${timestamp}] ${message}`);
}

const {
  HOURLY: HOURLY_ALARM_NAME,
  RECURRING: RECURRING_ALARM_NAME,
  SNOOZE: SNOOZE_ALARM_NAME,
  DAILY_RESET: DAILY_RESET_ALARM_NAME,
} = ALARM_NAMES;
const {
  HOURLY_INTERVAL_MINUTES: DEFAULT_HOURLY_INTERVAL,
  RECURRING_INTERVAL_MINUTES: DEFAULT_RECURRING_INTERVAL,
  MESSAGE: DEFAULT_MESSAGE,
  MESSAGE_POOL: DEFAULT_MESSAGE_POOL,
} = DEFAULTS;
const { TIMER_DEBOUNCE_MS, MAX_TIMER_GAP_MS } = LIMITS;
const STORAGE = STORAGE_KEYS;
const DEBUG_ENABLED = false;

let offscreenCreating;
let startupHandling = false;

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
  const data = await chrome.storage.sync.get(STORAGE.SOUND_ENABLED);
  const soundEnabled = data.soundEnabled !== false;
  if (soundEnabled) {
    await setupOffscreenDocument(ASSETS.OFFSCREEN_HTML);
    chrome.runtime.sendMessage({
      target: TARGETS.OFFSCREEN,
      type: MESSAGE_TYPES.PLAY_SOUND,
    });
    log("Sound playback requested via offscreen document.");
  } else {
    log("Sound is disabled. Notification sent without sound.");
  }
}

function sendNotification(title, message) {
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: ASSETS.ICON_128,
      title,
      message,
      priority: 2,
    },
    (notificationId) => {
      if (chrome.runtime.lastError) {
        log(`Notification error: ${chrome.runtime.lastError}`);
      } else {
        log(`Notification created with ID: ${notificationId}`);
      }
    },
  );
}

function clearAlarm(name) {
  return chrome.alarms.clear(name);
}

function debugLog(message) {
  if (DEBUG_ENABLED) {
    log(message);
  }
}

function getAlarmNameForMode(mode) {
  return mode === MODES.HOURLY ? HOURLY_ALARM_NAME : RECURRING_ALARM_NAME;
}

function getAlarmConfigForMode(mode, intervalMinutes) {
  return {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  };
}

function getNextHourlyDueAt() {
  return Date.now() + DEFAULT_HOURLY_INTERVAL * 60 * 1000;
}

function shouldIgnoreWakeTrigger(data, source) {
  if (source !== "wake") {
    return false;
  }

  const nextDueAt = Number(data.nextDueAt || 0);
  return nextDueAt > 0 && Date.now() - nextDueAt > MAX_TIMER_GAP_MS;
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

function getReminderAlarmName(mode) {
  return getAlarmNameForMode(mode);
}

function getReminderIntervalMinutes(data, mode) {
  if (mode === MODES.HOURLY) {
    return Math.max(
      1,
      Number(data.hourlyIntervalMinutes || DEFAULT_HOURLY_INTERVAL),
    );
  }

  const value = Number(
    data.customIntervalMinutes ||
      data.intervalMinutes ||
      DEFAULT_RECURRING_INTERVAL,
  );
  return Math.max(
    1,
    Number.isFinite(value) ? value : DEFAULT_RECURRING_INTERVAL,
  );
}

function getReminderMessage(data, mode) {
  if (mode === MODES.HOURLY) {
    return data.hourlyMessage || data.message || DEFAULT_MESSAGE;
  }

  return data.recurringMessage || data.message || DEFAULT_MESSAGE;
}

function getReminderEnabled(data, mode) {
  return mode === MODES.HOURLY
    ? data.hourlyEnabled !== false
    : data.recurringEnabled !== false;
}

async function readSettings() {
  return await chrome.storage.sync.get([
    STORAGE_KEYS.MODE,
    STORAGE_KEYS.INTERVAL_MINUTES,
    STORAGE_KEYS.CUSTOM_INTERVAL_MINUTES,
    STORAGE_KEYS.MESSAGE,
    STORAGE_KEYS.MESSAGE_POOL,
    STORAGE_KEYS.SOUND_ENABLED,
    STORAGE_KEYS.LAST_TRIGGERED_AT,
    STORAGE_KEYS.NEXT_DUE_AT,
    STORAGE_KEYS.DISABLE_TODAY_UNTIL,
    STORAGE_KEYS.MIGRATION_DONE,
    STORAGE_KEYS.HOURLY_MESSAGE,
    STORAGE_KEYS.RECURRING_MESSAGE,
    STORAGE_KEYS.INTERVAL,
    STORAGE_KEYS.DAILY_STATS,
    STORAGE_KEYS.STREAK,
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
  const streak = data.streak || { current: 0, best: 0, lastActiveDate: null };
  const result = patchFn({ dailyStats, today, streak, todayKey });

  await chrome.storage.sync.set({
    dailyStats: result.dailyStats,
    streak: result.streak,
  });
}

function updateStreak(streak, todayKey) {
  if (streak.lastActiveDate === todayKey) {
    return streak;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getTodayKey(yesterday);
  const current =
    streak.lastActiveDate === yesterdayKey ? (streak.current || 0) + 1 : 1;
  return {
    current,
    best: Math.max(streak.best || 0, current),
    lastActiveDate: todayKey,
  };
}

function normalizeInterval(data) {
  const value = Number(
    data.customIntervalMinutes ||
      data.intervalMinutes ||
      data.interval ||
      DEFAULT_RECURRING_INTERVAL,
  );
  if (Number.isFinite(value)) {
    return Math.max(5, Math.round(value / 5) * 5);
  }
  return DEFAULT_RECURRING_INTERVAL;
}

async function migrateSettings(data) {
  if (data.migrationDone) {
    return data;
  }

  const intervalMinutes = Number(
    data.intervalMinutes || DEFAULT_RECURRING_INTERVAL,
  );
  const hourlyEnabled = data.hourlyEnabled !== false;
  const recurringEnabled = data.recurringEnabled !== false;
  await chrome.storage.sync.set({
    hourlyEnabled,
    recurringEnabled,
    hourlyIntervalMinutes: Number(
      data.hourlyIntervalMinutes || DEFAULT_HOURLY_INTERVAL,
    ),
    recurringIntervalMinutes: intervalMinutes,
    hourlyMessage: data.hourlyMessage || data.message || DEFAULT_MESSAGE,
    recurringMessage: data.recurringMessage || data.message || DEFAULT_MESSAGE,
    messagePool: data.messagePool || DEFAULT_MESSAGE_POOL,
    soundEnabled: data.soundEnabled !== false,
    volume: data.volume ?? 1,
    lastTriggeredAt: data.lastTriggeredAt || null,
    nextDueAt: data.nextDueAt || null,
    disableTodayUntil: data.disableTodayUntil || null,
    migrationDone: true,
  });

  await chrome.storage.sync.remove([
    STORAGE_KEYS.SOUND_PRESET,
    STORAGE_KEYS.CUSTOM_AUDIO_URL,
    STORAGE_KEYS.DEBUG_OVERLAY_ALWAYS_ON,
    STORAGE_KEYS.MODE,
    STORAGE_KEYS.INTERVAL,
    STORAGE_KEYS.CUSTOM_INTERVAL_MINUTES,
    STORAGE_KEYS.MESSAGE,
  ]);

  return { ...data, hourlyEnabled, recurringEnabled };
}

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
  await chrome.alarms.create(DAILY_RESET_ALARM_NAME, {
    when: nextMidnight.getTime(),
  });
}

async function triggerReminder(mode, source = ALARM_SOURCES.ALARM) {
  const data = await readSettings();
  const now = Date.now();
  const todayKey = getTodayKey();
  const enabledKey =
    mode === MODES.HOURLY
      ? STORAGE_KEYS.HOURLY_ENABLED
      : STORAGE_KEYS.RECURRING_ENABLED;

  if (shouldIgnoreWakeTrigger(data, source)) {
    debugLog(`Reminder ignored (${source}) after sleep gap.`);
    return;
  }

  if (data.disableTodayUntil === todayKey && mode === MODES.RECURRING) {
    log(`Reminder skipped (${source}) because disabled today.`);
    return;
  }

  if (source === ALARM_SOURCES.STARTUP) {
    log(`Reminder reset (${source}) without firing.`);
    return;
  }

  if (source === ALARM_SOURCES.WAKE && !shouldTriggerOnWake(data, mode)) {
    log(`Reminder reset (${source}) without firing.`);
    return;
  }

  if (!getReminderEnabled(data, mode)) {
    log(`Reminder skipped (${source}) because ${enabledKey} is off.`);
    return;
  }

  if (data.lastTriggeredAt && now - data.lastTriggeredAt < TIMER_DEBOUNCE_MS) {
    log(`Reminder skipped (${source}) by debounce.`);
    return;
  }

  const intervalMinutes = getReminderIntervalMinutes(data, mode);
  const message = getReminderMessage(data, mode);

  await chrome.storage.sync.set({
    lastTriggeredAt: now,
    nextDueAt: getNextDueAt(intervalMinutes),
  });

  await patchStats(({ dailyStats, today, streak, todayKey }) => {
    dailyStats[todayKey] = {
      ...today,
      shown: today.shown + 1,
    };
    return {
      dailyStats,
      streak: updateStreak(streak, todayKey),
    };
  });

  sendNotification("Echoverse", message);
  await playSound();

  if (mode === MODES.RECURRING) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, {
            type: MESSAGE_TYPES.SHOW_OVERLAY,
            payload: {
              id: String(now),
              title: UI.REMINDER_TITLE,
              message,
            },
          });
        }
      });
    });
  }

  if (mode === MODES.HOURLY) {
    log("Hourly reminder fired without overlay.");
  }
  log(`Reminder fired from ${source}.`);
}

async function handleOverlayAction(action) {
  await patchStats(({ dailyStats, today, streak, todayKey }) => {
    const nextToday = { ...today };
    if (action === ACTIONS.SKIP) {
      nextToday.skipped += 1;
    }
    if (action === ACTIONS.SNOOZE) {
      nextToday.snoozed += 1;
    }
    if (action === ACTIONS.DISABLE_TODAY) {
      nextToday.disabledToday = true;
    }
    dailyStats[todayKey] = nextToday;
    return { dailyStats, streak };
  });

  if (action === ACTIONS.SNOOZE) {
    await chrome.alarms.clear(SNOOZE_ALARM_NAME);
    await chrome.alarms.create(SNOOZE_ALARM_NAME, {
      delayInMinutes: DEFAULTS.SNOOZE_DELAY_MINUTES,
    });
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.HIDE_OVERLAY });
        }
      });
    });
    return;
  }

  if (action === ACTIONS.DISABLE_TODAY) {
    const todayKey = getTodayKey();
    await chrome.storage.sync.set({ disableTodayUntil: todayKey });
    await chrome.alarms.clear(SNOOZE_ALARM_NAME);
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.HIDE_OVERLAY });
        }
      });
    });
    return;
  }

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.HIDE_OVERLAY });
      }
    });
  });
}

async function rehydrateScheduler(source = SOURCE_TYPES.STARTUP) {
  const data = await migrateSettings(await readSettings());
  const hourlyIntervalMinutes = Math.max(
    1,
    Number(data.hourlyIntervalMinutes || DEFAULT_HOURLY_INTERVAL),
  );
  const recurringIntervalMinutes = normalizeInterval(data);

  await clearAlarm(SNOOZE_ALARM_NAME);
  await ensureReminderAlarm("hourly", hourlyIntervalMinutes);
  await ensureReminderAlarm("recurring", recurringIntervalMinutes);
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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HOURLY_ALARM_NAME) {
    triggerReminder(MODE_TYPES.HOURLY, ALARM_TYPES.ALARM);
  } else if (alarm.name === RECURRING_ALARM_NAME) {
    triggerReminder(MODE_TYPES.RECURRING, ALARM_TYPES.ALARM);
  } else if (alarm.name === SNOOZE_ALARM_NAME) {
    triggerReminder(MODE_TYPES.RECURRING, ALARM_TYPES.SNOOZE);
  } else if (alarm.name === DAILY_RESET_ALARM_NAME) {
    chrome.storage.sync.set({ disableTodayUntil: null });
    scheduleDailyReset();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.OVERLAY_ACTION) {
    (async () => {
      await handleOverlayAction(message.action);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.action === ACTIONS.START_TIMER) {
    (async () => {
      const updates = {};
      const enabledModes = [];

      if (message.hourlyEnabled) {
        const hourlyIntervalMinutes = Math.max(
          1,
          Number(message.hourlyIntervalMinutes || DEFAULT_HOURLY_INTERVAL),
        );
        updates.hourlyEnabled = true;
        updates.hourlyIntervalMinutes = hourlyIntervalMinutes;
        updates.hourlyMessage = message.hourlyMessage || DEFAULT_MESSAGE;
        await ensureReminderAlarm(MODE_TYPES.HOURLY, hourlyIntervalMinutes);
        enabledModes.push(UI.HOURLY_MODE_LABEL);
      } else {
        updates.hourlyEnabled = false;
        await chrome.alarms.clear(HOURLY_ALARM_NAME);
      }

      if (message.recurringEnabled) {
        const recurringIntervalMinutes = Math.max(
          1,
          Number(
            message.recurringIntervalMinutes || DEFAULT_RECURRING_INTERVAL,
          ),
        );
        updates.recurringEnabled = true;
        updates.recurringIntervalMinutes = recurringIntervalMinutes;
        updates.recurringMessage = message.recurringMessage || DEFAULT_MESSAGE;
        await ensureReminderAlarm(MODES.RECURRING, recurringIntervalMinutes);
        enabledModes.push(UI.RECURRING_MODE_LABEL);
      } else {
        updates.recurringEnabled = false;
        await chrome.alarms.clear(RECURRING_ALARM_NAME);
      }

      updates.lastTriggeredAt = null;
      await chrome.storage.sync.set(updates);
      await scheduleDailyReset();
      sendResponse({
        status: `${UI.RECURRING_ENABLED_STATUS_PREFIX}${enabledModes.join(" + ")}${UI.RECURRING_ENABLED_STATUS_SUFFIX}`,
      });
    })();
    return true;
  }

  if (message.action === ACTIONS.TOGGLE_SOUND) {
    chrome.storage.sync.get("soundEnabled", (data) => {
      const soundEnabled = data.soundEnabled !== false;
      chrome.storage.sync.set({ soundEnabled: !soundEnabled }, () => {
        log(`Sound has been ${!soundEnabled ? "enabled" : "disabled"}.`);
        sendResponse({ soundEnabled: !soundEnabled });
      });
    });
    return true;
  }

  return false;
});

chrome.runtime.onStartup.addListener(async () => {
  if (startupHandling) {
    return;
  }
  startupHandling = true;
  await rehydrateScheduler(SOURCE_TYPES.STARTUP);
  startupHandling = false;
});

chrome.runtime.onInstalled.addListener(async () => {
  await rehydrateScheduler(SOURCE_TYPES.STARTUP);
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "active") {
    log("Computer has become active.");
    await rehydrateScheduler(SOURCE_TYPES.WAKE);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.GET_STATS) {
    (async () => {
      const data = await readSettings();
      sendResponse({
        ok: true,
        data: {
          dailyStats: data.dailyStats || {},
          streak: data.streak || { current: 0, best: 0, lastActiveDate: null },
        },
      });
    })();
    return true;
  }

  if (message?.type === MESSAGE_TYPES.GET_SETTINGS) {
    (async () => {
      const data = await readSettings();
      sendResponse({ ok: true, data });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.PLAY_SOUND) {
    (async () => {
      await setupOffscreenDocument("src/offscreen/offscreen.html");
      chrome.runtime.sendMessage(message);
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.SET_SETTINGS) {
    (async () => {
      await chrome.storage.sync.set(message.data || {});
      await rehydrateScheduler(SOURCE_TYPES.STARTUP);
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.TRIGGER_NOW) {
    (async () => {
      await triggerReminder("manual");
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.HIDE_ALL_OVERLAY) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.HIDE_OVERLAY });
        }
      });
    });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.NOOP) {
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.GET_DAILY_STATS) {
    (async () => {
      const data = await readSettings();
      sendResponse({ ok: true, data: data.dailyStats || {} });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.PING_BACKGROUND) {
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
