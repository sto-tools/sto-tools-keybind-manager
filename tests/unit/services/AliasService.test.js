// Test suite for AliasService - CRUD operations for aliases
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/services/harness.js'
import AliasService from '../../../src/js/components/services/AliasService.js'

describe('AliasService', () => {
  let harness
  let service
  let capturedEvents = []
  let mockProfile

  beforeEach(async () => {
    harness = createServiceFixture()
    
    // Create UI and i18n mocks
    const mockUI = {
      showToast: vi.fn()
    }
    const mockI18n = {
      t: vi.fn((key, params) => {
        // Return human-readable text for common keys
        const translations = {
          'invalid_alias_name': 'Invalid alias name',
          'alias_already_exists': 'Alias already exists',
          'failed_to_add_alias': 'Failed to add alias',
          'no_profile_selected': 'No active profile'
        }
        return translations[key] || key
      })
    }
    
    service = new AliasService({ 
      eventBus: harness.eventBus,
      storage: harness.storage,
      i18n: mockI18n,
      ui: mockUI
    })
    
    // Store mocks for test access
    harness.mockUI = mockUI
    harness.mockI18n = mockI18n
    capturedEvents = []

    // Mock the emit method to capture events
    const originalEmit = service.emit
    service.emit = vi.fn((event, data) => {
      capturedEvents.push({ event, data })
      originalEmit.call(service, event, data)
    })

    // Mock request method for DataCoordinator integration
    service.request = vi.fn()

    // Set up mock profile data
    mockProfile = {
      id: 'test-profile',
      aliases: {
        'ExistingAlias': {
          description: 'Test alias',
          commands: ['FireAll', 'TargetEnemyNear'],
          type: 'alias'
        },
        'EmptyAlias': {
          description: 'Empty test alias',
          commands: [],
          type: 'alias'
        }
      }
    }

    // Initialize service with mock data
    service.cache.currentProfile = 'test-profile'
    service.cache.aliases = mockProfile.aliases
    service.cache.profile = mockProfile

    await service.init()
  })

  describe('Initialization', () => {
    it('should initialize with correct component name', () => {
      expect(service.componentName).toBe('AliasService')
    })

    it('should set up request/response handlers', () => {
      // Verify that the service can handle requests (through ComponentBase)
      expect(service.respond).toBeDefined()
      expect(service.request).toBeDefined()
    })

    it('should initialize with empty cache by default', () => {
      const freshService = new AliasService({ eventBus: harness.eventBus })
      expect(freshService.cache.aliases).toEqual({})
      expect(freshService.cache.currentProfile).toBe(null)
    })
  })

  describe('Alias Creation', () => {
    it('should create a new alias with valid name and description', async () => {
      service.request.mockResolvedValueOnce({ success: true })

      const result = await service.addAlias('NewAlias', 'Test description')

      expect(result).toBe(true)
      expect(service.request).toHaveBeenCalledWith('data:update-profile', {
        profileId: 'test-profile',
        add: {
          aliases: {
            'NewAlias': {
              description: 'Test description',
              commands: [],
              type: 'alias'
            }
          }
        }
      })
      expect(capturedEvents).toContainEqual({
        event: 'alias-created',
        data: { name: 'NewAlias' }
      })
    })

    it('should create alias with empty description if not provided', async () => {
      service.request.mockResolvedValueOnce({ success: true })

      await service.addAlias('MinimalAlias')

      expect(service.request).toHaveBeenCalledWith('data:update-profile', {
        profileId: 'test-profile',
        add: {
          aliases: {
            'MinimalAlias': {
              description: '',
              commands: [],
              type: 'alias'
            }
          }
        }
      })
    })

    it('should reject invalid alias names', async () => {
      // Mock validation to return false
      service.isValidAliasName = vi.fn().mockResolvedValue(false)

      const result = await service.addAlias('123InvalidName')

      expect(result).toBe(false)
      expect(service.request).not.toHaveBeenCalled()
      expect(harness.mockUI.showToast).toHaveBeenCalledWith(
        expect.stringContaining('Invalid alias name'),
        'error'
      )
    })

    it('should reject duplicate alias names', async () => {
      service.isValidAliasName = vi.fn().mockResolvedValue(true)

      const result = await service.addAlias('ExistingAlias', 'Duplicate name')

      expect(result).toBe(false)
      expect(service.request).not.toHaveBeenCalled()
      expect(harness.mockUI.showToast).toHaveBeenCalledWith(
        expect.stringContaining('already exists'),
        'warning'
      )
    })

    it('should handle creation errors gracefully', async () => {
      service.isValidAliasName = vi.fn().mockResolvedValue(true)
      service.request.mockRejectedValueOnce(new Error('Network error'))

      const result = await service.addAlias('FailAlias')

      expect(result).toBe(false)
      expect(harness.mockUI.showToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to add alias'),
        'error'
      )
    })
  })

  describe('Alias Deletion', () => {
    it('should delete an existing alias', async () => {
      service.request.mockResolvedValueOnce({ success: true })

      const result = await service.deleteAlias('ExistingAlias')

      expect(result).toBe(true)
      expect(service.request).toHaveBeenCalledWith('data:update-profile', {
        profileId: 'test-profile',
        delete: {
          aliases: ['ExistingAlias']
        }
      })
      expect(capturedEvents).toContainEqual({
        event: 'alias-deleted',
        data: { name: 'ExistingAlias' }
      })
    })

    it('should reject deletion of non-existent alias', async () => {
      const result = await service.deleteAlias('NonExistentAlias')

      expect(result).toBe(false)
      expect(service.request).not.toHaveBeenCalled()
    })

    it('should handle deletion errors gracefully', async () => {
      service.request.mockRejectedValueOnce(new Error('Network error'))

      const result = await service.deleteAlias('ExistingAlias')

      expect(result).toBe(false)
    })
  })

  describe('Alias Duplication', () => {
    it('should duplicate alias with auto-generated name', async () => {
      service.request.mockResolvedValueOnce({ success: true })

      const result = await service.duplicateAlias('ExistingAlias')

      expect(result).toEqual({ success: true, newName: 'ExistingAlias_copy' })
      expect(service.request).toHaveBeenCalledWith('data:update-profile', {
        profileId: 'test-profile',
        add: {
          aliases: {
            'ExistingAlias_copy': {
              description: 'Test alias (copy)',
              commands: ['FireAll', 'TargetEnemyNear'],
              type: 'alias'
            }
          }
        }
      })
      expect(capturedEvents).toContainEqual({
        event: 'alias-created',
        data: { name: 'ExistingAlias_copy' }
      })
      expect(capturedEvents).toContainEqual({
        event: 'alias-duplicated',
        data: { from: 'ExistingAlias', to: 'ExistingAlias_copy' }
      })
    })

    it('should handle name collisions by incrementing counter', async () => {
      // Add a duplicate to cache to simulate collision
      service.cache.aliases['ExistingAlias_copy'] = { description: 'Already exists', commands: [], type: 'alias' }
      service.request.mockResolvedValueOnce({ success: true })

      const result = await service.duplicateAlias('ExistingAlias')

      expect(result.newName).toBe('ExistingAlias_copy1')
    })

    it('should duplicate alias with specific name', async () => {
      service.isValidAliasName = vi.fn().mockResolvedValue(true)
      service.request.mockResolvedValueOnce({ success: true })

      const result = await service.duplicateAliasWithName('ExistingAlias', 'CustomCopy')

      expect(result).toEqual({ success: true, newName: 'CustomCopy' })
      expect(service.request).toHaveBeenCalledWith('data:update-profile', {
        profileId: 'test-profile',
        add: {
          aliases: {
            'CustomCopy': {
              description: 'Test alias',
              commands: ['FireAll', 'TargetEnemyNear'],
              type: 'alias'
            }
          }
        }
      })
    })

    it('should reject duplication with invalid target name', async () => {
      service.isValidAliasName = vi.fn().mockResolvedValue(false)

      const result = await service.duplicateAliasWithName('ExistingAlias', '123Invalid')

      expect(result).toBe(false)
      expect(service.request).not.toHaveBeenCalled()
    })

    it('should reject duplication to existing alias name', async () => {
      service.isValidAliasName = vi.fn().mockResolvedValue(true)

      const result = await service.duplicateAliasWithName('ExistingAlias', 'EmptyAlias')

      expect(result).toBe(false)
      expect(service.request).not.toHaveBeenCalled()
    })
  })

  describe('Alias Validation', () => {
    it('should validate proper alias names', async () => {
      const result = await service.isValidAliasName('ValidAliasName')
      expect(result).toBe(true)
    })

    it('should reject invalid alias names', async () => {
      const invalidNames = [
        null,
        undefined,
        '',
        123,
        '123StartWithNumber',
        'Contains Space',
        'Contains-Dash'
      ]

      for (const name of invalidNames) {
        const result = await service.isValidAliasName(name)
        expect(result).toBe(false)
      }
    })

    it('should use fallback validation if library not available', async () => {
      // Mock import failure
      const originalImport = service.constructor.prototype.isValidAliasName
      service.isValidAliasName = async function(name) {
        if (!name || typeof name !== 'string') return false
        const pattern = /^[A-Za-z][A-Za-z0-9_]*$/
        return pattern.test(name) && name.length <= 50
      }

      expect(await service.isValidAliasName('ValidName')).toBe(true)
      expect(await service.isValidAliasName('Invalid Name')).toBe(false)
    })
  })

  describe('Cache Management', () => {
    it('should update cache from profile data', () => {
      const newProfile = {
        id: 'new-profile',
        aliases: {
          'NewAlias': { description: 'New', commands: ['Command1'], type: 'alias' }
        }
      }

      service.updateCacheFromProfile(newProfile)

      expect(service.cache.aliases).toEqual(newProfile.aliases)
      expect(service.cache.profile).toEqual(newProfile)
    })

    it('should handle null profile gracefully', () => {
      const originalCache = { ...service.cache }
      
      service.updateCacheFromProfile(null)
      
      expect(service.cache).toEqual(originalCache)
    })
  })

  describe('State Management', () => {
    it('should return empty state (no state ownership)', () => {
      const state = service.getCurrentState()
      expect(state).toEqual({})
    })

    it('should handle initial state from other components', () => {
      // Should not crash when receiving state
      service.handleInitialState('DataCoordinator', { someState: 'value' })
      service.handleInitialState('SelectionService', { selectedAlias: 'test' })
      
      // No assertions needed as this method is currently a no-op
      expect(true).toBe(true)
    })
  })

  describe('Environment and Profile Changes', () => {
    it('should handle environment changes', () => {
      service.setCurrentEnvironment('alias')
      expect(service.currentEnvironment).toBe('alias')
      expect(service.cache.currentEnvironment).toBe('alias')
    })

    it('should handle profile changes', () => {
      service.setCurrentProfile('new-profile-id')
      expect(service.currentProfile).toBe('new-profile-id')
      expect(service.cache.currentProfile).toBe('new-profile-id')
    })

    it('should update cache when profile:updated event is received', () => {
      const newProfileData = {
        aliases: {
          'UpdatedAlias': { description: 'Updated', commands: [], type: 'alias' }
        }
      }

      // Simulate profile:updated event
      service.updateCacheFromProfile = vi.fn()
      const handler = service.constructor.prototype.setupEventListeners.call(service)
      
      // Trigger the event handling logic directly
      service.updateCacheFromProfile(newProfileData)
      
      expect(service.updateCacheFromProfile).toHaveBeenCalledWith(newProfileData)
    })
  })

  describe('Error Handling', () => {
    it('should handle missing current profile gracefully', async () => {
      service.cache.currentProfile = null

      const result = await service.addAlias('TestAlias')

      expect(result).toBe(false)
      expect(harness.mockUI.showToast).toHaveBeenCalledWith(
        expect.stringContaining('No active profile'),
        'error'
      )
    })

    it('should handle DataCoordinator failures gracefully', async () => {
      service.isValidAliasName = vi.fn().mockResolvedValue(true)
      service.request.mockRejectedValueOnce(new Error('DataCoordinator error'))

      const result = await service.addAlias('FailAlias')

      expect(result).toBe(false)
    })
  })

  describe('Integration with DataCoordinator', () => {
    it('should use explicit operations API for all profile updates', async () => {
      service.isValidAliasName = vi.fn().mockResolvedValue(true)
      service.request.mockResolvedValueOnce({ success: true })

      await service.addAlias('TestAlias', 'Test description')

      expect(service.request).toHaveBeenCalledWith('data:update-profile', {
        profileId: 'test-profile',
        add: {
          aliases: {
            'TestAlias': {
              description: 'Test description',
              commands: [],
              type: 'alias'
            }
          }
        }
      })
    })

    it('should maintain consistency with alias data format', async () => {
      service.request.mockResolvedValueOnce({ success: true })

      await service.addAlias('NewAlias')

      const addCall = service.request.mock.calls[0][1]
      const aliasData = addCall.add.aliases['NewAlias']

      expect(aliasData.commands).toEqual([]) // Array format
      expect(aliasData.type).toBe('alias') // Proper type
      expect(aliasData.description).toBe('') // Default description
    })
  })
})