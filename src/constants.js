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
  SET_RECURRING_PAUSED: "SET_RECURRING_PAUSED",
  PLAY_SOUND_OFFSCREEN: "PLAY_SOUND_OFFSCREEN",
  START_TIMER: "START_TIMER",
  TOGGLE_SOUND: "TOGGLE_SOUND",
};

export const ACTIONS = {
  SKIP: "SKIP",
  SNOOZE: "SNOOZE",
  PAUSE: "PAUSE",
};

export const SOURCE_TYPES = {
  STARTUP: "STARTUP",
  WAKE: "WAKE",
  ALARM: "ALARM",
};

export const STORAGE_KEYS = {
  SOUND_ENABLED: "soundEnabled",
  DAILY_STATS: "dailyStats",
  HOURLY_ENABLED: "hourlyEnabled",
  RECURRING_ENABLED: "recurringEnabled",
  RECURRING_PAUSED: "recurringPaused",
  HOURLY_INTERVAL_MINUTES: "hourlyIntervalMinutes",
  RECURRING_INTERVAL_MINUTES: "recurringIntervalMinutes",
  HOURLY_MESSAGE: "hourlyMessage",
  RECURRING_MESSAGE: "recurringMessage",
  HOURLY_LAST_TRIGGERED_AT: "hourlyLastTriggeredAt",
  RECURRING_LAST_TRIGGERED_AT: "recurringLastTriggeredAt",
  HOURLY_NEXT_DUE_AT: "hourlyNextDueAt",
  RECURRING_NEXT_DUE_AT: "recurringNextDueAt",
};
