import { log, isIgnorableError } from "../helpers.js";
import { DEFAULTS } from "../constants.js";

const EXCLUDED_ERROR_MESSAGES = [
  "Receiving end does not exist",
  "The message port closed before a response was received",
];

export function normalizeInterval(data) {
  const value = Number(
    data.intervalMinutes ||
      data.recurringIntervalMinutes ||
      DEFAULTS.RECURRING_INTERVAL_MINUTES,
  );
  return Number.isFinite(value)
    ? Math.max(5, value)
    : DEFAULTS.RECURRING_INTERVAL_MINUTES;
}

export function sendToTabs(message) {
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
      chrome.tabs.sendMessage(tab.id, message, () => {
        if (chrome.runtime.lastError) {
          if (!isIgnorableError(chrome.runtime.lastError.message, EXCLUDED_ERROR_MESSAGES)) {
            log(`Tab message error: ${chrome.runtime.lastError.message}`);
          }
        } else {
          log(`Message sent to tab ${tab.id}`);
        }
      });
    });
  });
}
