import { log } from "../helpers.js";

const EXCLUDED_ERROR_MESSAGES = ["Unable to download all specified images"];

export function sendNotification(message) {
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "Echoverse",
      message,
      priority: 2,
      requireInteraction: false,
    },
    (notificationId) => {
      if (chrome.runtime.lastError) {
        if (
          !EXCLUDED_ERROR_MESSAGES.some((msg) =>
            chrome.runtime.lastError.message.includes(msg),
          )
        ) {
          log(
            `Notification error: ${JSON.stringify(chrome.runtime.lastError)}`,
          );
        }
      } else {
        log(`Notification created with ID: ${notificationId}`);
      }
    },
  );
}
