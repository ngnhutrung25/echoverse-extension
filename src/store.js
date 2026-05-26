import { STORAGE_KEYS, DEFAULTS, ACTIONS } from "./constants.js";
import { log } from "./helpers.js";

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function storageGet(keys) {
  try {
    return await chrome.storage.sync.get(keys);
  } catch (e) {
    log(`Storage get error: ${e.message}`);
    return {};
  }
}

async function storageSet(data) {
  try {
    await chrome.storage.sync.set(data);
  } catch (e) {
    log(`Storage set error: ${e.message}`);
  }
}

// ─── Keys grouped by concern ──────────────────────────────────────────────────

const HOURLY_KEYS = [
  STORAGE_KEYS.HOURLY_ENABLED,
  STORAGE_KEYS.HOURLY_INTERVAL_MINUTES,
  STORAGE_KEYS.HOURLY_MESSAGE,
  STORAGE_KEYS.HOURLY_LAST_TRIGGERED_AT,
  STORAGE_KEYS.HOURLY_NEXT_DUE_AT,
];

const RECURRING_KEYS = [
  STORAGE_KEYS.RECURRING_ENABLED,
  STORAGE_KEYS.RECURRING_INTERVAL_MINUTES,
  STORAGE_KEYS.RECURRING_MESSAGE,
  STORAGE_KEYS.RECURRING_LAST_TRIGGERED_AT,
  STORAGE_KEYS.RECURRING_NEXT_DUE_AT,
];

const COMMON_KEYS = [
  STORAGE_KEYS.SOUND_ENABLED,
  STORAGE_KEYS.DAILY_STATS,
  STORAGE_KEYS.OVERLAY_ACTIVE,
];

const ALL_KEYS = [...HOURLY_KEYS, ...RECURRING_KEYS, ...COMMON_KEYS];

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseHourly(data) {
  return {
    enabled: data[STORAGE_KEYS.HOURLY_ENABLED] === true,
    intervalMinutes: Math.max(
      1,
      Number(
        data[STORAGE_KEYS.HOURLY_INTERVAL_MINUTES] ||
          DEFAULTS.HOURLY_INTERVAL_MINUTES,
      ),
    ),
    message: data[STORAGE_KEYS.HOURLY_MESSAGE] || DEFAULTS.MESSAGE,
    lastTriggeredAt: data[STORAGE_KEYS.HOURLY_LAST_TRIGGERED_AT] || null,
    nextDueAt: data[STORAGE_KEYS.HOURLY_NEXT_DUE_AT] || null,
  };
}

function parseRecurring(data) {
  return {
    enabled: data[STORAGE_KEYS.RECURRING_ENABLED] === true,
    intervalMinutes: Math.max(
      1,
      Number(
        data[STORAGE_KEYS.RECURRING_INTERVAL_MINUTES] ||
          DEFAULTS.RECURRING_INTERVAL_MINUTES,
      ),
    ),
    message: data[STORAGE_KEYS.RECURRING_MESSAGE] || DEFAULTS.MESSAGE,
    lastTriggeredAt: data[STORAGE_KEYS.RECURRING_LAST_TRIGGERED_AT] || null,
    nextDueAt: data[STORAGE_KEYS.RECURRING_NEXT_DUE_AT] || null,
  };
}

function parseCommon(data) {
  return {
    soundEnabled: data[STORAGE_KEYS.SOUND_ENABLED] !== false,
    dailyStats: data[STORAGE_KEYS.DAILY_STATS] || {},
    overlayActive: data[STORAGE_KEYS.OVERLAY_ACTIVE] === true,
  };
}

// ─── In-memory cache (background service worker lifetime) ─────────────────────

let _cache = null;

function isCached() {
  return _cache !== null;
}

function getCache() {
  return _cache;
}

function setCache(data) {
  _cache = data;
}

