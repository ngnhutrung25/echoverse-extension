import { ACTIONS, MESSAGE_TYPES } from "../constants";

let currentOverlayId = null;

const UI = {
  OVERLAY_ID: "echoverse-overlay",
  // content
  OVERLAY_KICKER: "echoverse",
  OVERLAY_TITLE: "Time to rest",
  OVERLAY_MESSAGE: "Stand up. Stretch. Drink water.",
  // button
  OVERLAY_SKIP: "Skip",
  OVERLAY_SNOOZE: "Snooze 5m",
  OVERLAY_DISABLE_TODAY: "Disable for today",
  // debug
  DEBUG_OVERLAY_TITLE: "Debug overlay",
  DEBUG_OVERLAY_MESSAGE: "Overlay always on for UI testing.",
};

const LANDSCAPE_IMAGES = [
  "https://i.natgeofe.com/n/d35b89a0-cd33-4648-bf2d-459ad60b66ae/atedmunds.jpg",
  "https://i.natgeofe.com/n/ae04a5ac-4ddd-424e-b6a8-ddeee866dd56/DSC00648.jpg",
  "https://i.natgeofe.com/n/f3903887-5719-452a-a130-b45e77534bb1/Final_Submission.jpg",
  "https://i.natgeofe.com/n/d3cb72c7-e80d-4c7c-b085-2333974bf816/NatGeo_ConestEntry_Final.jpg",
  "https://i.natgeofe.com/n/76efc4b1-8861-4080-b8cf-cb207afde795/quetzalcoatlst.jpg",
  "https://i.natgeofe.com/n/d69d750c-47ef-4356-a18c-c40955cc9f5f/085bde09_63da_46f9_8a7b_599bc8168b5f.jpg",
  "https://i.natgeofe.com/n/131e424a-a4c9-4164-91d5-2bf10483a783/IMG_6424.JPG",
  "https://i.natgeofe.com/n/ec450b55-ae3d-4859-bbd5-9d3d8453f9d0/Final_submission_1.JPG",
  "https://i.natgeofe.com/n/4a3ea0c0-30e8-4736-a660-a81220ab643e/_DSC4613_1_copia.jpg",
  "https://i.natgeofe.com/n/d78f06a7-b2a7-4966-aff9-24750c7c7632/02-iconic-glen-canyon-national-recreation-area-arizona.jpg",
  "https://i.natgeofe.com/n/8c69e963-63df-4666-bd9f-5d0a3312149b/03-iconic-sculpture-park-galicia-spain.jpg",
  "https://i.natgeofe.com/n/eab69a3f-b210-48c6-9626-bb22672bfd3f/10-iconic-elephant-havelock-island-andaman-islands-india.jpg",
  "https://i.natgeofe.com/n/7d9423d6-74e8-4fe2-92ad-62fbbabdc743/07-iconic-jiuzhaigou-nature-reserve-china.jpg",
  "https://i.natgeofe.com/n/fb419103-3ce8-4322-b225-36084e32152e/11-iconic-callanish-standing-stones-isle-of-lewis-scotland.jpg",
  "https://i.natgeofe.com/n/9d4c90d6-0ba7-4109-8a7c-e056c0e1bdf5/08-iconic-owachomo-natural-bridges-national-monument-utah.jpg",
  "https://i.natgeofe.com/n/47ab2aa5-a3f3-4709-b2cb-da4218a26940/13-iconic-north-fork-koyukuk-river-gates-arctic-national-park-preserve-alaska.jpg",
  "https://i.natgeofe.com/n/dfe7d077-6131-42b5-9293-8fe880d1b776/12-iconic-penguins-iceberg-antarctica.jpg",
  "https://i.natgeofe.com/n/cc1b1244-3a7b-4910-a409-fa65dfc40983/14-iconic-basalt-pinnacles-isle-of-skye-scotland.jpg",
  "https://i.natgeofe.com/n/857bcc5f-d9a8-49b8-8178-f95d823c522c/15-iconic-whale-shark-australia.jpg",
  "https://i.natgeofe.com/n/94a340b0-45ac-4de0-97c2-3e3b94e11393/17-iconic-arch-darwin-island-galapagos-islands.jpg",
  "https://i.natgeofe.com/n/e16c207c-c151-47ea-bbfd-85bafefc19ee/18-iconic-patagonia-torres-del-paine-national-park-chile.jpg",
  "https://i.natgeofe.com/n/2682af35-b427-4b62-a34e-92ab196f1f2d/19-iconic-lake-powell-rock-formations-glen-canyon-national-recreation-area-utah.jpg",
  "https://i.natgeofe.com/n/244839c7-ba38-4a89-92c6-20b889b12c1d/20-iconic-grand-prismatic-spring-yellowstone-national-park-wyoming.jpg",
  "https://i.natgeofe.com/n/80bc6f05-12ce-4573-9e86-c92178c176b5/21-iconic-lava-hawaii-volcanoes-national-park.jpg",
  "https://i.natgeofe.com/n/2c9a46ac-7268-4bd3-b017-b9c069c81af1/22-iconic-celtic-fort-dun-aengus-aran-islands-ireland.jpg",
  "https://i.natgeofe.com/n/fe2384ea-1c1c-4cad-91d1-67da60933230/23-iconic-salt-dead-sea-israel.jpg",
  "https://i.natgeofe.com/n/caf83e99-8700-49fa-8bcc-1ee9826001e2/24-iconic-divers-easter-island.jpg",
  "https://i.natgeofe.com/n/13a3d808-0d0e-4f66-a24b-54b89fa3b2d4/25-iconic-mount-saint-helens-crater.jpg",
  "https://i.natgeofe.com/n/838ac0a4-aa34-46a3-8a89-6e91643432db/26-iconic-sand-baja-california-state-mexico.jpg",
  "https://i.natgeofe.com/n/994ab720-7f91-43f8-a1db-71b218245265/27-iconic-wildlife-highway-alberta-canada.jpg",
  "https://i.natgeofe.com/n/eaa177ac-68bc-4b08-9b84-33e79f5fc5dc/28-iconic-birds-saint-kilda-scotland.jpg",
  "https://i.natgeofe.com/n/a2afc371-a0c0-43f2-a0a9-1c457db7f340/29-iconic-ocras-jorden-norway.jpg",
  "https://i.natgeofe.com/n/9dab1f4c-90dc-432a-9bb5-dbc9d3f38be8/31-iconic-sunflowers-denton-montana.jpg",
  "https://i.natgeofe.com/n/a9919a3e-4b50-481d-b997-050beec5070d/32-iconic-gentoo-penguins-antarctica.jpg",
  "https://i.natgeofe.com/n/47c06474-7247-4a02-a0d7-4265d74c73d8/33-iconic-antelope-canyon-arizona.jpg",
  "https://i.natgeofe.com/n/575ebe7c-4c9b-4654-803d-2cc5babae8ab/34-iconic-cave-yucatan-peninsula-mexico.jpg",
  "https://i.natgeofe.com/n/88666160-9683-47b2-9625-53bf5d495b9b/35-iconic-camel-thorn-trees-namib-naukluft-park-namibia.jpg",
  "https://i.natgeofe.com/n/ccc82d6f-59a3-4992-8bdd-bf14a55363c3/36-iconic-waterfall-seljandrafoss-iceland.jpg",
  "https://i.natgeofe.com/n/4fa595dc-47b1-4c97-ad16-3bedaaf4b7ab/39-iconic-nature-reserve-kronotsky-zapovednik-russia.jpg",
  "https://i.natgeofe.com/n/83928a30-9f26-4db5-91a5-8391a2de61cd/40-botanists-redwood-national-park-california.jpg",
  "https://i.natgeofe.com/n/ef3db8ba-58d4-44c9-b4c7-3c1a7e62c259/41-iconic-mingun-pagoda-mandalay-myanmar.jpg",
  "https://i.natgeofe.com/n/029a7351-5f25-4d23-8e16-f0cf09156822/42-iconic-sunset-monument-valley-navajo-tribal-park-arizona.jpg",
  "https://i.natgeofe.com/n/f069ac57-3f1d-4f9c-81fe-49c72159a7eb/43-iconic-mountaineer-hkakabo-razi-myanmar.jpg",
  "https://i.natgeofe.com/n/3eba7d48-e1af-4559-936a-1ce7e196dbbe/44-iconic-badlands-national-park-south-dakota.jpg",
  "https://i.natgeofe.com/n/87388375-220e-4ba1-acf9-216c3b3ed07a/47-iconic-badlands-zabriskie-point-california.jpg",
  "https://i.natgeofe.com/n/01a62ba6-5d96-491a-8b1c-8a961ec243a2/48-iconic-death-valley-national-park-california.jpg",
  "https://i.natgeofe.com/n/947e6176-9918-446d-a60d-177737fafedf/49-iconic-texaco-hill-flint-hills-beaumont-kansas.jpg",
  "https://i.natgeofe.com/n/9b08f7dc-69ba-4f04-9f0f-f280eb6962f5/50-iconic-andes-mountains-chile.jpg",
];

