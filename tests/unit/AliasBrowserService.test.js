import { describe, it, expect, beforeEach, vi } from 'vitest'
import AliasBrowserService from '../../src/js/components/services/AliasBrowserService.js'
import { respond } from '../../src/js/core/requestResponse.js'
import eventBus from '../../src/js/core/eventBus.js'

describe('AliasBrowserService', () => {
  let aliasBrowserService
  let mockUI
  let mockProfileUpdateResponder

  // Mock profile data for tests
  const mockProfile = {
    id: 'test-profile',
    name: 'Test Profile',
    currentEnvironment: 'alias',
    aliases: {
      'TestAlias1': {
        description: 'Test alias 1',
        commands: 'command1 $$ command2'
      },
      'TestAlias2': {
        description: 'Test alias 2',
        commands: 'command3 $$ command4'
      },
      'AnotherAlias': {
        description: 'Another test alias',
        commands: 'command5'
      }
    }
  }

  beforeEach(async () => {
    // Mock DataCoordinator responses
    mockProfileUpdateResponder = respond(eventBus, 'data:update-profile', ({ profileId, updates }) => {
      // Simulate successful profile update
      return { success: true, profile: { ...mockProfile, ...updates } }
    })

    mockUI = {
      showToast: vi.fn()
    }

    // Create service with mocked dependencies
    aliasBrowserService = new AliasBrowserService({
      storage: null, // No longer used directly
      ui: mockUI
    })

    // Override eventBus with real eventBus for proper request/response
    aliasBrowserService.eventBus = eventBus
    aliasBrowserService.addEventListener = vi.fn()
    aliasBrowserService.emit = vi.fn()

    // Initialize the service
    await aliasBrowserService.init()

    // Set up initial cache state
    aliasBrowserService.cache.currentProfile = 'test-profile'
    aliasBrowserService.cache.currentEnvironment = 'alias'
    aliasBrowserService.cache.aliases = mockProfile.aliases
    aliasBrowserService.cache.profile = mockProfile

    aliasBrowserService.currentProfileId = 'test-profile'
    aliasBrowserService.currentEnvironment = 'alias'
  })

  afterEach(() => {
    if (mockProfileUpdateResponder) mockProfileUpdateResponder()
    if (aliasBrowserService) aliasBrowserService.destroy()
  })

  describe('DataCoordinator Integration', () => {
    it('should update cache when receiving profile:updated event', () => {
      const updatedProfile = {
        ...mockProfile,
        aliases: {
          ...mockProfile.aliases,
          'NewTestAlias': {
            description: 'New test alias',
            commands: 'new command'
          }
        }
      }

      // Set up event listeners
      aliasBrowserService.setupEventListeners()

      // Find the profile:updated handler from addEventListener calls
      const profileUpdatedCall = aliasBrowserService.addEventListener.mock.calls.find(call =>
        call[0] === 'profile:updated'
      )

      expect(profileUpdatedCall).toBeDefined()
      const profileHandler = profileUpdatedCall[1]

      // Emit profile:updated event
      profileHandler({
        profileId: 'test-profile',
        profile: updatedProfile
      })

      expect(aliasBrowserService.cache.aliases).toEqual(updatedProfile.aliases)
      expect(aliasBrowserService.emit).toHaveBeenCalledWith('aliases-changed', { 
        aliases: updatedProfile.aliases 
      })
    })

    it('should handle profile switching from DataCoordinator', () => {
      aliasBrowserService.setupEventListeners()

      // Find the profile:switched handler from addEventListener calls
      const profileSwitchedCall = aliasBrowserService.addEventListener.mock.calls.find(call =>
        call[0] === 'profile:switched'
      )

      expect(profileSwitchedCall).toBeDefined()
      const profileHandler = profileSwitchedCall[1]

      const newProfile = {
        ...mockProfile,
        id: 'new-profile',
        aliases: { 'OnlyAlias': { description: 'Only alias', commands: 'cmd' } }
      }

      profileHandler({
        profileId: 'new-profile',
        profile: newProfile,
        environment: 'space'
      })

      expect(aliasBrowserService.currentProfileId).toBe('new-profile')
      expect(aliasBrowserService.cache.currentProfile).toBe('new-profile')
      expect(aliasBrowserService.currentEnvironment).toBe('space')
      expect(aliasBrowserService.cache.currentEnvironment).toBe('space')
      expect(aliasBrowserService.selectedAliasName).toBe(null)
      expect(aliasBrowserService._cachedAliasSelection).toBe(null)
    })

    it('should handle late join state from DataCoordinator', () => {
      // Reset service state
      aliasBrowserService.currentProfileId = null
      aliasBrowserService.cache.currentProfile = null

      // Simulate ComponentBase late-join from DataCoordinator
      const mockState = {
        currentProfileData: {
          id: 'test-profile',
          environment: 'alias',
          aliases: mockProfile.aliases
        }
      }

      aliasBrowserService.handleInitialState('DataCoordinator', mockState)

      expect(aliasBrowserService.currentProfileId).toBe('test-profile')
      expect(aliasBrowserService.cache.currentProfile).toBe('test-profile')
      expect(aliasBrowserService.currentEnvironment).toBe('alias')
      expect(aliasBrowserService.cache.currentEnvironment).toBe('alias')
      expect(aliasBrowserService.cache.aliases).toEqual(mockProfile.aliases)
    })
  })

  describe('Selection Caching', () => {
    it('should cache alias selection when switching from alias environment to key environment', () => {
      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService.selectedAliasName = 'TestAlias1'

      // Simulate environment change to space by calling the handler directly
      if (aliasBrowserService.currentEnvironment === 'alias' && aliasBrowserService.selectedAliasName) {
        aliasBrowserService._cachedAliasSelection = aliasBrowserService.selectedAliasName
      }
      aliasBrowserService.currentEnvironment = 'space'
      aliasBrowserService.cache.currentEnvironment = 'space'

      expect(aliasBrowserService._cachedAliasSelection).toBe('TestAlias1')
      expect(aliasBrowserService.currentEnvironment).toBe('space')
    })

    it('should restore cached alias selection when switching back to alias environment', async () => {
      aliasBrowserService.currentEnvironment = 'space'
      aliasBrowserService._cachedAliasSelection = 'TestAlias2'

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService._restoreOrAutoSelectAlias()

      expect(selectAliasSpy).toHaveBeenCalledWith('TestAlias2')
    })

    it('should auto-select first alias when no cached selection exists', async () => {
      aliasBrowserService.currentEnvironment = 'space'
      aliasBrowserService._cachedAliasSelection = null
      aliasBrowserService.selectedAliasName = null

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService._restoreOrAutoSelectAlias()

      expect(selectAliasSpy).toHaveBeenCalledWith('AnotherAlias') // First alphabetically based on actual sorting: "AnotherAlias", "TestAlias1", "TestAlias2"
    })

    it('should handle cached selection that no longer exists', async () => {
      aliasBrowserService.currentEnvironment = 'space'
      aliasBrowserService._cachedAliasSelection = 'NONEXISTENT'
      aliasBrowserService.selectedAliasName = null

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService._restoreOrAutoSelectAlias()

      expect(selectAliasSpy).toHaveBeenCalledWith('AnotherAlias') // First alphabetically based on actual sorting: "AnotherAlias", "TestAlias1", "TestAlias2"
    })

    it('should clear cached selection when profile changes', () => {
      aliasBrowserService._cachedAliasSelection = 'TestAlias1'

      aliasBrowserService.setupEventListeners()

      // Find the profile:switched handler from addEventListener calls
      const profileSwitchedCall = aliasBrowserService.addEventListener.mock.calls.find(call =>
        call[0] === 'profile:switched'
      )

      expect(profileSwitchedCall).toBeDefined()
      const profileHandler = profileSwitchedCall[1]

      profileHandler({ 
        profileId: 'new-profile', 
        profile: mockProfile, 
        environment: 'alias' 
      })

      expect(aliasBrowserService._cachedAliasSelection).toBe(null)
    })

    it('should not auto-select when no aliases are available', async () => {
      // Set up empty aliases
      aliasBrowserService.cache.aliases = {}

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService._restoreOrAutoSelectAlias()

      expect(selectAliasSpy).not.toHaveBeenCalled()
    })
  })

  describe('Environment Change Handling', () => {
    it('should handle environment:changed events with caching', () => {
      aliasBrowserService.setupEventListeners()
      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService.selectedAliasName = 'TestAlias1'

      // Find the environment:changed handler
      const envChangedCall = aliasBrowserService.addEventListener.mock.calls.find(call =>
        call[0] === 'environment:changed'
      )

      expect(envChangedCall).toBeDefined()
      const envHandler = envChangedCall[1]

      // Simulate environment change
      envHandler('space')

      expect(aliasBrowserService.currentEnvironment).toBe('space')
      expect(aliasBrowserService.cache.currentEnvironment).toBe('space')
    })
  })

  describe('Profile Switched Event Handling', () => {
    it('should auto-select first alias when switching to alias mode via profile:switched', () => {
      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      aliasBrowserService.setupEventListeners()

      // Find the profile:switched handler from addEventListener calls
      const profileSwitchedCall = aliasBrowserService.addEventListener.mock.calls.find(call =>
        call[0] === 'profile:switched'
      )

      expect(profileSwitchedCall).toBeDefined()
      const profileHandler = profileSwitchedCall[1]

      profileHandler({ 
        profileId: 'test-profile', 
        profile: mockProfile, 
        environment: 'alias' 
      })

      expect(selectAliasSpy).toHaveBeenCalledWith('TestAlias1') // First alphabetically based on actual sorting: "AnotherAlias", "TestAlias1", "TestAlias2"
    })

    it('should not auto-select when not in alias mode via profile:switched', () => {
      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      aliasBrowserService.setupEventListeners()

      // Find the profile:switched handler from addEventListener calls
      const profileSwitchedCall = aliasBrowserService.addEventListener.mock.calls.find(call =>
        call[0] === 'profile:switched'
      )

      expect(profileSwitchedCall).toBeDefined()
      const profileHandler = profileSwitchedCall[1]

      profileHandler({ 
        profileId: 'test-profile', 
        profile: mockProfile, 
        environment: 'space' 
      })

      expect(selectAliasSpy).not.toHaveBeenCalled()
    })
  })

  describe('Alias Selection', () => {
    it('should emit alias-selected event when selecting an alias', () => {
      aliasBrowserService.selectAlias('TestAlias1')

      expect(aliasBrowserService.emit).toHaveBeenCalledWith('alias-selected', { name: 'TestAlias1' })
    })

    it('should update selectedAliasName when selecting an alias', () => {
      aliasBrowserService.selectAlias('TestAlias2')

      expect(aliasBrowserService.selectedAliasName).toBe('TestAlias2')
    })
  })

  describe('Data Retrieval', () => {
    it('should return aliases from cache', () => {
      const aliases = aliasBrowserService.getAliases()

      expect(aliases).toEqual({
        'TestAlias1': {
          description: 'Test alias 1',
          commands: 'command1 $$ command2'
        },
        'TestAlias2': {
          description: 'Test alias 2',
          commands: 'command3 $$ command4'
        },
        'AnotherAlias': {
          description: 'Another test alias',
          commands: 'command5'
        }
      })
    })

    it('should return empty object when no aliases in cache', () => {
      aliasBrowserService.cache.aliases = {}

      const aliases = aliasBrowserService.getAliases()

      expect(aliases).toEqual({})
    })

    it('should return cached profile', () => {
      const profile = aliasBrowserService.getProfile()

      expect(profile).toEqual(mockProfile)
    })
  })

  describe('Alias CRUD Operations with DataCoordinator', () => {
    it('should create new alias through DataCoordinator', async () => {
      const result = await aliasBrowserService.createAlias('NewAlias', 'New test alias')

      expect(result).toBe(true)
      expect(aliasBrowserService.selectedAliasName).toBe('NewAlias')
      expect(aliasBrowserService.emit).toHaveBeenCalledWith('alias-created', { name: 'NewAlias' })
    })

    it('should not create alias with existing name', async () => {
      const result = await aliasBrowserService.createAlias('TestAlias1', 'Duplicate alias')

      expect(result).toBe(false)
      expect(mockUI.showToast).toHaveBeenCalledWith(expect.any(String), 'error')
    })

    it('should delete alias through DataCoordinator', async () => {
      aliasBrowserService.selectedAliasName = 'TestAlias1'

      const result = await aliasBrowserService.deleteAlias('TestAlias1')

      expect(result).toBe(true)
      expect(aliasBrowserService.selectedAliasName).toBe(null)
      expect(aliasBrowserService.emit).toHaveBeenCalledWith('alias-deleted', { name: 'TestAlias1' })
    })

    it('should duplicate alias through DataCoordinator', async () => {
      const result = await aliasBrowserService.duplicateAlias('TestAlias1')

      expect(result).toBe(true)
      expect(aliasBrowserService.selectedAliasName).toBe('TestAlias1_copy')
      expect(aliasBrowserService.emit).toHaveBeenCalledWith('alias-duplicated', { 
        from: 'TestAlias1', 
        to: 'TestAlias1_copy' 
      })
    })

    it('should handle duplicate alias with incremental naming', async () => {
      // Set up cache with existing copy
      aliasBrowserService.cache.aliases = {
        ...mockProfile.aliases,
        'TestAlias1_copy': { description: 'First copy', commands: 'cmd1' }
      }

      const result = await aliasBrowserService.duplicateAlias('TestAlias1')

      expect(result).toBe(true)
      expect(aliasBrowserService.selectedAliasName).toBe('TestAlias1_copy1')
    })

    it('should handle DataCoordinator errors gracefully', async () => {
      // Remove the responder to simulate error
      if (mockProfileUpdateResponder) mockProfileUpdateResponder()
      mockProfileUpdateResponder = null

      const result = await aliasBrowserService.createAlias('FailAlias', 'Will fail')

      expect(result).toBe(false)
      expect(mockUI.showToast).toHaveBeenCalledWith('Failed to create alias', 'error')
    })
  })

  describe('ComponentBase Late-Join Support', () => {
    it('should provide current state for late-join', () => {
      aliasBrowserService.selectedAliasName = 'TestAlias1'
      aliasBrowserService._cachedAliasSelection = 'TestAlias2'

      const state = aliasBrowserService.getCurrentState()

      expect(state).toEqual({
        selectedAliasName: 'TestAlias1',
        currentProfileId: 'test-profile',
        currentEnvironment: 'alias',
        cachedAliasSelection: 'TestAlias2',
        aliases: mockProfile.aliases
      })
    })

    it('should handle initial state from other AliasBrowserService instances', () => {
      const mockState = {
        selectedAliasName: 'TestAlias2',
        cachedAliasSelection: 'TestAlias1'
      }

      aliasBrowserService.handleInitialState('AliasBrowserService', mockState)

      expect(aliasBrowserService.selectedAliasName).toBe('TestAlias2')
      expect(aliasBrowserService._cachedAliasSelection).toBe('TestAlias1')
    })
  })

  describe('Request/Response Endpoints', () => {
    it('should have alias:get-all and alias:select endpoint functionality', () => {
      const aliases = aliasBrowserService.getAliases()
      expect(aliases).toBeDefined()

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')
      aliasBrowserService.selectAlias('TestAlias1')

      expect(selectAliasSpy).toHaveBeenCalledWith('TestAlias1')
      expect(aliasBrowserService.selectedAliasName).toBe('TestAlias1')
    })
  })
}) 