function patchCache(partial) {
  if (_cache) Object.assign(_cache, partial);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load all state from storage into cache. Safe to call multiple times.
 */
async function loadAll() {
  const raw = await storageGet(ALL_KEYS);
  _cache = {
    hourly: parseHourly(raw),
    recurring: parseRecurring(raw),
    common: parseCommon(raw),
  };
  log("Store loaded");
  return _cache;
}

/**
 * Get full state. Loads from storage if cache is empty.
 */
async function getData() {
  if (!isCached()) await loadAll();
  return getCache();
}

/**
 * Persist a flat key/value patch to storage and update cache.
 * @param {Object} patch - flat storage key/value pairs
 */
async function setData(patch) {
  await storageSet(patch);

  // Keep cache in sync without a full reload
  if (_cache) {
    const raw = { ..._rawFromCache(), ...patch };
    _cache = {
      hourly: parseHourly(raw),
      recurring: parseRecurring(raw),
      common: parseCommon(raw),
    };
  }
}

/** Reconstruct a flat raw object from current cache (for re-parsing after patch) */
function _rawFromCache() {
  if (!_cache) return {};
  const { hourly, recurring, common } = _cache;
  return {
    [STORAGE_KEYS.HOURLY_ENABLED]: hourly.enabled,
    [STORAGE_KEYS.HOURLY_INTERVAL_MINUTES]: hourly.intervalMinutes,
    [STORAGE_KEYS.HOURLY_MESSAGE]: hourly.message,
    [STORAGE_KEYS.HOURLY_LAST_TRIGGERED_AT]: hourly.lastTriggeredAt,
    [STORAGE_KEYS.HOURLY_NEXT_DUE_AT]: hourly.nextDueAt,
    [STORAGE_KEYS.RECURRING_ENABLED]: recurring.enabled,
    [STORAGE_KEYS.RECURRING_INTERVAL_MINUTES]: recurring.intervalMinutes,
    [STORAGE_KEYS.RECURRING_MESSAGE]: recurring.message,
    [STORAGE_KEYS.RECURRING_LAST_TRIGGERED_AT]: recurring.lastTriggeredAt,
    [STORAGE_KEYS.RECURRING_NEXT_DUE_AT]: recurring.nextDueAt,
    [STORAGE_KEYS.SOUND_ENABLED]: common.soundEnabled,
    [STORAGE_KEYS.DAILY_STATS]: common.dailyStats,
    [STORAGE_KEYS.OVERLAY_ACTIVE]: common.overlayActive,
  };
}

/**
 * Invalidate cache (force reload on next getData call).
 */
function invalidate() {
  _cache = null;
}

// ─── Convenience helpers used by background/index.js ─────────────────────────

async function updateReminderTiming(mode, now) {
  const data = await getData();
  const state = data[mode];
  const nextDueAt = now + state.intervalMinutes * 60 * 1000;

  const isHourly = mode === "hourly";
  await setData({
    [isHourly
      ? STORAGE_KEYS.HOURLY_LAST_TRIGGERED_AT
      : STORAGE_KEYS.RECURRING_LAST_TRIGGERED_AT]: now,
    [isHourly
      ? STORAGE_KEYS.HOURLY_NEXT_DUE_AT
      : STORAGE_KEYS.RECURRING_NEXT_DUE_AT]: nextDueAt,
  });
}

async function updateTodayStats(action) {
  const data = await getData();
  const todayKey = new Date().toISOString().slice(0, 10);
  const current = data.common.dailyStats[todayKey] || { shown: 0 };
  const next = { ...current };
  if (action === ACTIONS.SHOWN) next.shown += 1;

  await setData({
    [STORAGE_KEYS.DAILY_STATS]: {
      ...data.common.dailyStats,
      [todayKey]: next,
    },
  });
}

async function updateSettings(patch) {
  const mapped = {};
  if (patch.soundEnabled !== undefined)
    mapped[STORAGE_KEYS.SOUND_ENABLED] = patch.soundEnabled;
  await setData(mapped);
}

async function shouldDebounce(mode, now, debounceMs = 90000) {
  const data = await getData();
  const last = data[mode].lastTriggeredAt;
  return last && now - last < debounceMs;
}

export {
  loadAll,
  getData,
  setData,
  invalidate,
  updateReminderTiming,
  updateTodayStats,
  updateSettings,
  shouldDebounce,
};
