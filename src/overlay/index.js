let currentOverlayId = null;
let actionEventHandler = null;

/**
 * Migrated from constants.js
 */
const MESSAGE_TYPES = {
  SHOW_OVERLAY: "SHOW_OVERLAY",
  HIDE_OVERLAY: "HIDE_OVERLAY",
  OVERLAY_ACTION: "OVERLAY_ACTION",
};

const ACTIONS = {
  SKIP: "SKIP",
  SNOOZE: "SNOOZE",
  PAUSE: "PAUSE",
};

const UI = {
  OVERLAY_ID: "echoverse-overlay",
  // Overlay content
  OVERLAY_KICKER: "echoverse",
  OVERLAY_TITLE: "Nghỉ ngơi thôi",
  OVERLAY_MESSAGE: "Đứng dậy. Vươn vai. Uống nước. Dạo bộ.",
  // Overlay actions
  OVERLAY_SKIP: "Yup, nghỉ chút",
  OVERLAY_SNOOZE: "Nhắc lại sau",
  OVERLAY_PAUSE: "Dừng nhắc",
  // Debug overlay
  DEBUG_OVERLAY_TITLE: "Debug overlay",
  DEBUG_OVERLAY_MESSAGE: "Overlay always on for UI testing.",
};

/**
 * Lock or unlock page scrolling
 * @param {boolean} locked - Whether to lock scrolling
 */
function setPageScrollLocked(locked) {
  document.documentElement.style.overflow = locked ? "hidden" : "";
  document.body.style.overflow = locked ? "hidden" : "";
}

/**
 * Remove existing overlay from DOM
 */
function removeOverlay() {
  const existing = document.getElementById(UI.OVERLAY_ID);
  if (existing) {
    existing.remove();
  }
  setPageScrollLocked(false);
  currentOverlayId = null;
}

/**
 * Create overlay HTML structure
 * @param {Object} payload - Overlay data
 * @returns {HTMLElement} Overlay element
 */
function createOverlayElement(payload) {
  const overlay = document.createElement("div");
  overlay.id = UI.OVERLAY_ID;
  overlay.innerHTML = `
    <div class="echoverse-overlay-backdrop"></div>
    <div class="echoverse-overlay-card">
      <div class="echoverse-overlay-media">
        <img class="echoverse-overlay-image" alt="landscape-image" />
      </div>
      <div class="echoverse-overlay-copy">
        <p class="echoverse-kicker">${UI.OVERLAY_KICKER}</p>
        <h1>${UI.OVERLAY_TITLE}</h1>
        <p class="echoverse-message">${UI.OVERLAY_MESSAGE}</p>
        <div class="echoverse-actions">
          <button type="button" data-action=${ACTIONS.SKIP}>${UI.OVERLAY_SKIP}</button>
          <button type="button" data-action=${ACTIONS.SNOOZE}>${UI.OVERLAY_SNOOZE}</button>
          <button type="button" data-action=${ACTIONS.PAUSE}>${UI.OVERLAY_PAUSE}</button>
        </div>
      </div>
    </div>
  `;
  return overlay;
}

/**
 * Handle overlay action button clicks
 * @param {Event} event - Click event
 */
function handleActionEvent(event) {
  const target = event.target;
  const button =
    target instanceof HTMLElement
      ? target.closest("button[data-action]")
      : null;

  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const action = button.dataset.action;
  if (!action) {
    return;
  }

  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.OVERLAY_ACTION,
    action,
  });
}

/**
 * Show overlay with optional custom content
 * @param {Object} payload - Overlay data
 */
function showOverlay(payload = {}) {
  if (document.getElementById(UI.OVERLAY_ID)) {
    return;
  }

  currentOverlayId = payload.id || String(Date.now());

  setPageScrollLocked(true);

  const overlay = createOverlayElement(payload);

  // Remove previous event listener if exists
  if (actionEventHandler) {
    document.removeEventListener("click", actionEventHandler, true);
  }

  // Create and store new event listener
  actionEventHandler = handleActionEvent;
  document.addEventListener("click", actionEventHandler, true);
  document.documentElement.appendChild(overlay);

  const imageEl = overlay.querySelector(".echoverse-overlay-image");
  if (!imageEl) return;

  // Background sends data URLs, set directly
  imageEl.src = payload.imageUrl;
}

// Message listener for overlay control
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MESSAGE_TYPES.SHOW_OVERLAY) {
    showOverlay(message.payload || {});
  }

  if (message?.type === MESSAGE_TYPES.HIDE_OVERLAY) {
    removeOverlay();
  }
});

// Debug overlay (remove in production)
// setTimeout(() => {
//   showOverlay({
//     title: UI.DEBUG_OVERLAY_TITLE,
//     message: UI.DEBUG_OVERLAY_MESSAGE,
//     imageUrl:
//       "https://i.natgeofe.com/n/d35b89a0-cd33-4648-bf2d-459ad60b66ae/atedmunds.jpg",
//   });
// }, 500);
