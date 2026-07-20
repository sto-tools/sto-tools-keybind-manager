import { afterEach, beforeEach } from "vitest";

const READY_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 20;
let applicationLoadPromise;
let applicationShellPromise;

async function loadApplicationShell() {
  if (document.querySelector(".app-container")) return;

  applicationShellPromise ||= fetch("/src/index.html")
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load the application shell: ${response.status}`,
        );
      }
      return response.text();
    })
    .then((html) => {
      const sourceDocument = new DOMParser().parseFromString(html, "text/html");
      const sourceTitle = sourceDocument.querySelector("title");
      const targetTitle = document.querySelector("title");

      if (sourceTitle && targetTitle) {
        targetTitle.textContent = sourceTitle.textContent;
        for (const attribute of sourceTitle.attributes) {
          targetTitle.setAttribute(attribute.name, attribute.value);
        }
      }

      for (const node of sourceDocument.body.childNodes) {
        if (node.nodeName !== "SCRIPT") {
          document.body.appendChild(document.importNode(node, true));
        }
      }
    });

  await applicationShellPromise;
}

async function loadApplication() {
  await loadApplicationShell();

  if (window.eventBus) return;

  localStorage.clear();
  sessionStorage.clear();

  const ignoreVerboseApplicationLog = () => undefined;
  console.debug = ignoreVerboseApplicationLog;
  console.info = ignoreVerboseApplicationLog;
  console.log = ignoreVerboseApplicationLog;

  applicationLoadPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/src/dist/bundle.js";
    script.dataset.browserSmokeApp = "true";
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Failed to load the application bundle")),
      { once: true },
    );
    document.head.appendChild(script);
  });

  await applicationLoadPromise;
}

function getApplicationReadiness() {
  const profileSelect = document.getElementById("profileSelect");
  const hasUsableProfile = Array.from(profileSelect?.options || []).some(
    (option) => !option.disabled && Boolean(option.value),
  );

  return {
    eventBus: Boolean(window.eventBus),
    storageService: Boolean(window.storageService),
    applicationServices: Boolean(window.keyBrowserService),
    keyService: Boolean(window.eventBus?.hasListeners("rpc:key:add")),
    title: Boolean(document.title.trim()),
    version: Boolean(document.getElementById("appVersion")?.textContent.trim()),
    profile: hasUsableProfile,
  };
}

function isApplicationReady() {
  return Object.values(getApplicationReadiness()).every(Boolean);
}

async function waitForApplicationReady() {
  const startedAt = Date.now();

  while (!isApplicationReady() && Date.now() - startedAt < READY_TIMEOUT_MS) {
    await new Promise((resolve) =>
      window.setTimeout(resolve, POLL_INTERVAL_MS),
    );
  }

  if (!isApplicationReady()) {
    const missing = Object.entries(getApplicationReadiness())
      .filter(([, ready]) => !ready)
      .map(([name]) => name);

    throw new Error(
      `Application did not become ready within ${READY_TIMEOUT_MS}ms; missing: ${missing.join(", ")}`,
    );
  }
}

beforeEach(async () => {
  await loadApplication();
  await waitForApplicationReady();
});

afterEach(() => {
  document.querySelectorAll(".dropdown.active").forEach((dropdown) => {
    dropdown.classList.remove("active");
  });

  document.querySelectorAll(".modal.active").forEach((modal) => {
    modal.classList.remove("active");
  });

  document.getElementById("modalOverlay")?.classList.remove("active");
  document.body.classList.remove("modal-open");

  document.querySelectorAll(".toast").forEach((toast) => {
    toast.remove();
  });
});
