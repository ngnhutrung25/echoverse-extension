export const ALARM_NAMES = {
  HOURLY: "echoverse-hourly-reminder",
  RECURRING: "echoverse-recurring-reminder",
};

export const DEFAULTS = {
  HOURLY_INTERVAL_MINUTES: 60,
  RECURRING_INTERVAL_MINUTES: 15,
  MESSAGE: "Drink water",
  STATUS_TIMEOUT_MS: 1500,
};

export const MODES = {
  HOURLY: "hourly",
  RECURRING: "recurring",
};

export const MESSAGE_TYPES = {
  SHOW_OVERLAY: "SHOW_OVERLAY",
  HIDE_OVERLAY: "HIDE_OVERLAY",
  OVERLAY_ACTION: "OVERLAY_ACTION",
  PLAY_SOUND_OFFSCREEN: "PLAY_SOUND_OFFSCREEN",
  START_TIMER: "START_TIMER",
  TOGGLE_SOUND: "TOGGLE_SOUND",
};

export const ACTIONS = {
  SKIP: "SKIP",
  PAUSE: "PAUSE",
  SHOWN: "SHOWN",
};

export const STORAGE_KEYS = {
  // common
  SOUND_ENABLED: "soundEnabled",
  DAILY_STATS: "dailyStats",
  // hourly
  HOURLY_ENABLED: "hourlyEnabled",
  HOURLY_INTERVAL_MINUTES: "hourlyIntervalMinutes",
  // recurring
  RECURRING_ENABLED: "recurringEnabled",
  RECURRING_INTERVAL_MINUTES: "recurringIntervalMinutes",
};
