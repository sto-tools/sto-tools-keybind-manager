// Core Infrastructure Exports for STO Command Parser Library
// Essential building blocks for creating parser integrations

export { default as eventBus } from './eventBus.js'
export { respond, request, handleCommand, command, makeRequestId } from './requestResponse.js'
export { default as store } from './store.js'

// Core constants that external consumers might need
export { STORAGE_KEYS, ENVIRONMENT_TYPES, THEME_OPTIONS } from './constants.js'

// Core error types for consistent error handling
export * from './errors.js'

// Version information for the core infrastructure
export const coreVersion = '1.0.0'
export const coreDescription = 'Core infrastructure for STO applications'

// Helper function to create a basic event bus setup
export function createEventBusSetup() {
  return {
    eventBus,
    respond,
    request,
    handleCommand,
    command
  }
}

// Utility to check if running in browser environment
export function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

// Utility to check if running in Node.js environment
export function isNode() {
  return typeof process !== 'undefined' && process.versions && process.versions.node
} 