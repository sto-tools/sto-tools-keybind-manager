import { beforeEach, describe, expect, it, vi } from 'vitest'
import STOToolsKeybindManager from '../../src/js/app.js'
import { StorageService } from '../../src/js/components/services/index.js'
import eventBus from '../../src/js/core/eventBus.js'
import i18next from 'i18next'
import en from '../../src/i18n/en.json'

// Mock global dependencies
global.storageService = null
global.stoUI = {
  showToast: vi.fn(),
  updateUI: vi.fn()
}
global.modalManager = {
  showModal: vi.fn(),
  closeModal: vi.fn(),
  show: vi.fn()
}
global.i18next = i18next

describe('Environment Initialization Bug', () => {
  let app
  let storageService
  let mockProfileData

  beforeEach(async () => {
    // Note: We can't easily reset the eventBus, so we'll work with existing listeners
    
    // Initialize i18next
    await i18next.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: { translation: en }
      }
    })

    // Create mock profile data with alias environment cached
    mockProfileData = {
      currentProfile: 'test-profile',
      profiles: {
        'test-profile': {
          name: 'Test Profile',
          description: 'Test profile for bug reproduction',
          currentEnvironment: 'alias', // This is the cached environment
          builds: {
            space: { keys: { F1: [{ command: 'say hello', type: 'communication' }] } },
            ground: { keys: { F2: [{ command: 'say world', type: 'communication' }] } }
          },
          aliases: {
            TestAlias: {
              description: 'Test alias',
              commands: 'say test $$ say alias'
            }
          }
        }
      }
    }

    // Create storage service with mock data
    storageService = new StorageService({ eventBus })
    storageService.init()
    
    // Override getAllData to return our mock data
    vi.spyOn(storageService, 'getAllData').mockReturnValue(mockProfileData)
    vi.spyOn(storageService, 'getProfile').mockImplementation((id) => mockProfileData.profiles[id])
    vi.spyOn(storageService, 'saveProfile').mockImplementation(() => true)
    vi.spyOn(storageService, 'saveAllData').mockImplementation(() => true)

    // Set global reference
    global.storageService = storageService

    // Mock localStorage to prevent welcome message
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === 'sto_keybind_manager_visited') return 'true'
      return null
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})

    // Create app instance
    app = new STOToolsKeybindManager()
  })

  it('should display AliasBrowserUI and hide KeyBrowserUI when cached environment is alias', async () => {
    // Mock DOM elements
    const mockAliasContainer = document.createElement('div')
    mockAliasContainer.id = 'aliasSelectorContainer'
    mockAliasContainer.style.display = 'none' // Initially hidden
    
    const mockKeyContainer = document.createElement('div')
    mockKeyContainer.className = 'key-selector-container'
    mockKeyContainer.style.display = '' // Initially visible
    
    const mockAliasGrid = document.createElement('div')
    mockAliasGrid.id = 'aliasGrid'
    mockAliasContainer.appendChild(mockAliasGrid)
    
    const mockKeyGrid = document.createElement('div')
    mockKeyGrid.id = 'keyGrid'
    mockKeyContainer.appendChild(mockKeyGrid)
    
    document.body.appendChild(mockAliasContainer)
    document.body.appendChild(mockKeyContainer)

    // Initialize the app
    await app.init()

    // Wait for all initialization to complete
    await new Promise(resolve => {
      const handler = () => resolve()
      eventBus.on('sto-app-ready', handler)
      setTimeout(() => {
        eventBus.off('sto-app-ready', handler)
        resolve()
      }, 100)
    })

    // Check that the environment was loaded correctly
    expect(app.currentEnvironment).toBe('alias')
    expect(app.profileService.getCurrentEnvironment()).toBe('alias')

    // Check that UI components have the correct visibility
    // AliasBrowserUI should be visible when environment is 'alias'
    expect(mockAliasContainer.style.display).toBe('')
    
    // KeyBrowserUI should be hidden when environment is 'alias'  
    expect(mockKeyContainer.style.display).toBe('none')

    // Clean up
    document.body.removeChild(mockAliasContainer)
    document.body.removeChild(mockKeyContainer)
  })

  it('should properly initialize services with the cached environment', async () => {
    await app.init()

    // Wait for initialization to complete
    await new Promise(resolve => {
      const handler = () => resolve()
      eventBus.on('sto-app-ready', handler)
      setTimeout(() => {
        eventBus.off('sto-app-ready', handler)
        resolve()
      }, 100)
    })

    // Check that services have the correct environment
    expect(app.keyBrowserService.currentEnvironment).toBe('alias')
    expect(app.commandService.currentEnvironment).toBe('alias')
    expect(app.commandLibraryService.currentEnvironment).toBe('alias')
    expect(app.interfaceModeService.currentEnvironment).toBe('alias')
  })

  it('should have InterfaceModeService with correct environment after initialization', async () => {
    await app.init()

    // Wait for initialization to complete
    await new Promise(resolve => {
      const handler = () => resolve()
      eventBus.on('sto-app-ready', handler)
      setTimeout(() => {
        eventBus.off('sto-app-ready', handler)
        resolve()
      }, 100)
    })

    // Check that the InterfaceModeService has the correct environment
    expect(app.interfaceModeService.currentEnvironment).toBe('alias')
    expect(app.interfaceModeService.getCurrentMode()).toBe('alias')
  })
}) 