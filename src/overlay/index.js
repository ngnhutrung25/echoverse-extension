const MESSAGE_TYPES = {
  SHOW_OVERLAY: "SHOW_OVERLAY",
  HIDE_OVERLAY: "HIDE_OVERLAY",
  OVERLAY_ACTION: "OVERLAY_ACTION",
};

const ACTIONS = {
  SKIP: "SKIP",
  PAUSE: "PAUSE",
};

const UI = {
  OVERLAY_ID: "echoverse-overlay",
  OVERLAY_KICKER: "echoverse",
  OVERLAY_TITLE: "Nghỉ ngơi thôi",
  OVERLAY_MESSAGE: "Đứng dậy. Vươn vai. Uống nước. Dạo bộ.",
  OVERLAY_SKIP: "Yup, nghỉ chút",
  OVERLAY_PAUSE: "Dừng nhắc",
};

let actionEventHandler = null;

function setPageScrollLocked(locked) {
  document.documentElement.style.overflow = locked ? "hidden" : "";
  document.body.style.overflow = locked ? "hidden" : "";
}

function removeOverlay() {
  const existing = document.getElementById(UI.OVERLAY_ID);
  if (existing) existing.remove();
  setPageScrollLocked(false);
}

function createOverlayElement() {
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
          <button type="button" data-action=${ACTIONS.PAUSE}>${UI.OVERLAY_PAUSE}</button>
        </div>
      </div>
    </div>
  `;
  return overlay;
}

function handleActionEvent(event) {
  const button =
    event.target instanceof HTMLElement
      ? event.target.closest("button[data-action]")
      : null;

  if (!(button instanceof HTMLButtonElement)) return;

  const action = button.dataset.action;
  if (!action) return;

  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.OVERLAY_ACTION, action });
}

function showOverlay(payload = {}) {
  if (document.getElementById(UI.OVERLAY_ID)) return;

  setPageScrollLocked(true);

  const overlay = createOverlayElement();

  if (actionEventHandler) {
    document.removeEventListener("click", actionEventHandler, true);
  }
  actionEventHandler = handleActionEvent;
  document.addEventListener("click", actionEventHandler, true);
  document.documentElement.appendChild(overlay);

  const imageEl = overlay.querySelector(".echoverse-overlay-image");
  if (imageEl) imageEl.src = payload.imageUrl;
}

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
//     imageUrl:
//       "https://i.natgeofe.com/n/d35b89a0-cd33-4648-bf2d-459ad60b66ae/atedmunds.jpg",
//   });
// }, 500);
