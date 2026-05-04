function log(message) {
  const timestamp = new Date().toLocaleString();
  console.log(`[${timestamp}] ${message}`);
}

const HOURLY_ALARM_NAME = "echoverse-hourly-reminder";
const RECURRING_ALARM_NAME = "echoverse-recurring-reminder";
const SNOOZE_ALARM_NAME = "echoverse-snooze";
const DAILY_RESET_ALARM_NAME = "echoverse-daily-reset";
const DEFAULT_HOURLY_INTERVAL = 60;
const DEFAULT_RECURRING_INTERVAL = 30;
const DEFAULT_MESSAGE = "Drink water";
const DEFAULT_MESSAGE_POOL = ["Drink water", "Look away from screen", "Breathe 10 seconds"];
const TIMER_DEBOUNCE_MS = 90 * 1000;
const MAX_TIMER_GAP_MS = 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 90 * 1000;

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
  const data = await chrome.storage.sync.get("soundEnabled");
  const soundEnabled = data.soundEnabled !== false;
  if (soundEnabled) {
    await setupOffscreenDocument("offscreen.html");
    chrome.runtime.sendMessage({
      target: "offscreen",
      type: "play-sound",
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
      iconUrl: "icons/icon128.png",
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
  chrome.alarms.clear(name);
}

function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getNextDueAt(intervalMinutes) {
  return Date.now() + intervalMinutes * 60 * 1000;
}

function getReminderAlarmName(mode) {
  return mode === "hourly" ? HOURLY_ALARM_NAME : RECURRING_ALARM_NAME;
}

function getReminderIntervalMinutes(data, mode) {
  if (mode === "hourly") {
    return Math.max(1, Number(data.hourlyIntervalMinutes || DEFAULT_HOURLY_INTERVAL));
  }

  const value = Number(data.customIntervalMinutes || data.intervalMinutes || DEFAULT_RECURRING_INTERVAL);
  return Math.max(1, Number.isFinite(value) ? value : DEFAULT_RECURRING_INTERVAL);
}

function getReminderMessage(data, mode) {
  if (mode === "hourly") {
    return data.hourlyMessage || data.message || DEFAULT_MESSAGE;
  }

  return data.recurringMessage || data.message || DEFAULT_MESSAGE;
}

function getReminderEnabled(data, mode) {
  return mode === "hourly" ? data.hourlyEnabled !== false : data.recurringEnabled !== false;
}

async function readSettings() {
  return await chrome.storage.sync.get([
    "mode",
    "intervalMinutes",
    "customIntervalMinutes",
    "message",
    "messagePool",
    "soundEnabled",
    "lastTriggeredAt",
    "nextDueAt",
    "disableTodayUntil",
    "migrationDone",
    "hourlyMessage",
    "recurringMessage",
    "interval",
    "dailyStats",
    "streak",
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
    data.customIntervalMinutes || data.intervalMinutes || data.interval || 30,
  );
  if ([15, 30, 45, 60].includes(value)) {
    return value;
  }
  return Math.max(1, Number.isFinite(value) ? value : 30);
}

async function migrateSettings(data) {
  if (data.migrationDone) {
    return data;
  }

  const intervalMinutes = Number(data.intervalMinutes || DEFAULT_RECURRING_INTERVAL);
  const hourlyEnabled = data.hourlyEnabled !== false;
  const recurringEnabled = data.recurringEnabled !== false;
  await chrome.storage.sync.set({
    hourlyEnabled,
    recurringEnabled,
    hourlyIntervalMinutes: Number(data.hourlyIntervalMinutes || DEFAULT_HOURLY_INTERVAL),
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

  await chrome.storage.sync.remove(["soundPreset", "customAudioUrl", "debugOverlayAlwaysOn", "mode", "interval", "customIntervalMinutes", "message"]);

  return { ...data, hourlyEnabled, recurringEnabled };
}

async function ensureReminderAlarm(mode, intervalMinutes) {
  const alarmName = getReminderAlarmName(mode);
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
  await chrome.alarms.create(DAILY_RESET_ALARM_NAME, {
    when: nextMidnight.getTime(),
  });
}

async function triggerReminder(mode, source = "alarm") {
  const data = await readSettings();
  const now = Date.now();
  const todayKey = getTodayKey();
  const enabledKey = mode === "hourly" ? "hourlyEnabled" : "recurringEnabled";

  if (data.disableTodayUntil === todayKey && mode === "recurring") {
    log(`Reminder skipped (${source}) because disabled today.`);
    return;
  }

  if (source === "startup" || source === "wake") {
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

  if (mode === "recurring") {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, {
            type: "SHOW_OVERLAY",
            payload: {
              id: String(now),
              title: "Time to rest",
              message,
            },
          });
        }
      });
    });
  }

  if (mode === "hourly") {
    log("Hourly reminder fired without overlay.");
  }
  log(`Reminder fired from ${source}.`);
}

