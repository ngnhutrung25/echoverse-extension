export const ALARM_NAMES = {
  HOURLY: "echoverse-hourly-reminder",
  RECURRING: "echoverse-recurring-reminder",
  SNOOZE: "echoverse-snooze",
};

export const DEFAULTS = {
  HOURLY_INTERVAL_MINUTES: 60,
  RECURRING_INTERVAL_MINUTES: 15,
  MESSAGE: "Drink water",
  MESSAGE_POOL: ["Drink water", "Look away from screen", "Breathe 10 seconds"],
  SNOOZE_DELAY_MINUTES: 5,
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
  SNOOZE: "SNOOZE",
  PAUSE: "PAUSE",
  SHOWN: "SHOWN",
};

export const STORAGE_KEYS = {
  // common
  SOUND_ENABLED: "soundEnabled",
  DAILY_STATS: "dailyStats",
  OVERLAY_ACTIVE: "overlayActive",
  // hourly
  HOURLY_ENABLED: "hourlyEnabled",
  HOURLY_INTERVAL_MINUTES: "hourlyIntervalMinutes",
  HOURLY_MESSAGE: "hourlyMessage",
  HOURLY_LAST_TRIGGERED_AT: "hourlyLastTriggeredAt",
  HOURLY_NEXT_DUE_AT: "hourlyNextDueAt",
  // recurring
  RECURRING_ENABLED: "recurringEnabled",
  RECURRING_INTERVAL_MINUTES: "recurringIntervalMinutes",
  RECURRING_MESSAGE: "recurringMessage",
  RECURRING_LAST_TRIGGERED_AT: "recurringLastTriggeredAt",
  RECURRING_NEXT_DUE_AT: "recurringNextDueAt",
};
