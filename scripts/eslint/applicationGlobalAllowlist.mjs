function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const writer = (file, propertyPath) => ({ file, path: propertyPath });

export const applicationGlobalAllowlist = deepFreeze({
  storageService: {
    classification: "bootstrap compatibility",
    purpose: "Checked-bundle storage diagnostics.",
    consumers: ["browser diagnostics"],
    compatibilityOwner: "main.js",
    removalGate: "Browser diagnostics use protocols and native storage.",
    writers: [writer("src/js/main.js", "storageService")],
  },
  dataCoordinator: {
    classification: "bootstrap compatibility",
    purpose:
      "Live state-owner inspection surface for checked-bundle boundary tests.",
    consumers: ["browser diagnostics"],
    compatibilityOwner: "main.js",
    removalGate:
      "Browser boundary probes use typed event and RPC contracts exclusively.",
    writers: [writer("src/js/main.js", "dataCoordinator")],
  },
  eventBus: {
    classification: "bootstrap compatibility",
    purpose: "Checked-bundle protocol access and development diagnostics.",
    consumers: [
      "src/js/lib/commandDisplayAdapter.js",
      "tests/browser-setup.js",
      "tests/browser/*.test.js",
      "development console",
    ],
    compatibilityOwner: "main.js",
    removalGate: "External diagnostics use an explicit development adapter.",
    writers: [writer("src/js/main.js", "eventBus")],
  },
  commandChainUI: {
    classification: "UI compatibility",
    purpose: "Checked-bundle command-chain inspection surface.",
    consumers: ["src/js/app.js", "browser diagnostics"],
    compatibilityOwner: "app.js",
    removalGate: "Browser probes use typed state and action protocols.",
    writers: [writer("src/js/app.js", "commandChainUI")],
  },
  keyBrowserUI: {
    classification: "UI compatibility",
    purpose: "Checked-bundle key-browser state inspection surface.",
    consumers: ["src/js/app.js", "browser diagnostics"],
    compatibilityOwner: "app.js",
    removalGate: "Browser probes observe typed key-browser state broadcasts.",
    writers: [writer("src/js/app.js", "keyBrowserUI")],
  },
  keyBrowserService: {
    classification: "UI compatibility",
    purpose:
      "Checked-bundle key-browser readiness and protocol inspection surface.",
    consumers: [
      "src/js/app.js",
      "tests/browser-setup.js",
      "browser diagnostics",
    ],
    compatibilityOwner: "app.js",
    removalGate: "Application readiness and probes use lifecycle broadcasts.",
    writers: [writer("src/js/app.js", "keyBrowserService")],
  },
  devMonitor: {
    classification: "development API",
    purpose: "Explicit development-console diagnostics API.",
    consumers: ["development console"],
    compatibilityOwner: "DevMonitor.js",
    removalGate:
      "Retain deliberately or replace with a development-only module entry point.",
    writers: [writer("src/js/dev/DevMonitor.js", "devMonitor")],
  },
});
