// Test file to verify keyHandling methods work when called directly
import { keyHandling } from './src/js/keyHandling.js'

// Mock the global app instance
global.app = {
  currentProfile: 'test-profile',
  currentEnvironment: 'space',
  selectedKey: 'F1',
  getCurrentProfile: () => ({ keys: { F1: [] } }),
  setModified: () => {},
  renderKeyGrid: () => {},
  renderCommandChain: () => {},
  updateChainActions: () => {},
  generateCommandId: () => 'test-id',
  saveCurrentBuild: () => {},
  renderAliasGrid: () => {},
  isValidKeyName: (name) => name.length > 0
}

// Mock global dependencies
global.stoStorage = {
  getProfile: () => ({
    builds: {
      space: { keys: { F1: [] } },
      ground: { keys: {} }
    }
  }),
  saveProfile: () => true
}

global.stoUI = {
  showToast: () => {},
  confirm: () => Promise.resolve(true)
}

global.i18next = {
  t: (key) => key
}

global.STO_DATA = {
  validation: {
    keyNamePattern: /^[A-Za-z0-9_]+$/
  }
}

global.stoKeybinds = {
  validateKeybind: () => ({ valid: true, errors: [] })
}

global.eventBus = {
  emit: () => {}
}

console.log('Testing keyHandling methods when called directly...')

try {
  // Test that methods can be called directly without throwing errors
  console.log('Testing selectKey...')
  keyHandling.selectKey('F2')
  console.log('✓ selectKey works when called directly')
  
  console.log('Testing addKey...')
  const result = keyHandling.addKey('F3')
  console.log('✓ addKey works when called directly, returned:', result)
  
  console.log('Testing generateCommandId...')
  const id = keyHandling.generateCommandId()
  console.log('✓ generateCommandId works when called directly, returned:', id)
  
  console.log('All tests passed! The this binding issue has been fixed.')
} catch (error) {
  console.error('Test failed:', error.message)
  process.exit(1)
} 