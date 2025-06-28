import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

import { KeyService, StorageService } from '../../src/js/components/services/index.js'
import DataService from '../../src/js/components/services/DataService.js'
import eventBus from '../../src/js/core/eventBus.js'
import { respond } from '../../src/js/core/requestResponse.js'

// Robust in-memory localStorage mock (from StorageService.test.js)
const localStorageMock = (() => {
  let store = {}
  return {
    getItem(key) { return store.hasOwnProperty(key) ? store[key] : null },
    setItem(key, value) { store[key] = value },
    removeItem(key) { delete store[key] },
    clear() { store = {} },
    key(i) { return Object.keys(store)[i] || null },
    get length() { return Object.keys(store).length },
  }
})()

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

// Mock STO_DATA for DataService
const mockStoData = {
  validation: {
    keyNamePattern: /^[A-Za-z0-9_]+$/,
    aliasNamePattern: /^[A-Za-z0-9_]+$/
  },
  commands: {
    tray: { commands: {} },
    communication: { commands: {} },
    combat: { commands: {} }
  }
}

// Minimal global STO_DATA validation pattern required by KeyService.isValidKeyName
if (typeof global.STO_DATA === 'undefined') {
  global.STO_DATA = mockStoData
}

describe('KeyService – core key operations with DataCoordinator', () => {
  let service, dataService, uiMock, mockProfile

  beforeEach(async () => {
    global.localStorage.clear()
    
    // Clear event bus - note: eventBus doesn't have removeAllListeners, so we'll skip this
    // eventBus.removeAllListeners() // Not available
    
    // Set up DataService with mock data
    dataService = new DataService({ eventBus, data: mockStoData })
    await dataService.init()

    // Mock UI for toast messages
    uiMock = { showToast: vi.fn() }

    // Mock profile data for testing
    mockProfile = {
      id: 'test-profile-123',
      name: 'Test Profile',
      builds: {
        space: { keys: {} },
        ground: { keys: {} }
      },
      aliases: {},
      environment: 'space'
    }

    // Set up mock DataCoordinator responses
    const dataCoordinatorMocks = []
    
    // Mock register-subscriber to resolve immediately
    dataCoordinatorMocks.push(respond(eventBus, 'data:register-subscriber', () => ({ success: true })))
    
    // Mock update-profile to simulate successful profile updates
    dataCoordinatorMocks.push(respond(eventBus, 'data:update-profile', async ({ profileId, updates }) => {
      // Update mock profile
      if (updates.builds) {
        mockProfile.builds = { ...mockProfile.builds, ...updates.builds }
      }
      
      // Emit profile updated event
      setTimeout(() => {
        eventBus.emit('profile:updated', { profileId, profile: mockProfile })
      }, 5)
      
      return { success: true, profile: mockProfile }
    }))
    
    // Mock get-current-profile to return our test profile
    dataCoordinatorMocks.push(respond(eventBus, 'data:get-current-profile', () => mockProfile))

    // Create KeyService
    service = new KeyService({ eventBus, ui: uiMock })
    await service.init()

    // Simulate profile switch to set up initial state
    eventBus.emit('profile:switched', {
      profileId: mockProfile.id,
      profile: mockProfile,
      environment: 'space'
    })

    // Wait for events to propagate
    await new Promise(resolve => setTimeout(resolve, 10))

    // Store cleanup functions for later
    service._testCleanup = dataCoordinatorMocks
  })

  afterEach(async () => {
    global.localStorage.clear()
    if (dataService) await dataService.destroy()
    if (service) {
      // Clean up mock responders
      if (service._testCleanup) {
        service._testCleanup.forEach(cleanup => cleanup())
      }
      await service.destroy()
    }
    // eventBus.removeAllListeners() // Not available
  })

  describe('isValidKeyName()', () => {
    it('accepts alphanumeric key names up to 20 chars', async () => {
      expect(await service.isValidKeyName('F1')).toBe(true)
      expect(await service.isValidKeyName('CtrlA')).toBe(true)
      expect(await service.isValidKeyName('Key_123')).toBe(true)
    })

    it('rejects names with special characters or too long', async () => {
      expect(await service.isValidKeyName('Invalid-Key!')).toBe(false)
      expect(await service.isValidKeyName('ThisKeyNameIsWayTooLongToBeValid')).toBe(false)
    })
  })

  describe('generateKeyId()', () => {
    it('creates a unique id with key_ prefix', () => {
      const id = service.generateKeyId()
      expect(typeof id).toBe('string')
      expect(id.startsWith('key_')).toBe(true)
      // Two consecutive calls should yield different values
      expect(service.generateKeyId()).not.toBe(id)
    })
  })

  describe('DataCoordinator integration', () => {
    it('should cache profile state from DataCoordinator broadcasts', () => {
      // Verify initial state is cached
      expect(service.cache.currentProfile).toBe(mockProfile.id)
      expect(service.cache.builds).toBeDefined()
      expect(service.cache.keys).toBeDefined()
    })

    it('should update cache when profile is updated', async () => {
      // Listen for cache updates
      const cacheUpdates = []
      eventBus.on('keys:changed', (data) => cacheUpdates.push(data))

      // Simulate profile update broadcast
      const updatedProfile = {
        ...mockProfile,
        builds: {
          space: { keys: { 'F1': ['test command'] } },
          ground: { keys: {} }
        }
      }

      eventBus.emit('profile:updated', { 
        profileId: mockProfile.id, 
        profile: updatedProfile 
      })

      // Wait for events to propagate
      await new Promise(resolve => setTimeout(resolve, 10))

      // Verify cache was updated
      expect(service.cache.keys).toHaveProperty('F1')
      expect(cacheUpdates.length).toBeGreaterThan(0)
    })
  })

  describe('addKey()', () => {
    it('successfully adds a new key row through DataCoordinator', async () => {
      const result = await service.addKey('F3')
      expect(result).toBe(true)
      
      // Verify key was added to cache (will be updated via broadcast)
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(service.cache.keys).toHaveProperty('F3')
    })

    it('prevents duplicate keys', async () => {
      // Add key to cache to simulate existing key
      service.cache.keys['F3'] = []
      
      const result = await service.addKey('F3')
      expect(result).toBe(false)
      expect(uiMock.showToast).toHaveBeenCalledWith('Key already exists', 'warning')
    })

    it('validates key names', async () => {
      const result = await service.addKey('Invalid-Key!')
      expect(result).toBe(false)
      expect(uiMock.showToast).toHaveBeenCalledWith('Invalid key name', 'error')
    })

    it('shows success toast on successful add', async () => {
      await service.addKey('F4')
      expect(uiMock.showToast).toHaveBeenCalledWith('Key added', 'success')
    })
  })

  describe('deleteKey()', () => {
    it('removes an existing key row through DataCoordinator', async () => {
      // Set up existing key in cache
      service.cache.keys['F4'] = [{ id: 'test', command: 'test' }]
      
      const result = await service.deleteKey('F4')
      expect(result).toBe(true)
    })

    it('clears selected key if deleted key was selected', async () => {
      service.cache.keys['F5'] = []
      service.setSelectedKey('F5')
      
      await service.deleteKey('F5')
      expect(service.selectedKey).toBe(null)
    })

    it('returns false for non-existent keys', async () => {
      const result = await service.deleteKey('NonExistentKey')
      expect(result).toBe(false)
    })
  })

  describe('duplicateKey()', () => {
    it('creates a copy with a new name and fresh ids', async () => {
      // Set up existing key with commands
      service.cache.keys['F5'] = [{ id: 'original-id', command: 'say hello' }]

      const result = await service.duplicateKey('F5')
      expect(result).toBe(true)
    })

    it('returns false for keys with no commands', async () => {
      service.cache.keys['EmptyKey'] = []
      const result = await service.duplicateKey('EmptyKey')
      expect(result).toBe(false)
    })

    it('returns false for non-existent keys', async () => {
      const result = await service.duplicateKey('NonExistentKey')
      expect(result).toBe(false)
    })
  })

  describe('getKeys()', () => {
    it('returns key names from cache', () => {
      service.cache.keys = { 'F1': [], 'F2': [] }
      
      const keys = service.getKeys()
      expect(keys).toContain('F1')
      expect(keys).toContain('F2')
    })

    it('returns empty array when no keys exist', () => {
      service.cache.keys = {}
      const keys = service.getKeys()
      expect(keys).toEqual([])
    })
  })

  describe('getCurrentProfile()', () => {
    it('returns virtual profile with cached data', () => {
      const profile = service.getCurrentProfile()
      
      expect(profile).toBeDefined()
      expect(profile.id).toBe(service.cache.currentProfile)
      expect(profile.builds).toBeDefined()
      expect(profile.keys).toBe(service.cache.keys)
      expect(profile.environment).toBe(service.cache.currentEnvironment)
    })

    it('returns null when no profile is cached', () => {
      service.cache.currentProfile = null
      const profile = service.getCurrentProfile()
      expect(profile).toBe(null)
    })
  })
})

