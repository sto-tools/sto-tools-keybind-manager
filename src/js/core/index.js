// Core Infrastructure Exports for STO Command Parser Library
// Essential building blocks for creating parser integrations

import eventBus from "./eventBus.js";
import { request, respond } from "./requestResponse.js";

export { eventBus, request, respond };
export { default as store } from "./store.js";

// Core constants that external consumers might need
export { APP_VERSION, DISPLAY_VERSION, UNSAFE_KEYBINDS } from "./constants.js";

// Core error types for consistent error handling
export * from "./errors.js";

// Version information for the core infrastructure
export const coreVersion = "1.0.0";
export const coreDescription = "Core infrastructure for STO applications";

// Helper function to create a basic event bus setup
export function createEventBusSetup() {
  return {
    eventBus,
    respond,
    request,
  };
}

// Utility to check if running in browser environment
export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

// Utility to check if running in Node.js environment
export function isNode() {
  const runtime =
    /** @type {typeof globalThis & { process?: { versions?: { node?: string } } }} */ (
      globalThis
    );
  return runtime.process?.versions?.node;
}
