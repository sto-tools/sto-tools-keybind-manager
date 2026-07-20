function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const writer = (file, propertyPath) => ({ file, path: propertyPath });

export const applicationGlobalAllowlist = deepFreeze({
  STO_DATA: {
    classification: "static-data compatibility",
    purpose: "Legacy aggregate data root used by version and export adapters.",
    consumers: [
      "src/js/main.js",
      "src/js/components/services/ExportService.js",
      "src/js/components/services/ProjectManagementService.js",
    ],
    compatibilityOwner: "data.js",
    removalGate: "All remaining aggregate readers use typed module imports.",
    writers: [writer("src/js/data.js", "STO_DATA")],
  },
  VFX_EFFECTS: {
    classification: "static-data compatibility",
    purpose: "Legacy VFX catalog consumed by the VFX service and view.",
    consumers: [
      "src/js/components/services/VFXManagerService.js",
      "src/js/components/ui/VFXManagerUI.js",
    ],
    compatibilityOwner: "data.js",
    removalGate: "Both VFX consumers import the catalog directly.",
    writers: [writer("src/js/data.js", "VFX_EFFECTS")],
  },
  COMMANDS: {
    classification: "static-data compatibility",
    purpose: "Flattened command lookup retained for legacy validators.",
    consumers: [
      "src/js/components/services/validators/AliasMixedEnvironment.js",
      "src/js/components/services/validators/CommandWarnRule.js",
    ],
    compatibilityOwner: "data.js",
    removalGate: "The remaining validators import typed command projections.",
    writers: [writer("src/js/data.js", "COMMANDS")],
  },
  localizeCommandData: {
    classification: "static-data compatibility",
    purpose: "In-place localization bridge for the shared command catalog.",
    consumers: [
      "src/js/main.js",
      "src/js/components/services/PreferencesService.js",
    ],
    compatibilityOwner: "data.js",
    removalGate:
      "Catalog localization is owned by an injected localization service.",
    writers: [writer("src/js/data.js", "localizeCommandData")],
  },
  i18next: {
    classification: "localization compatibility",
    purpose:
      "Configured localization instance and development translation tracing.",
    consumers: [
      "src/js/data.js",
      "src/js/dev/DevMonitor.js",
      "src/js/lib/STOCommandParser.js",
      "src/js/components/services/validators/CommandWarnRule.js",
    ],
    compatibilityOwner: "main.js",
    removalGate:
      "All localization consumers receive or import the configured instance.",
    writers: [
      writer("src/js/main.js", "i18next"),
      writer("src/js/dev/DevMonitor.js", "i18next.t"),
    ],
  },
  applyTranslations: {
    classification: "localization compatibility",
    purpose:
      "DOM translation bridge, optionally wrapped by development tracing.",
    consumers: [
      "src/js/components/services/ModalManagerService.js",
      "src/js/components/services/PreferencesService.js",
      "src/js/dev/DevMonitor.js",
    ],
    compatibilityOwner: "main.js",
    removalGate: "DOM translation is provided as an injected capability.",
    writers: [
      writer("src/js/main.js", "applyTranslations"),
      writer("src/js/dev/DevMonitor.js", "applyTranslations"),
    ],
  },
  storageService: {
    classification: "bootstrap compatibility",
    purpose:
      "Storage owner bridge for the legacy file explorer and diagnostics.",
    consumers: [
      "src/js/components/ui/FileExplorerUI.js",
      "browser diagnostics",
    ],
    compatibilityOwner: "main.js",
    removalGate:
      "File explorer storage is always injected and diagnostics use protocols.",
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
  stoUI: {
    classification: "bootstrap compatibility",
    purpose:
      "Legacy toast and UI utility facade for remaining fallback consumers.",
    consumers: [
      "src/js/components/services/StorageService.js",
      "src/js/components/services/dataCoordinatorDefaultUi.js",
      "src/js/components/ui/CommandUI.js",
      "src/js/components/ui/FileExplorerUI.js",
      "src/js/components/ui/InterfaceModeUI.js",
    ],
    compatibilityOwner: "main.js",
    removalGate: "Every remaining toast and UI utility consumer is injected.",
    writers: [writer("src/js/main.js", "stoUI")],
  },
  stoSync: {
    classification: "bootstrap compatibility",
    purpose: "Sync-folder selection bridge used by preferences UI.",
    consumers: [
      "src/js/components/ui/PreferencesUI.js",
      "tests/browser/storage-boundary.test.js",
    ],
    compatibilityOwner: "main.js",
    removalGate: "Preferences UI receives the sync capability directly.",
    writers: [writer("src/js/main.js", "stoSync")],
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
  confirmDialog: {
    classification: "UI compatibility",
    purpose: "Shared confirmation capability for remaining fallback consumers.",
    consumers: [
      "src/js/components/services/dataCoordinatorDefaultUi.js",
      "src/js/components/services/syncFolderSelectionOrchestrator.js",
      "src/js/components/ui/AliasBrowserUI.js",
      "src/js/components/ui/BindsetManagerUI.js",
      "src/js/components/ui/BindsetSelectorUI.js",
      "src/js/components/ui/CommandUI.js",
      "src/js/components/ui/HeaderMenuUI.js",
      "src/js/components/ui/ProfileUI.js",
    ],
    compatibilityOwner: "app.js",
    removalGate: "Every confirmation consumer receives the dialog capability.",
    writers: [writer("src/js/app.js", "confirmDialog")],
  },
  commandChainUI: {
    classification: "UI compatibility",
    purpose: "Checked-bundle command-chain inspection surface.",
    consumers: ["browser diagnostics"],
    compatibilityOwner: "app.js",
    removalGate: "Browser probes use typed state and action protocols.",
    writers: [writer("src/js/app.js", "commandChainUI")],
  },
  keyBrowserUI: {
    classification: "UI compatibility",
    purpose: "Checked-bundle key-browser state inspection surface.",
    consumers: ["browser diagnostics"],
    compatibilityOwner: "app.js",
    removalGate: "Browser probes observe typed key-browser state broadcasts.",
    writers: [writer("src/js/app.js", "keyBrowserUI")],
  },
  keyBrowserService: {
    classification: "UI compatibility",
    purpose:
      "Checked-bundle key-browser readiness and protocol inspection surface.",
    consumers: ["tests/browser-setup.js", "browser diagnostics"],
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