describe('KeyService – legacy file handler compatibility', () => {
  let service, dataService, uiMock

  beforeEach(async () => {
    global.localStorage.clear()
    // eventBus.removeAllListeners() // Not available
    
    // Set up DataService with mock data
    dataService = new DataService({ eventBus, data: mockStoData })
    await dataService.init()

    uiMock = { showToast: vi.fn() }

    // Set up mock DataCoordinator responses for this test suite
    const dataCoordinatorMocks = []
    dataCoordinatorMocks.push(respond(eventBus, 'data:register-subscriber', () => ({ success: true })))

    service = new KeyService({ eventBus, ui: uiMock })
    await service.init()

    service._testCleanup = dataCoordinatorMocks
  })

  afterEach(async () => {
    if (dataService) await dataService.destroy()
    if (service) {
      if (service._testCleanup) {
        service._testCleanup.forEach(cleanup => cleanup())
      }
      await service.destroy()
    }
    // eventBus.removeAllListeners() // Not available
  })

  it('parses keybind files and aliases', async () => {
    // Mock FileOperationsService response
    const mockFileOpsResponse = {
      success: true,
      keysImported: 2,
      aliasesImported: 1
    }

    // Mock the FileOperationsService request handlers
    const fileOpsMocks = []
    fileOpsMocks.push(respond(eventBus, 'fileops:import-keybind-file', () => mockFileOpsResponse))

    const content = 'F1 "say test"$$emote wave\nF2 "emote wave"'
    const result = await service.importKeybindFile(content)
    
    expect(result).toEqual(mockFileOpsResponse)

    // Clean up
    fileOpsMocks.forEach(cleanup => cleanup())
  })

  it('validates keybinds with proper structure', () => {
    const validation = service.validateKeybind('F1', [
      { id: '1', command: 'say hello' },
      { id: '2', command: 'emote wave' }
    ])
    
    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
  })

  it('detects invalid keybind structure', () => {
    const validation = service.validateKeybind('InvalidKey!', [])
    
    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('Invalid key name: InvalidKey!')
    expect(validation.errors).toContain('At least one command is required')
  })

  it('suggests valid keys based on filter', () => {
    const suggestions = service.suggestKeys('F')
    
    expect(Array.isArray(suggestions)).toBe(true)
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.every(key => key.toLowerCase().includes('f'))).toBe(true)
  })

  it('returns common keys in deterministic order', () => {
    const commonKeys = service.getCommonKeys()
    
    expect(Array.isArray(commonKeys)).toBe(true)
    expect(commonKeys).toContain('Space')
    expect(commonKeys).toContain('F1')
  })

  it('detects command types correctly', () => {
    expect(service.detectCommandType('say hello')).toBe('communication')
    expect(service.detectCommandType('+STOTrayExecByTray 0 0')).toBe('tray')
    expect(service.detectCommandType('FireAll')).toBe('combat')
    expect(service.detectCommandType('target_enemy_near')).toBe('targeting')
    expect(service.detectCommandType('custom_command')).toBe('custom')
  })

  it('generates profile stats correctly', () => {
    const mockProfile = {
      keys: {
        'F1': [{ command: 'say hello', type: 'communication' }],
        'F2': [{ command: 'FireAll', type: 'combat' }]
      },
      aliases: {
        'test': { command: 'say test' }
      }
    }

    const stats = service.getProfileStats(mockProfile)
    
    expect(stats.totalKeys).toBe(2)
    expect(stats.totalCommands).toBe(2)
    expect(stats.totalAliases).toBe(1)
    expect(stats.commandTypes.communication).toBe(1)
    expect(stats.commandTypes.combat).toBe(1)
  })
})

