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
  };
}

function parseCommon(data) {
  return {
    soundEnabled: data[STORAGE_KEYS.SOUND_ENABLED] !== false,
    dailyStats: data[STORAGE_KEYS.DAILY_STATS] || {},
  };
}

// ─── In-memory cache (background service worker lifetime) ─────────────────────

let _cache = null;

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
  if (!_cache) await loadAll();
  return _cache;
}

/**
 * Persist a flat key/value patch to storage and update cache.
 * @param {Object} patch - flat storage key/value pairs
 */
async function setData(patch) {
  await storageSet(patch);

  if (_cache) {
    const raw = { ..._rawFromCache(), ...patch };
    _cache = {
      hourly: parseHourly(raw),
      recurring: parseRecurring(raw),
      common: parseCommon(raw),
    };
  }
}

/**
 * Reconstruct a flat raw object from current cache (for re-parsing after patch)
 */
function _rawFromCache() {
  if (!_cache) return {};
  const { hourly, recurring, common } = _cache;
  return {
    [STORAGE_KEYS.HOURLY_ENABLED]: hourly.enabled,
    [STORAGE_KEYS.HOURLY_INTERVAL_MINUTES]: hourly.intervalMinutes,
    [STORAGE_KEYS.RECURRING_ENABLED]: recurring.enabled,
    [STORAGE_KEYS.RECURRING_INTERVAL_MINUTES]: recurring.intervalMinutes,
    [STORAGE_KEYS.SOUND_ENABLED]: common.soundEnabled,
    [STORAGE_KEYS.DAILY_STATS]: common.dailyStats,
  };
}

/**
 * Invalidate cache (force reload on next getData call).
 */
function invalidate() {
  _cache = null;
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

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

export { loadAll, getData, setData, invalidate, updateTodayStats };
