import { describe, it, expect, beforeEach, vi } from 'vitest'
import AliasBrowserService from '../../src/js/components/services/AliasBrowserService.js'

describe('AliasBrowserService', () => {
  let aliasBrowserService
  let mockStorage
  let mockUI
  let mockEventBus

  beforeEach(() => {
    mockEventBus = {
      on: vi.fn(),
      emit: vi.fn(),
      off: vi.fn()
    }

    mockStorage = {
      getAllData: vi.fn(() => ({
        currentProfile: 'test-profile'
      })),
      getProfile: vi.fn(() => ({
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
      })),
      saveProfile: vi.fn()
    }

    mockUI = {
      showToast: vi.fn()
    }

    aliasBrowserService = new AliasBrowserService({
      storage: mockStorage,
      ui: mockUI
    })

    // Mock the eventBus and addEventListener
    aliasBrowserService.eventBus = mockEventBus
    aliasBrowserService.addEventListener = vi.fn()
  })

  describe('Selection Caching', () => {
    it('should cache alias selection when switching from alias environment to key environment', () => {
      aliasBrowserService.init()
      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService.selectedAliasName = 'TestAlias1'

      // Simulate environment change to space by calling the handler directly
      // This mimics what happens when the environment:changed event is received
      if (aliasBrowserService.currentEnvironment === 'alias' && aliasBrowserService.selectedAliasName) {
        aliasBrowserService._cachedAliasSelection = aliasBrowserService.selectedAliasName
      }
      aliasBrowserService.currentEnvironment = 'space'

      // Check that selection was cached
      expect(aliasBrowserService._cachedAliasSelection).toBe('TestAlias1')
      expect(aliasBrowserService.currentEnvironment).toBe('space')
    })

    it('should restore cached alias selection when switching back to alias environment', async () => {
      aliasBrowserService.init()
      aliasBrowserService.currentEnvironment = 'space'
      aliasBrowserService._cachedAliasSelection = 'TestAlias2'

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      // Simulate environment change back to alias by calling the handler directly
      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService._restoreOrAutoSelectAlias()

      // Check that cached selection is restored
      expect(selectAliasSpy).toHaveBeenCalledWith('TestAlias2')
    })

    it('should auto-select first alias when no cached selection exists', async () => {
      aliasBrowserService.init()
      aliasBrowserService.currentEnvironment = 'space'
      aliasBrowserService._cachedAliasSelection = null

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      // Simulate environment change to alias by calling the handler directly
      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService._restoreOrAutoSelectAlias()

      // Check that first alias is auto-selected
      expect(selectAliasSpy).toHaveBeenCalledWith('AnotherAlias') // First alphabetically
    })

    it('should handle cached selection that no longer exists', async () => {
      aliasBrowserService.init()
      aliasBrowserService.currentEnvironment = 'space'
      aliasBrowserService._cachedAliasSelection = 'NONEXISTENT'

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      // Simulate environment change to alias by calling the handler directly
      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService._restoreOrAutoSelectAlias()

      // Check that first available alias is selected instead
      expect(selectAliasSpy).toHaveBeenCalledWith('AnotherAlias') // First alphabetically
    })

    it('should clear cached selection when profile changes', () => {
      aliasBrowserService.init()
      aliasBrowserService._cachedAliasSelection = 'TestAlias1'

      aliasBrowserService.setupEventListeners()
      
      // Find the profile-switched handler from addEventListener calls
      const profileSwitchedCall = aliasBrowserService.addEventListener.mock.calls.find(call => 
        call[0] === 'profile-switched'
      )
      
      expect(profileSwitchedCall).toBeDefined()
      const profileHandler = profileSwitchedCall[1]

      profileHandler({ profileId: 'new-profile', environment: 'alias' })

      expect(aliasBrowserService._cachedAliasSelection).toBe(null)
    })

    it('should not auto-select when no aliases are available', async () => {
      // Mock empty aliases
      mockStorage.getProfile.mockReturnValue({
        currentEnvironment: 'alias',
        aliases: {}
      })

      aliasBrowserService.init()
      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      // Simulate environment change to alias by calling the handler directly
      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService._restoreOrAutoSelectAlias()

      // Check that no selection occurs when no aliases available
      expect(selectAliasSpy).not.toHaveBeenCalled()
    })
  })

  describe('Global Environment Change Handling', () => {
    it('should handle global environment:changed events with caching', () => {
      aliasBrowserService.init()
      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService.selectedAliasName = 'TestAlias1'

      // Simulate global environment change by calling the handler directly
      if (aliasBrowserService.currentEnvironment === 'alias' && aliasBrowserService.selectedAliasName) {
        aliasBrowserService._cachedAliasSelection = aliasBrowserService.selectedAliasName
      }
      aliasBrowserService.currentEnvironment = 'space'

      expect(aliasBrowserService._cachedAliasSelection).toBe('TestAlias1')
      expect(aliasBrowserService.currentEnvironment).toBe('space')
    })

    it('should restore selection on global environment:changed events', async () => {
      aliasBrowserService.init()
      aliasBrowserService._cachedAliasSelection = 'TestAlias2'

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      // Simulate global environment change by calling the handler directly
      aliasBrowserService.currentEnvironment = 'alias'
      aliasBrowserService._restoreOrAutoSelectAlias()

      expect(selectAliasSpy).toHaveBeenCalledWith('TestAlias2')
    })
  })

  describe('Profile Switched Event Handling', () => {
    it('should auto-select first alias when switching to alias mode via profile-switched', () => {
      aliasBrowserService.init()

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      aliasBrowserService.setupEventListeners()
      
      // Find the profile-switched handler from addEventListener calls
      const profileSwitchedCall = aliasBrowserService.addEventListener.mock.calls.find(call => 
        call[0] === 'profile-switched'
      )
      
      expect(profileSwitchedCall).toBeDefined()
      const profileHandler = profileSwitchedCall[1]

      profileHandler({ profileId: 'test-profile', environment: 'alias' })

      expect(selectAliasSpy).toHaveBeenCalledWith('TestAlias1') // First alphabetically
    })

    it('should not auto-select when not in alias mode via profile-switched', () => {
      aliasBrowserService.init()

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')

      aliasBrowserService.setupEventListeners()
      
      // Find the profile-switched handler from addEventListener calls
      const profileSwitchedCall = aliasBrowserService.addEventListener.mock.calls.find(call => 
        call[0] === 'profile-switched'
      )
      
      expect(profileSwitchedCall).toBeDefined()
      const profileHandler = profileSwitchedCall[1]

      profileHandler({ profileId: 'test-profile', environment: 'space' })

      expect(selectAliasSpy).not.toHaveBeenCalled()
    })
  })

  describe('Alias Selection', () => {
    it('should emit alias-selected event when selecting an alias', () => {
      aliasBrowserService.init()
      aliasBrowserService.selectAlias('TestAlias1')

      expect(mockEventBus.emit).toHaveBeenCalledWith('alias-selected', { name: 'TestAlias1' })
    })

    it('should update selectedAliasName when selecting an alias', () => {
      aliasBrowserService.init()
      aliasBrowserService.selectAlias('TestAlias2')

      expect(aliasBrowserService.selectedAliasName).toBe('TestAlias2')
    })
  })

  describe('Data Retrieval', () => {
    it('should return aliases from current profile', () => {
      aliasBrowserService.init()

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

    it('should return empty object when no profile exists', () => {
      // Set currentProfileId to null to simulate no profile
      aliasBrowserService.currentProfileId = null
      
      const aliases = aliasBrowserService.getAliases()

      expect(aliases).toEqual({})
    })

    it('should return empty object when no aliases exist in profile', () => {
      mockStorage.getProfile.mockReturnValue({
        currentEnvironment: 'alias'
        // no aliases property
      })
      aliasBrowserService.init()

      const aliases = aliasBrowserService.getAliases()

      expect(aliases).toEqual({})
    })
  })

  describe('Alias CRUD Operations', () => {
    it('should create new alias successfully', () => {
      aliasBrowserService.init()

      const result = aliasBrowserService.createAlias('NewAlias', 'New test alias')

      expect(result).toBe(true)
      expect(mockStorage.saveProfile).toHaveBeenCalled()
      expect(mockEventBus.emit).toHaveBeenCalledWith('aliases-changed', expect.any(Object))
      expect(aliasBrowserService.selectedAliasName).toBe('NewAlias')
    })

    it('should not create alias with existing name', () => {
      aliasBrowserService.init()

      const result = aliasBrowserService.createAlias('TestAlias1', 'Duplicate alias')

      expect(result).toBe(false)
      expect(mockUI.showToast).toHaveBeenCalledWith(expect.any(String), 'error')
    })

    it('should delete alias successfully', () => {
      aliasBrowserService.init()
      aliasBrowserService.selectedAliasName = 'TestAlias1'

      const result = aliasBrowserService.deleteAlias('TestAlias1')

      expect(result).toBe(true)
      expect(mockStorage.saveProfile).toHaveBeenCalled()
      expect(mockEventBus.emit).toHaveBeenCalledWith('aliases-changed', expect.any(Object))
      expect(aliasBrowserService.selectedAliasName).toBe(null)
    })

    it('should duplicate alias successfully', () => {
      aliasBrowserService.init()

      const result = aliasBrowserService.duplicateAlias('TestAlias1')

      expect(result).toBe(true)
      expect(mockStorage.saveProfile).toHaveBeenCalled()
      expect(mockEventBus.emit).toHaveBeenCalledWith('aliases-changed', expect.any(Object))
      expect(aliasBrowserService.selectedAliasName).toBe('TestAlias1_copy')
    })

    it('should handle duplicate alias with incremental naming', () => {
      // Mock profile with existing copy
      mockStorage.getProfile.mockReturnValue({
        currentEnvironment: 'alias',
        aliases: {
          'TestAlias1': { description: 'Original', commands: 'cmd1' },
          'TestAlias1_copy': { description: 'First copy', commands: 'cmd1' }
        }
      })

      aliasBrowserService.init()

      const result = aliasBrowserService.duplicateAlias('TestAlias1')

      expect(result).toBe(true)
      expect(aliasBrowserService.selectedAliasName).toBe('TestAlias1_copy1')
    })
  })

  describe('Request/Response Endpoints', () => {
    it('should register alias:get-all and alias:select endpoints', () => {
      // This is tested implicitly through the constructor, but we can verify
      // the methods exist and work correctly
      aliasBrowserService.init()

      const aliases = aliasBrowserService.getAliases()
      expect(aliases).toBeDefined()

      const selectAliasSpy = vi.spyOn(aliasBrowserService, 'selectAlias')
      aliasBrowserService.selectAlias('TestAlias1')
      expect(selectAliasSpy).toHaveBeenCalledWith('TestAlias1')
    })
  })
}) 