function getRandomLandscapeImage() {
  return LANDSCAPE_IMAGES[Math.floor(Math.random() * LANDSCAPE_IMAGES.length)];
}

function setPageScrollLocked(locked) {
  document.documentElement.style.overflow = locked ? "hidden" : "";
  document.body.style.overflow = locked ? "hidden" : "";
}

function removeOverlay() {
  const existing = document.getElementById(UI.OVERLAY_ID);
  if (existing) {
    existing.remove();
  }
  setPageScrollLocked(false);
  currentOverlayId = null;
}

function showOverlay(payload = {}) {
  if (document.getElementById(UI.OVERLAY_ID)) {
    return;
  }

  currentOverlayId = payload.id || String(Date.now());

  const imageUrl = payload.imageUrl || getRandomLandscapeImage();

  setPageScrollLocked(true);

  const overlay = document.createElement("div");
  overlay.id = UI.OVERLAY_ID;
  overlay.innerHTML = `
    <div class="echoverse-overlay-backdrop"></div>
    <div class="echoverse-overlay-card">
      <div class="echoverse-overlay-media">
        <img class="echoverse-overlay-image" alt="Phong cảnh" />
      </div>
      <div class="echoverse-overlay-copy">
        <p class="echoverse-kicker">${UI.OVERLAY_KICKER}</p>
        <h1>${payload.title || UI.OVERLAY_TITLE}</h1>
        <p class="echoverse-message">${payload.message || UI.OVERLAY_MESSAGE}</p>
        <div class="echoverse-actions">
          <button type="button" data-action="skip">${UI.OVERLAY_SKIP}</button>
          <button type="button" data-action="snooze">${UI.OVERLAY_SNOOZE}</button>
          <button type="button" data-action="disable_today">${UI.OVERLAY_DISABLE_TODAY}</button>
        </div>
      </div>
    </div>
  `;

  overlay.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    if (!action) {
      return;
    }

    chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.OVERLAY_ACTION,
      action,
      overlayId: currentOverlayId,
    });

    if (action === ACTIONS.SKIP) {
      removeOverlay();
    }
  });

  document.documentElement.appendChild(overlay);

  const imageEl = overlay.querySelector(".echoverse-overlay-image");
  if (imageEl instanceof HTMLImageElement) {
    imageEl.style.opacity = "0";
    const preload = new Image();
    preload.onload = () => {
      imageEl.src = imageUrl;
      imageEl.style.opacity = "1";
    };
    preload.onerror = () => {
      imageEl.src = imageUrl;
      imageEl.style.opacity = "1";
    };
    preload.src = imageUrl;
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MESSAGE_TYPES.SHOW_OVERLAY) {
    showOverlay(message.payload || {});
  }

  if (message?.type === MESSAGE_TYPES.HIDE_OVERLAY) {
    removeOverlay();
  }
});

// ONLY FOR DEBUG
setTimeout(() => {
  showOverlay({
    title: UI.DEBUG_OVERLAY_TITLE,
    message: UI.DEBUG_OVERLAY_MESSAGE,
  });
}, 1500);
