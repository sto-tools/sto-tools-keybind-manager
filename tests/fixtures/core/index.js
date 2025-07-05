// Core fixtures index
// Exports all core infrastructure fixtures

export {
  registerFixture,
  unregisterFixture,
  cleanupFixtures,
  getActiveFixtures,
  generateFixtureId
} from './cleanup.js'

export {
  createEventBusFixture,
  createRealEventBusFixture
} from './eventBus.js'

export {
  createComponentFixture,
  createMockComponent
} from './component.js'

export {
  createStorageFixture,
  createRealLocalStorageFixture,
  createLocalStorageFixture
} from './storage.js'

export {
  createRequestResponseFixture,
  createRealRequestResponseFixture
} from './requestResponse.js'

export { createFSFixture } from './fs.js' 