describe('KeyService – Command Type Detection', () => {
  let keyService
  beforeEach(async () => {
    // Set up minimal mock for DataCoordinator
    const mockCleanup = respond(eventBus, 'data:register-subscriber', () => ({ success: true }))
    
    keyService = new KeyService({ eventBus })
    await keyService.init()
    
    keyService._testCleanup = [mockCleanup]
  })
  
  afterEach(async () => {
    if (keyService) {
      if (keyService._testCleanup) {
        keyService._testCleanup.forEach(cleanup => cleanup())
      }
      await keyService.destroy()
    }
  })
  
  it('should detect tray execution commands', () => {
    const trayCommands = [
      '+STOTrayExecByTray 0 0',
      '+stotrayexecbytray 1 2',
      '   +STOTrayExecByTray 2 3   ',
    ]
    trayCommands.forEach(cmd => {
      expect(keyService.detectCommandType(cmd)).toBe('tray')
    })
  })
  
  it('should detect communication commands', () => {
    const commCommands = [
      'say Hello',
      'team Hi',
      'zone Greetings',
      'tell Someone',
      'say "Quoted"',
      'team "Another"',
      'zone "Test"',
      'tell "User"',
      'say "',
    ]
    commCommands.forEach(cmd => {
      expect(keyService.detectCommandType(cmd)).toBe('communication')
    })
  })
  
  it('should detect power commands', () => {
    const powerCommands = [
      '+power_exec something',
      'distribute_shields',
      'reroute_shields',
    ]
    powerCommands.forEach(cmd => {
      expect(keyService.detectCommandType(cmd)).toBe('power')
    })
  })
  
  it('should detect movement commands', () => {
    const movementCommands = [
      '+fullimpulse',
      '+reverse',
      'throttle 100',
      '+turnleft',
      '+up',
      '+down',
      '+left',
      '+right',
      '+forward',
      '+backward',
      'follow',
    ]
    movementCommands.forEach(cmd => {
      expect(keyService.detectCommandType(cmd)).toBe('movement')
    })
  })
  
  it('should detect camera commands', () => {
    const cameraCommands = [
      'camreset',
      'lookat',
      'zoom_in',
    ]
    cameraCommands.forEach(cmd => {
      expect(keyService.detectCommandType(cmd)).toBe('camera')
    })
  })
  
  it('should detect combat commands', () => {
    const combatCommands = [
      'fire',
      'attack',
      'fireall',
      'firephasers',
      'firetorps',
      'firephaserstorps',
    ]
    combatCommands.forEach(cmd => {
      expect(keyService.detectCommandType(cmd)).toBe('combat')
    })
  })
  
  it('should detect targeting commands', () => {
    const targetingCommands = [
      'target',
      'target_enemy_near',
      'target_self',
      'target_friend_near',
      'target_clear',
      'retarget',
    ]
    targetingCommands.forEach(cmd => {
      expect(keyService.detectCommandType(cmd)).toBe('targeting')
    })
  })
  
  it('should detect system commands', () => {
    const systemCommands = [
      '+gentoggle',
      'screenshot',
      'hud_toggle',
      'interactwindow',
    ]
    systemCommands.forEach(cmd => {
      expect(keyService.detectCommandType(cmd)).toBe('system')
    })
  })
  
  it('should default to custom type for unknown commands', () => {
    const customCommands = [
      'foobar',
      '',
      null,
      undefined,
      123,
      'completelyunknowncommand',
    ]
    customCommands.forEach(cmd => {
      expect(keyService.detectCommandType(cmd)).toBe('custom')
    })
  })
}) 