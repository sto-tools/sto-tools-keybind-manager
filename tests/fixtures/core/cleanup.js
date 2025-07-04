// Fixture cleanup system
// Tracks all created fixtures and ensures proper cleanup

const activeFixtures = new Set()
const cleanupFunctions = new Map()

/**
 * Register a fixture for cleanup
 * @param {string} id - Unique identifier for the fixture
 * @param {Function} cleanupFn - Function to call for cleanup
 */
export function registerFixture(id, cleanupFn) {
  activeFixtures.add(id)
  cleanupFunctions.set(id, cleanupFn)
}

/**
 * Unregister a fixture (called by the fixture itself when destroyed)
 * @param {string} id - Unique identifier for the fixture
 */
export function unregisterFixture(id) {
  activeFixtures.delete(id)
  cleanupFunctions.delete(id)
}

/**
 * Clean up all active fixtures
 * Called by the test setup after each test
 */
export function cleanupFixtures() {
  const errors = []
  
  for (const id of activeFixtures) {
    const cleanupFn = cleanupFunctions.get(id)
    if (cleanupFn) {
      try {
        cleanupFn()
      } catch (error) {
        errors.push({ id, error })
      }
    }
  }
  
  // Clear all fixtures
  activeFixtures.clear()
  cleanupFunctions.clear()
  
  // If there were errors, log them but don't throw
  if (errors.length > 0) {
    console.warn('Fixture cleanup errors:', errors)
  }
}

/**
 * Get list of active fixtures (for debugging)
 */
export function getActiveFixtures() {
  return Array.from(activeFixtures)
}

/**
 * Generate a unique fixture ID
 */
export function generateFixtureId(prefix = 'fixture') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
} 