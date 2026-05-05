export const ALARM_NAMES = {
  HOURLY: "echoverse-hourly-reminder",
  RECURRING: "echoverse-recurring-reminder",
  SNOOZE: "echoverse-snooze",
  DAILY_RESET: "echoverse-daily-reset",
};

export const DEFAULTS = {
  HOURLY_INTERVAL_MINUTES: 60,
  RECURRING_INTERVAL_MINUTES: 30,
  MESSAGE: "Drink water",
  MESSAGE_POOL: ["Drink water", "Look away from screen", "Breathe 10 seconds"],
  SNOOZE_DELAY_MINUTES: 5,
  STATUS_TIMEOUT_MS: 3000,
};

export const LIMITS = {
  TIMER_DEBOUNCE_MS: 90 * 1000,
  MAX_TIMER_GAP_MS: 10 * 60 * 1000,
};

export const MODES = {
  HOURLY: "hourly",
  RECURRING: "recurring",
};

export const MESSAGE_TYPES = {
  SHOW_OVERLAY: "SHOW_OVERLAY",
  HIDE_OVERLAY: "HIDE_OVERLAY",
  OVERLAY_ACTION: "OVERLAY_ACTION",
  GET_STATS: "GET_STATS",
  GET_SETTINGS: "GET_SETTINGS",
  SET_SETTINGS: "SET_SETTINGS",
  TRIGGER_NOW: "TRIGGER_NOW",
  PLAY_SOUND: "PLAY_SOUND",
  PING_BACKGROUND: "PING_BACKGROUND",
  GET_DAILY_STATS: "GET_DAILY_STATS",
};

export const TARGETS = {
  OFFSCREEN: "OFFSCREEN",
};

export const ACTIONS = {
  START_TIMER: "start-timer",
  TOGGLE_SOUND: "toggle-sound",
  SKIP: "skip",
  SNOOZE: "snooze",
  DISABLE_TODAY: "disable_today",
};

export const STORAGE_KEYS = {
  SOUND_ENABLED: "soundEnabled",
  MODE: "mode",
  INTERVAL_MINUTES: "intervalMinutes",
  CUSTOM_INTERVAL_MINUTES: "customIntervalMinutes",
  MESSAGE: "message",
  MESSAGE_POOL: "messagePool",
  LAST_TRIGGERED_AT: "lastTriggeredAt",
  NEXT_DUE_AT: "nextDueAt",
  DISABLE_TODAY_UNTIL: "disableTodayUntil",
  MIGRATION_DONE: "migrationDone",
  HOURLY_MESSAGE: "hourlyMessage",
  RECURRING_MESSAGE: "recurringMessage",
  INTERVAL: "interval",
  DAILY_STATS: "dailyStats",
  STREAK: "streak",
  HOURLY_ENABLED: "hourlyEnabled",
  RECURRING_ENABLED: "recurringEnabled",
  HOURLY_INTERVAL_MINUTES: "hourlyIntervalMinutes",
  RECURRING_INTERVAL_MINUTES: "recurringIntervalMinutes",
  SOUND_PRESET: "soundPreset",
  CUSTOM_AUDIO_URL: "customAudioUrl",
  DEBUG_OVERLAY_ALWAYS_ON: "debugOverlayAlwaysOn",
  VOLUME: "volume",
};

export const UI = {
  OVERLAY_ID: "echoverse-overlay",
  OVERLAY_TITLE: "Time to rest",
  OVERLAY_MESSAGE: "Stand up. Stretch. Drink water.",
  OVERLAY_SKIP: "Skip",
  OVERLAY_SNOOZE: "Snooze 5m",
  OVERLAY_DISABLE_TODAY: "Disable for today",
  OVERLAY_KICKER: "echoverse",
  DEBUG_OVERLAY_TITLE: "Debug overlay",
  DEBUG_OVERLAY_MESSAGE: "Overlay always on for UI testing.",
  RECURRING_ENABLED_STATUS_PREFIX: "Echoverse đã bật: ",
  RECURRING_ENABLED_STATUS_SUFFIX: ".",
  HOURLY_MODE_LABEL: "theo giờ",
  RECURRING_MODE_LABEL: "lặp lại",
  REMINDER_TITLE: "Time to rest",
};

export const ASSETS = {
  ICON_128: "icons/icon128.png",
  OFFSCREEN_HTML: "src/offscreen/offscreen.html",
};
