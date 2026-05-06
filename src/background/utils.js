import { log } from "../helpers.js";

const EXCLUDED_ERROR_MESSAGES = [
  "Receiving end does not exist",
  "The message port closed before a response was received",
];

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
          if (
            !EXCLUDED_ERROR_MESSAGES.some((msg) =>
              chrome.runtime.lastError.message.includes(msg),
            )
          ) {
            log(`Tab message error: ${chrome.runtime.lastError.message}`);
          }
        } else {
          log(`Message sent to tab ${tab.id}`);
        }
      });
    });
  });
}
