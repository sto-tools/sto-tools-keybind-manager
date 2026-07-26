function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const writer = (file, propertyPath) => ({ file, path: propertyPath });

export const applicationGlobalAllowlist = deepFreeze({
  devMonitor: {
    classification: "development API",
    purpose: "Explicit development and checked-bundle diagnostics API.",
    consumers: [
      "development console",
      "tests/browser-setup.js",
      "tests/fixtures/ui/applicationRuntime.js",
    ],
    compatibilityOwner: "DevMonitor.js",
    removalGate:
      "Retain deliberately or replace with a development-only module entry point.",
    writers: [writer("src/js/dev/DevMonitor.js", "devMonitor")],
  },
});