async function handleOverlayAction(action) {
  await patchStats(({ dailyStats, today, streak, todayKey }) => {
    const nextToday = { ...today };
    if (action === "skip") {
      nextToday.skipped += 1;
    }
    if (action === "snooze") {
      nextToday.snoozed += 1;
    }
    if (action === "disable_today") {
      nextToday.disabledToday = true;
    }
    dailyStats[todayKey] = nextToday;
    return { dailyStats, streak };
  });

  if (action === "snooze") {
    await chrome.alarms.clear(SNOOZE_ALARM_NAME);
    await chrome.alarms.create(SNOOZE_ALARM_NAME, { delayInMinutes: 5 });
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, { type: "HIDE_OVERLAY" });
        }
      });
    });
    return;
  }

  if (action === "disable_today") {
    const todayKey = getTodayKey();
    await chrome.storage.sync.set({ disableTodayUntil: todayKey });
    await chrome.alarms.clear(ALARM_NAME);
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, { type: "HIDE_OVERLAY" });
        }
      });
    });
    return;
  }

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, { type: "HIDE_OVERLAY" });
      }
    });
  });
}

async function rehydrateScheduler(source = "startup") {
  const data = await migrateSettings(await readSettings());
  const intervalMinutes = normalizeInterval(data);

  await clearAlarm(SNOOZE_ALARM_NAME);
  await ensureReminderAlarm(intervalMinutes);
  await scheduleDailyReset();

  const nextDueAt = data.nextDueAt || 0;
  const shouldResetFromNow = source === "startup" || source === "wake";
  if (shouldResetFromNow) {
    await chrome.storage.sync.set({ nextDueAt: getNextDueAt(intervalMinutes) });
    log(`Scheduler reset from ${source}.`);
  } else if (nextDueAt && nextDueAt > Date.now()) {
    log("Scheduler restored from storage.");
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HOURLY_ALARM_NAME) {
    triggerReminder("hourly", "alarm");
  } else if (alarm.name === RECURRING_ALARM_NAME) {
    triggerReminder("recurring", "alarm");
  } else if (alarm.name === SNOOZE_ALARM_NAME) {
    triggerReminder("recurring", "snooze");
  } else if (alarm.name === DAILY_RESET_ALARM_NAME) {
    chrome.storage.sync.set({ disableTodayUntil: null });
    scheduleDailyReset();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OVERLAY_ACTION") {
    (async () => {
      await handleOverlayAction(message.action);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.action === "start-timer") {
    (async () => {
      const updates = {};
      const enabledModes = [];

      if (message.hourlyEnabled) {
        const hourlyIntervalMinutes = Math.max(1, Number(message.hourlyIntervalMinutes || DEFAULT_HOURLY_INTERVAL));
        updates.hourlyEnabled = true;
        updates.hourlyIntervalMinutes = hourlyIntervalMinutes;
        updates.hourlyMessage = message.hourlyMessage || DEFAULT_MESSAGE;
        await ensureReminderAlarm("hourly", hourlyIntervalMinutes);
        enabledModes.push("theo giờ");
      } else {
        updates.hourlyEnabled = false;
        await chrome.alarms.clear(HOURLY_ALARM_NAME);
      }

      if (message.recurringEnabled) {
        const recurringIntervalMinutes = Math.max(1, Number(message.recurringIntervalMinutes || DEFAULT_RECURRING_INTERVAL));
        updates.recurringEnabled = true;
        updates.recurringIntervalMinutes = recurringIntervalMinutes;
        updates.recurringMessage = message.recurringMessage || DEFAULT_MESSAGE;
        await ensureReminderAlarm("recurring", recurringIntervalMinutes);
        enabledModes.push("lặp lại");
      } else {
        updates.recurringEnabled = false;
        await chrome.alarms.clear(RECURRING_ALARM_NAME);
      }

      updates.lastTriggeredAt = null;
      await chrome.storage.sync.set(updates);
      await scheduleDailyReset();
      sendResponse({ status: `Echoverse đã bật: ${enabledModes.join(" + ")}.` });
    })();
    return true;
  }

  if (message.action === "toggle-sound") {
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
  await rehydrateScheduler("startup");
  startupHandling = false;
});

chrome.runtime.onInstalled.addListener(async () => {
  await rehydrateScheduler("startup");
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "active") {
    log("Computer has become active.");
    await rehydrateScheduler("wake");
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_STATS") {
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

  if (message?.type === "GET_SETTINGS") {
    (async () => {
      const data = await readSettings();
      sendResponse({ ok: true, data });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PLAY_SOUND") {
    (async () => {
      await setupOffscreenDocument("offscreen.html");
      chrome.runtime.sendMessage(message);
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SET_SETTINGS") {
    (async () => {
      await chrome.storage.sync.set(message.data || {});
      await rehydrateScheduler("startup");
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TRIGGER_NOW") {
    (async () => {
      await triggerReminder("manual");
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "HIDE_ALL_OVERLAY") {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, { type: "HIDE_OVERLAY" });
        }
      });
    });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "NOOP") {
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_DAILY_STATS") {
    (async () => {
      const data = await readSettings();
      sendResponse({ ok: true, data: data.dailyStats || {} });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_STREAK") {
    (async () => {
      const data = await readSettings();
      sendResponse({
        ok: true,
        data: data.streak || { current: 0, best: 0, lastActiveDate: null },
      });
    })();
    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING_BACKGROUND") {
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
