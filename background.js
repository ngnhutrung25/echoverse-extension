function log(message) {
  const timestamp = new Date().toLocaleString();
  console.log(`[${timestamp}] ${message}`);
}

let offscreenCreating; // A global promise to avoid concurrency issues

async function setupOffscreenDocument(path) {
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts.length > 0) {
    return; // The offscreen document is already open
  }

  if (offscreenCreating) {
    await offscreenCreating;
  } else {
    offscreenCreating = chrome.offscreen.createDocument({
      url: path,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Playing notification sounds",
    });
    await offscreenCreating;
    offscreenCreating = null;
  }
}

async function playSound() {
  chrome.storage.sync.get("soundEnabled", async (data) => {
    const soundEnabled = data.soundEnabled !== false;
    if (soundEnabled) {
      await setupOffscreenDocument("offscreen.html");
      chrome.runtime.sendMessage({
        target: "offscreen",
        type: "play-sound",
      });
      log("Sound playback requested via offscreen document.");
    } else {
      log("Sound is disabled. Notification sent without sound.");
    }
  });
}

function sendNotification(title, message) {
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: title,
      message: message,
      priority: 2,
    },
    (notificationId) => {
      if (chrome.runtime.lastError) {
        log(`Notification error: ${chrome.runtime.lastError}`);
      } else {
        log(`Notification created with ID: ${notificationId}`);
      }
    }
  );
}

function setupHourlyAlert(message) {
  const now = new Date();
  const nextAlert = new Date();
  nextAlert.setHours(now.getHours() + 1, 0, 0, 0);

  const when = nextAlert.getTime();

  chrome.alarms.create("hourlyAlarm", {
    when: when,
    periodInMinutes: 60,
  });

  chrome.storage.sync.set({ hourlyMessage: message });
  log("Hourly alarm has been set.");
}

function setupRecurringAlert(intervalMinutes, message) {
  chrome.alarms.create("recurringAlarm", {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });

  chrome.storage.sync.set({
    recurringMessage: message,
    interval: intervalMinutes,
  });
  log(`Recurring alarm every ${intervalMinutes} minutes has been set.`);
}

function clearAllAlarms() {
  chrome.alarms.clearAll(() => {
    log("All alarms have been cleared.");
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "hourlyAlarm") {
    chrome.storage.sync.get("hourlyMessage", (data) => {
      const message = data.hourlyMessage || "";
      const now = new Date();
      sendNotification(
        "Chime Extension",
        `Bây giờ là: ${now.getHours()} giờ.\n${message}`
      );
      log(`Hourly notification with message: ${message}`);
      playSound();
    });
  } else if (alarm.name === "recurringAlarm") {
    chrome.storage.sync.get(["recurringMessage", "interval"], (data) => {
      const message = data.recurringMessage || "";
      const intervalMinutes = data.interval || 0;
      sendNotification(
        "Chime Extension",
        `${intervalMinutes} phút đã trôi qua.\n${message}`
      );
      log(
        `Recurring notification every ${intervalMinutes} minutes with message: ${message}`
      );
      playSound();
    });
  }
});

chrome.idle.onStateChanged.addListener((state) => {
  if (state === "active") {
    log("Computer has become active.");
    chrome.storage.sync.get(
      ["mode", "hourlyMessage", "recurringMessage", "interval"],
      (data) => {
        clearAllAlarms();

        if (data.mode === "hourly") {
          setupHourlyAlert(data.hourlyMessage || "");
          log("Hourly alarm has been restarted.");
        } else if (data.mode === "recurring") {
          setupRecurringAlert(data.interval || 30, data.recurringMessage || "");
          log("Recurring alarm has been restarted.");
        }
      }
    );
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "start-timer") {
    clearAllAlarms();

    if (message.mode === "hourly") {
      setupHourlyAlert(message.message);
      chrome.storage.sync.set({ mode: "hourly" });
      sendResponse({ status: "Chuông báo theo giờ đã được đặt." });
    } else if (message.mode === "recurring") {
      setupRecurringAlert(message.interval, message.message);
      chrome.storage.sync.set({ mode: "recurring" });
      sendResponse({
        status: `Chuông báo lặp lại mỗi ${message.interval} phút đã được đặt.`,
      });
    } else {
      sendResponse({ error: "Invalid mode." });
    }
  } else if (message.action === "toggle-sound") {
    chrome.storage.sync.get("soundEnabled", (data) => {
      const soundEnabled = data.soundEnabled !== false;
      chrome.storage.sync.set({ soundEnabled: !soundEnabled }, () => {
        log(`Sound has been ${!soundEnabled ? "enabled" : "disabled"}.`);
        sendResponse({ soundEnabled: !soundEnabled });
      });
    });
    return true;
  }
  return true;
});
