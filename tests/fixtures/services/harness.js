// Service fixture harness
// Provides a convenient way to spin-up common service dependencies (eventBus + storage)
// for unit/integration tests while keeping everything fixture-managed.

import { createEventBusFixture } from '../core/eventBus.js'
import { createStorageFixture } from '../core/storage.js'
import { registerFixture, unregisterFixture, generateFixtureId } from '../core/cleanup.js'
import { createFSFixture } from '../core/fs.js'

/**
 * Create a basic service fixture.
 * @param {Object} options – optional overrides
 * @param {Object} options.initialStorageData – seed data for StorageService mock
 * @param {boolean} options.trackEvents – forward to EventBus fixture
 * @param {boolean} options.enableFS – whether to create a file system fixture
 * @param {Object} options.fsSeed – seed data for file system fixture
 */
export function createServiceFixture(options = {}) {
  const {
    initialStorageData = null,
    trackEvents = true,
    enableFS = false,
    fsSeed = null,
  } = options

  const fixtureId = generateFixtureId('service')

  // Underlying fixtures
  const eventBusFixture = createEventBusFixture({ trackEvents })
  const storageFixture  = createStorageFixture({ initialData: initialStorageData })
  const fsFixture       = enableFS ? createFSFixture(fsSeed || {}) : null

  // Aggregate object returned to tests
  const fixture = {
    // Expose raw mock objects
    eventBus: eventBusFixture.eventBus,
    storage: storageFixture.storageService,
    storageService: storageFixture.storageService,
    expectOperation: storageFixture.expectOperation,
    expectOperationCount: storageFixture.expectOperationCount,

    // Sub-fixtures (for advanced inspection)
    eventBusFixture,
    storageFixture,
    fsFixture,

    // Passthrough helpers from eventBusFixture for convenience
    expectEvent: eventBusFixture.expectEvent,
    waitForEvent: eventBusFixture.waitForEvent,
    getEventHistory: eventBusFixture.getEventHistory,

    // Helper destroy to clean up both
    destroy: () => {
      eventBusFixture.destroy()
      storageFixture.destroy()
      fsFixture && fsFixture.destroy()
      unregisterFixture(fixtureId)
    },

    ...(fsFixture ? {
      rootDir: fsFixture.rootHandle,
      fsWriteText: fsFixture.writeText,
      fsReadText: fsFixture.readText,
      fsExists: fsFixture.exists,
    } : {}),
  }

  // Register for global cleanup so tests don't leak mocks
  registerFixture(fixtureId, fixture.destroy)

  return fixture
}

/**
 * Same as createServiceFixture but wires in the REAL singleton eventBus so that
 * multiple production services can communicate exactly as they do in app code.
 * Returns a Promise because the underlying real-bus fixture is async.
 */
export async function createRealServiceFixture(options = {}) {
  const {
    initialStorageData = null,
    trackEvents = true,
    enableFS = false,
    fsSeed = null,
  } = options

  // Use the real singleton eventBus fixture (async)
  const { createRealEventBusFixture } = await import('../core/eventBus.js')
  const eventBusFixture = await createRealEventBusFixture({ trackEvents })

  const storageFixture  = createStorageFixture({ initialData: initialStorageData })
  const fsFixture       = enableFS ? createFSFixture(fsSeed || {}) : null

  const fixtureId = generateFixtureId('real-service')

  const fixture = {
    eventBus: eventBusFixture.eventBus,
    storage: storageFixture.storageService,
    storageService: storageFixture.storageService,

    eventBusFixture,
    storageFixture,
    fsFixture,

    expectEvent: eventBusFixture.expectEvent,
    waitForEvent: eventBusFixture.waitForEvent,
    getEventHistory: eventBusFixture.getEventHistory,
    expectOperation: storageFixture.expectOperation,
    expectOperationCount: storageFixture.expectOperationCount,

    destroy: () => {
      eventBusFixture.destroy()
      storageFixture.destroy()
      fsFixture && fsFixture.destroy()
      unregisterFixture(fixtureId)
    },

    ...(fsFixture ? {
      rootDir: fsFixture.rootHandle,
      fsWriteText: fsFixture.writeText,
      fsReadText: fsFixture.readText,
      fsExists: fsFixture.exists,
    } : {}),
  }

  registerFixture(fixtureId, fixture.destroy)

  return fixture
} 