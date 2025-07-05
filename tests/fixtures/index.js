// Main fixtures index
// Exports all fixtures for easy importing

// Core fixtures
export * from './core/index.js'

// Data fixtures  
export * from './data/index.js'

// Service fixtures
export * from './services/index.js'

// Convenience factory functions for common test scenarios

/**
 * Create a basic test environment with essential fixtures
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Collection of fixtures for basic testing
 */
export async function createBasicTestEnvironment(options = {}) {
  const {
    profile = 'basic',
    trackEvents = true,
    autoInit = false
  } = options

  const { createEventBusFixture } = await import('./core/eventBus.js')
  const { createStorageFixture } = await import('./core/storage.js')
  const { createProfileDataFixture } = await import('./data/profiles.js')

  const eventBus = createEventBusFixture({ trackEvents })
  const storage = createStorageFixture()
  const profileData = createProfileDataFixture(profile)

  return {
    eventBus: eventBus.eventBus,
    eventBusFixture: eventBus,
    storage: storage.storageService,
    storageFixture: storage,
    profile: profileData.profile,
    profileFixture: profileData,
    
    // Cleanup all fixtures
    destroy: () => {
      eventBus.destroy()
      storage.destroy()
      profileData.destroy()
    }
  }
}

/**
 * Create an integration test environment with interconnected services
 * @param {Object} options - Configuration options
 * @returns {Object} Collection of fixtures for integration testing
 */
export function createIntegrationTestEnvironment(options = {}) {
  const {
    profiles = ['basic', 'complex'],
    realEventBus = false,
    autoInit = true
  } = options

  // This would be implemented with service fixtures
  // Placeholder for now
  return {
    // Will be implemented with service fixtures
    destroy: () => {}
  }
} 