import { STORAGE_KEYS, DEFAULTS } from "./constants.js";
import { log, getTodayKey } from "./helpers.js";

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

// ─── Keys ─────────────────────────────────────────────────────────────────────

const ALL_KEYS = [
  STORAGE_KEYS.HOURLY_ENABLED,
  STORAGE_KEYS.HOURLY_INTERVAL_MINUTES,
  STORAGE_KEYS.RECURRING_ENABLED,
  STORAGE_KEYS.RECURRING_INTERVAL_MINUTES,
  STORAGE_KEYS.SOUND_ENABLED,
  STORAGE_KEYS.DAILY_STATS,
];

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseHourly(raw) {
  return {
    enabled: raw[STORAGE_KEYS.HOURLY_ENABLED] === true,
    intervalMinutes: Math.max(
      1,
      Number(
        raw[STORAGE_KEYS.HOURLY_INTERVAL_MINUTES] ||
          DEFAULTS.HOURLY_INTERVAL_MINUTES,
      ),
    ),
  };
}

function parseRecurring(raw) {
  return {
    enabled: raw[STORAGE_KEYS.RECURRING_ENABLED] === true,
    intervalMinutes: Math.max(
      1,
      Number(
        raw[STORAGE_KEYS.RECURRING_INTERVAL_MINUTES] ||
          DEFAULTS.RECURRING_INTERVAL_MINUTES,
      ),
    ),
  };
}

function parseCommon(raw) {
  return {
    soundEnabled: raw[STORAGE_KEYS.SOUND_ENABLED] !== false,
    dailyStats: raw[STORAGE_KEYS.DAILY_STATS] || {},
  };
}

function parseAll(raw) {
  return {
    hourly: parseHourly(raw),
    recurring: parseRecurring(raw),
    common: parseCommon(raw),
  };
}

// ─── In-memory cache (background service worker lifetime) ─────────────────────

let _rawCache = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load all state from storage into cache. Safe to call multiple times.
 */
async function loadAll() {
  _rawCache = await storageGet(ALL_KEYS);
  log("Store loaded");
  return parseAll(_rawCache);
}

/**
 * Get full parsed state. Loads from storage if cache is empty.
 */
async function getData() {
  if (!_rawCache) await loadAll();
  return parseAll(_rawCache);
}

/**
 * Persist a flat key/value patch to storage and update cache.
 * @param {Object} patch - flat storage key/value pairs
 */
async function setData(patch) {
  await storageSet(patch);
  if (_rawCache) {
    _rawCache = { ..._rawCache, ...patch };
  }
}

/**
 * Invalidate cache (force reload on next getData call).
 */
function invalidate() {
  _rawCache = null;
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

async function updateTodayStats() {
  const todayKey = getTodayKey();
  const raw = await storageGet([STORAGE_KEYS.DAILY_STATS]);
  const dailyStats = raw[STORAGE_KEYS.DAILY_STATS] || {};
  const current = dailyStats[todayKey] || { recurringShown: 0 };
  const next = { ...current };
  next.recurringShown = (next.recurringShown || 0) + 1;

  await setData({
    [STORAGE_KEYS.DAILY_STATS]: {
      ...dailyStats,
      [todayKey]: next,
    },
  });
}

export { loadAll, getData, setData, invalidate, updateTodayStats };
