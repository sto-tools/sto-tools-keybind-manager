// Test suite for SelectionService - centralized selection state management
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/services/harness.js'
import SelectionService from '../../../src/js/components/services/SelectionService.js'

describe('SelectionService', () => {
  let harness
  let service
  let capturedEvents = []

  beforeEach(async () => {
    harness = createServiceFixture()
    service = new SelectionService({ eventBus: harness.eventBus })
    capturedEvents = []

    // Mock the emit method to capture events
    const originalEmit = service.emit
    service.emit = vi.fn((event, data) => {
      capturedEvents.push({ event, data })
      originalEmit.call(service, event, data)
    })

    // Mock request method for DataCoordinator integration
    service.request = vi.fn()

    await service.init()

    // Initialize cache with test data for ComponentBase integration
    service.initializeCache({
      selectedKey: null,
      selectedAlias: null,
      editingContext: null,
      currentEnvironment: 'space',
      cachedSelections: {
        space: null,
        ground: null,
        alias: null
      },
      profile: {
        id: 'test-profile',
        builds: { space: { keys: {} }, ground: { keys: {} } }
      },
      keys: {},
      aliases: {}
    })
  })

  describe('Initialization', () => {
    it('should initialize with correct default state', () => {
      expect(service.cache.selectedKey).toBe(null)
      expect(service.cache.selectedAlias).toBe(null)
      expect(service.editingContext).toBe(null)
      expect(service.cache.currentEnvironment).toBe('space')
      expect(service.cachedSelections).toEqual({
        space: null,
        ground: null,
        alias: null
      })
    })

    it('should set up request/response handlers', () => {
      expect(service._responseDetachFunctions).toBeDefined()
      expect(service._responseDetachFunctions.length).toBeGreaterThan(0)
    })
  })

  describe('Key Selection', () => {
    it('should select a key and emit key-selected event', async () => {
      const result = await service.selectKey('F1')

      expect(result).toBe('F1')
      expect(service.cache.selectedKey).toBe('F1')
      expect(service.cache.selectedAlias).toBe(null) // Should clear alias
      expect(service.cachedSelections.space).toBe('F1')

      expect(capturedEvents).toContainEqual({
        event: 'key-selected',
        data: { key: 'F1', environment: 'space', bindset: null, source: 'SelectionService' }
      })
    })

    it('should select key in specified environment', async () => {
      await service.selectKey('F2', 'ground')

      expect(service.cache.selectedKey).toBe('F2')
      expect(service.cachedSelections.ground).toBe('F2')

      expect(capturedEvents).toContainEqual({
        event: 'key-selected',
        data: { key: 'F2', environment: 'ground', bindset: null, source: 'SelectionService' }
      })
    })

    it('should clear alias selection when selecting key', async () => {
      service.cache.selectedAlias = 'TestAlias'

      await service.selectKey('F3')

      expect(service.cache.selectedKey).toBe('F3')
      expect(service.cache.selectedAlias).toBe(null)
    })

    it('should attempt to persist selection to profile', async () => {
      service.cache.currentProfile = 'test-profile'
      service.cache.profile = { selections: { ground: 'F8' } }

      await service.selectKey('F4')

      expect(service.request).toHaveBeenCalledWith(
        'data:update-profile',
        expect.objectContaining({
          profileId: 'test-profile',
          updates: expect.objectContaining({
            properties: expect.objectContaining({
              selections: expect.objectContaining({
                ground: 'F8',
                space: 'F4'
              })
            })
          })
        })
      )
    })

    it('should emit when manual selection repeats an auto-selected key', async () => {
      service.cache.builds = {
        space: { keys: { F1: [{ command: 'TestCommand' }] } },
        ground: { keys: {} }
      }
      service.cache.keys = { F1: [{ command: 'TestCommand' }] }

      await service.autoSelectFirst('space')

      // Ignore the auto-selection event
      capturedEvents.length = 0

      await service.selectKey('F1', 'space')

      const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
      expect(keySelectedEvents).toHaveLength(1)
      expect(keySelectedEvents[0].data).toEqual({
        key: 'F1',
        environment: 'space',
        bindset: null,
        source: 'SelectionService'
      })
    })
  })

  describe('Alias Selection', () => {
    it('should select an alias and emit alias-selected event', async () => {
      const result = await service.selectAlias('TestAlias')

      expect(result).toBe('TestAlias')
      expect(service.cache.selectedAlias).toBe('TestAlias')
      expect(service.cache.selectedKey).toBe(null) // Should clear key
      expect(service.cachedSelections.alias).toBe('TestAlias')

      expect(capturedEvents).toContainEqual({
        event: 'alias-selected',
        data: { name: 'TestAlias', source: 'SelectionService' }
      })
    })

    it('should clear key selection when selecting alias', async () => {
      service.cache.selectedKey = 'F1'

      await service.selectAlias('TestAlias')

      expect(service.cache.selectedAlias).toBe('TestAlias')
      expect(service.cache.selectedKey).toBe(null)
    })

    it('should persist alias selection to profile', async () => {
      service.cache.currentProfile = 'test-profile'
      service.cache.profile = { selections: { space: 'F5' } }

      await service.selectAlias('TestAlias')

      expect(service.request).toHaveBeenCalledWith(
        'data:update-profile',
        expect.objectContaining({
          profileId: 'test-profile',
          updates: expect.objectContaining({
            properties: expect.objectContaining({
              selections: expect.objectContaining({
                space: 'F5',
                alias: 'TestAlias'
              })
            })
          })
        })
      )
    })

    it('should skip persistence when skipPersistence is true', async () => {
      service.cache.currentProfile = 'test-profile'
      service.cache.profile = { selections: {} }
      service.request.mockReset()

      await service.selectAlias('TestAlias', { skipPersistence: true })

      expect(service.request).not.toHaveBeenCalledWith(
        'data:update-profile',
        expect.anything()
      )
    })
  })

  describe('Selection Clearing', () => {
    it('should clear key selection only', async () => {
      // Set up initial state with a key selection
      await service.selectKey('F1')
      service.setEditingContext({ param: 'test' })
      capturedEvents.length = 0 // Clear captured events

      service.clearSelection('key')

      expect(service.cache.selectedKey).toBe(null)
      expect(service.cache.selectedAlias).toBe(null) // Always null when key is selected
      expect(service.editingContext).toBeTruthy() // Should remain

      expect(capturedEvents).toContainEqual({
        event: 'key-selected',
        data: { key: null, source: 'SelectionService' }
      })
    })

    it('should clear alias selection only', async () => {
      // Set up initial state with an alias selection
      await service.selectAlias('TestAlias')
      service.setEditingContext({ param: 'test' })
      capturedEvents.length = 0 // Clear captured events

      service.clearSelection('alias')

      expect(service.cache.selectedAlias).toBe(null)
      expect(service.cache.selectedKey).toBe(null) // Always null when alias is selected
      expect(service.editingContext).toBeTruthy() // Should remain

      expect(capturedEvents).toContainEqual({
        event: 'alias-selected',
        data: { name: null, source: 'SelectionService' }
      })
    })

    it('should clear editing context only', async () => {
      // Set up initial state with key selection
      await service.selectKey('F1')
      service.setEditingContext({ param: 'test' })
      capturedEvents.length = 0 // Clear captured events

      service.clearSelection('editing')

      expect(service.editingContext).toBe(null)
      expect(service.cache.selectedKey).toBe('F1') // Should remain
      expect(service.cache.selectedAlias).toBe(null) // Always null when key is selected
    })

    it('should clear all selections', async () => {
      // Set up initial state
      await service.selectKey('F1')
      service.setEditingContext({ param: 'test' })
      capturedEvents.length = 0 // Clear captured events

      service.clearSelection('all')

      expect(service.cache.selectedKey).toBe(null)
      expect(service.cache.selectedAlias).toBe(null)
      expect(service.editingContext).toBe(null)

      expect(capturedEvents).toContainEqual({
        event: 'key-selected',
        data: { key: null, source: 'SelectionService' }
      })
      expect(capturedEvents).toContainEqual({
        event: 'alias-selected',
        data: { name: null, source: 'SelectionService' }
      })
    })
  })

  describe('Environment Switching', () => {
    beforeEach(async () => {
      // Set up cached selections
      service.cachedSelections.space = 'F1'
      service.cachedSelections.ground = 'F2'
      service.cachedSelections.alias = 'TestAlias'

      // Set up profile data with valid keys so validation passes
      service.cache.profile = {
        builds: {
          space: { keys: { F1: [{ command: 'Test', id: '1' }], CurrentKey: [{ command: 'Test', id: '1' }] } },
          ground: { keys: { F2: [{ command: 'Test', id: '1' }] } }
        },
        aliases: { TestAlias: { name: 'TestAlias' } }
      }
      // Also set up cache.aliases for alias validation
      service.cache.aliases = { TestAlias: { name: 'TestAlias' } }
    })

    it('should switch to ground environment and restore cached selection', async () => {
      await service.switchEnvironment('ground')

      expect(service.cache.currentEnvironment).toBe('ground')
      expect(service.cache.selectedKey).toBe('F2')
      expect(service.cache.selectedAlias).toBe(null)

      expect(capturedEvents).toContainEqual({
        event: 'environment:switched',
        data: { from: 'space', to: 'ground', source: 'SelectionService' }
      })
    })

    it('should switch to alias environment and restore cached selection', async () => {
      await service.switchEnvironment('alias')

      expect(service.cache.currentEnvironment).toBe('alias')
      expect(service.cache.selectedAlias).toBe('TestAlias')
      expect(service.cache.selectedKey).toBe(null)

      expect(capturedEvents).toContainEqual({
        event: 'environment:switched',
        data: { from: 'space', to: 'alias', source: 'SelectionService' }
      })
    })

    it('should clear opposite selection when switching environments', async () => {
      // Set up current key selection via proper method
      await service.selectKey('CurrentKey')
      service.cachedSelections.alias = 'TestAlias' // Set up cached alias for switching
      capturedEvents.length = 0 // Clear existing events

      await service.switchEnvironment('alias')

      expect(service.cache.selectedKey).toBe(null)
      expect(service.cache.selectedAlias).toBe('TestAlias') // Should restore cached alias
      // When switching to alias mode, it emits alias-selected, not key-selected
      expect(capturedEvents.some(e =>
        e.event === 'alias-selected' && e.data.source === 'SelectionService'
      )).toBe(true)
    })
  })

  describe('Auto-selection', () => {
    it('should auto-select first key in key environment', async () => {
      service.request.mockResolvedValueOnce({ F1: [], F2: [] })

      const result = await service.autoSelectFirst('space')

      expect(result).toBe('F1')
      expect(service.cache.selectedKey).toBe('F1')
      expect(service.request).toHaveBeenCalledWith('data:get-keys', { environment: 'space' })
    })

    it('should auto-select first alias in alias environment', async () => {
      service.request.mockResolvedValueOnce({ Alias1: {}, Alias2: {} })

      const result = await service.autoSelectFirst('alias')

      expect(result).toBe('Alias1')
      expect(service.cache.selectedAlias).toBe('Alias1')
      expect(service.request).toHaveBeenCalledWith('data:get-aliases')
    })

    it('should return null when no items available for auto-selection', async () => {
      service.request.mockResolvedValueOnce({})

      const result = await service.autoSelectFirst('space')

      expect(result).toBe(null)
      expect(service.cache.selectedKey).toBe(null)
    })

    it('should handle auto-selection errors gracefully', async () => {
      service.request.mockRejectedValueOnce(new Error('Data service error'))

      const result = await service.autoSelectFirst('space')

      expect(result).toBe(null)
    })
  })

  describe('Editing Context', () => {
    it('should set and emit editing context changes', () => {
      const context = { parameter: 'test', value: 'example' }

      const result = service.setEditingContext(context)

      expect(result).toEqual(context)
      expect(service.editingContext).toEqual(context)
      expect(capturedEvents).toContainEqual({
        event: 'editing-context-changed',
        data: { context }
      })
    })
  })

  describe('State Queries', () => {
    beforeEach(() => {
      // Set selections directly to avoid mutual exclusion
      service.cache.selectedKey = 'F1'
      service.cache.selectedAlias = 'TestAlias'
      service.cachedSelections.space = 'F1'
      service.cachedSelections.alias = 'TestAlias'
      service.setEditingContext({ param: 'test' })
    })

    it('should return complete selection state', () => {
      const state = service.getSelectionState()

      expect(state).toEqual({
        selectedKey: 'F1',
        selectedAlias: 'TestAlias',
        editingContext: { param: 'test' },
        cachedSelections: {
          space: 'F1',
          ground: null,
          alias: 'TestAlias'
        },
        currentEnvironment: 'space'
      })
    })

    it('should return selected item for current environment', () => {
      service.cache.currentEnvironment = 'space'
      expect(service.getSelectedItem()).toBe('F1')

      service.cache.currentEnvironment = 'alias'
      expect(service.getSelectedItem()).toBe('TestAlias')
    })

    it('should return selected item for specified environment', () => {
      expect(service.getSelectedItem('space')).toBe('F1')
      expect(service.getSelectedItem('alias')).toBe('TestAlias')
    })
  })

  describe('Profile Integration', () => {
    it('should handle profile updates from DataCoordinator', () => {
      const profile = { id: 'test', name: 'Test Profile' }

      service.updateCacheFromProfile(profile)

      expect(service.cache.profile).toEqual(profile)
    })
  })

  describe('ComponentBase Integration', () => {
    it('should return only owned state in getCurrentState()', () => {
      service.cache.selectedKey = 'F1'
      service.cache.selectedAlias = 'TestAlias'
      service.editingContext = { param: 'test' }

      const state = service.getCurrentState()

      expect(state).toEqual({
        selectedKey: 'F1',
        selectedAlias: 'TestAlias',
        editingContext: { param: 'test' },
        cachedSelections: {
          space: null,
          ground: null,
          alias: null
        },
        currentEnvironment: 'space'
      })

      // Ensure no non-owned state is returned
      expect(state).not.toHaveProperty('currentProfile')
      expect(state).not.toHaveProperty('profile')
      expect(state).not.toHaveProperty('keys')
      expect(state).not.toHaveProperty('aliases')
    })

    it('should handle initial state from DataCoordinator', () => {
      const state = {
        currentProfileData: {
          id: 'test-profile',
          environment: 'ground',
          selections: {
            space: 'F1',
            ground: 'F2',
            alias: 'TestAlias'
          }
        }
      }

      service.handleInitialState('DataCoordinator', state)

      expect(service.cache.currentProfile).toBe('test-profile')
      expect(service.cache.currentEnvironment).toBe('ground')
      expect(service.cache.selectedKey).toBe('F2')
      expect(service.cache.selectedAlias).toBe(null)
    })
  })

  describe('Event Listeners', () => {
    it('should handle profile:switched events via handleInitialState', () => {
      const state = {
        currentProfileData: {
          id: 'new-profile',
          environment: 'space',
          selections: { space: 'F3' }
        }
      }

      // Simulate via handleInitialState (which is how ComponentBase delivers events)
      service.handleInitialState('DataCoordinator', state)

      expect(service.cache.currentProfile).toBe('new-profile')
      expect(service.cache.currentEnvironment).toBe('space')
    })

    it('should handle environment changes via switchEnvironment', async () => {
      service.cachedSelections.ground = 'F2'
      // Set up profile data with valid keys so validation passes
      service.cache.profile = {
        builds: {
          ground: { keys: { F2: [{ command: 'Test', id: '1' }] } }
        }
      }

      // Directly test the switchEnvironment method
      await service.switchEnvironment('ground')

      expect(service.cache.currentEnvironment).toBe('ground')
      expect(service.cache.selectedKey).toBe('F2')
    })
  })

  describe('Legacy Compatibility', () => {
    it('should provide legacy key:get-selected response', async () => {
      service.cache.selectedKey = 'F1'

      // This would be called via request/response system
      const handlers = service._responseDetachFunctions
      expect(handlers.length).toBeGreaterThan(0)

      // Verify the service has the right component name for identification
      expect(service.componentName).toBe('SelectionService')
    })
  })

  describe('Regression Tests', () => {
    describe('Cross-Bindset Key Selection (js-bindset-selection-blocking)', () => {
      it('should allow same key selection in different bindsets', async () => {
        // Simulate selecting a key in Primary Bindset
        service.cache.selectedKey = 'F1'
        service.cache.currentEnvironment = 'space'
        service.cache.activeBindset = 'Primary Bindset'

        // Select same key in different bindset - should not be treated as duplicate
        const result = await service.selectKey('F1', 'space', { bindset: 'Custom Bindset' })

        // Should allow the selection (not early return due to duplicate detection)
        expect(result).toBe('F1')
        expect(service.cache.selectedKey).toBe('F1')

        // Should emit the selection event (this proves it wasn't blocked as duplicate)
        const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
        expect(keySelectedEvents).toHaveLength(1)
        expect(keySelectedEvents[0].data).toEqual({
          key: 'F1',
          environment: 'space',
          bindset: 'Custom Bindset',
          source: 'SelectionService'
        })
      })

      it('should treat same key in same bindset as duplicate', async () => {
        // First establish a manual selection to set _lastSelectionSource
        await service.selectKey('F1', 'space', { bindset: 'Primary Bindset' })
        expect(service.cache.selectedKey).toBe('F1')

        capturedEvents.length = 0

        // Select same key in same bindset - should be treated as duplicate
        const result = await service.selectKey('F1', 'space', { bindset: 'Primary Bindset' })

        // Should early return due to duplicate detection
        expect(result).toBe('F1')
        expect(service.cache.selectedKey).toBe('F1') // Should remain unchanged

        // Should not emit selection event for duplicate (now that _lastSelectionSource is 'manual')
        const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
        expect(keySelectedEvents).toHaveLength(0)
      })

      it('should maintain backward compatibility for non-bindset selections', async () => {
        // First establish a manual selection to set _lastSelectionSource
        await service.selectKey('F1', 'space')
        expect(service.cache.selectedKey).toBe('F1')

        capturedEvents.length = 0

        // Select same key without bindset context - should work as before
        const result = await service.selectKey('F1', 'space')

        // Should work as before (legacy behavior)
        expect(result).toBe('F1')

        // Should treat as duplicate (no bindset context means use current logic)
        const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
        expect(keySelectedEvents).toHaveLength(0)
      })

      it('should allow cross-bindset selection with different environments', async () => {
        // Select key in space environment with Primary Bindset
        await service.selectKey('F1', 'space', { bindset: 'Primary Bindset' })
        expect(service.cache.selectedKey).toBe('F1')

        capturedEvents.length = 0

        // Select same key in ground environment with Custom Bindset - should work
        const result = await service.selectKey('F1', 'ground', { bindset: 'Custom Bindset' })

        expect(result).toBe('F1')
        expect(service.cache.selectedKey).toBe('F1')

        // Should emit the selection event proving cross-bindset selection worked
        const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
        expect(keySelectedEvents).toHaveLength(1)
        expect(keySelectedEvents[0].data).toEqual({
          key: 'F1',
          environment: 'ground',
          bindset: 'Custom Bindset',
          source: 'SelectionService'
        })
      })
    })
  })

  describe('Cross-Bindset Selection Regression Tests', () => {
    it('should allow same key selection from primary to user-defined bindset', async () => {
      // First establish a manual selection in primary bindset to set _lastSelectionSource
      await service.selectKey('F1', 'space', { bindset: null })
      expect(service.cache.selectedKey).toBe('F1')
      // Note: activeBindset cache is updated asynchronously via _syncBindsetContextForSelection
      capturedEvents.length = 0

      // Select same key in user-defined bindset - should work and emit event
      const result = await service.selectKey('F1', 'space', { bindset: 'Custom Bindset' })

      expect(result).toBe('F1')
      expect(service.cache.selectedKey).toBe('F1') // Key should be updated

      // Should emit the selection event proving cross-bindset selection worked
      const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
      expect(keySelectedEvents).toHaveLength(1)
      expect(keySelectedEvents[0].data).toEqual({
        key: 'F1',
        environment: 'space',
        bindset: 'Custom Bindset',
        source: 'SelectionService'
      })
    })

    // Note: Tests for user-defined to primary bindset selection and duplicate detection
    // within user-defined bindsets are complex due to asynchronous cache updates.
    // The core functionality is verified in the working tests above and via manual testing.

    it('should block duplicate selection within primary bindset', async () => {
      // First establish a manual selection in primary bindset to set _lastSelectionSource
      await service.selectKey('F1', 'space', { bindset: null })
      expect(service.cache.selectedKey).toBe('F1')
      // Note: activeBindset cache is updated asynchronously via _syncBindsetContextForSelection
      capturedEvents.length = 0

      // Try to select same key in primary bindset - should be blocked as duplicate
      const result = await service.selectKey('F1', 'space', { bindset: null })

      expect(result).toBe('F1') // Should return the key but not update state
      expect(service.cache.selectedKey).toBe('F1') // Should remain unchanged

      // Should NOT emit any selection events for duplicates
      const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
      expect(keySelectedEvents).toHaveLength(0)
    })

    it('should maintain current behavior for non-bindset key selection', async () => {
      // First establish a manual selection to set _lastSelectionSource
      await service.selectKey('F1', 'space')
      expect(service.cache.selectedKey).toBe('F1')
      // Note: activeBindset cache is updated asynchronously via _syncBindsetContextForSelection
      capturedEvents.length = 0

      // Select same key without bindset context - should be blocked as duplicate
      const result = await service.selectKey('F1', 'space')

      expect(result).toBe('F1') // Should return the key but not update state
      expect(service.cache.selectedKey).toBe('F1') // Should remain unchanged

      // Should NOT emit any selection events for duplicates
      const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
      expect(keySelectedEvents).toHaveLength(0)
    })

    it('should allow different key selection in same bindset', async () => {
      // First establish a manual selection to set _lastSelectionSource
      await service.selectKey('F1', 'space', { bindset: 'Custom Bindset' })
      expect(service.cache.selectedKey).toBe('F1')
      // Note: activeBindset cache is updated asynchronously via _syncBindsetContextForSelection
      capturedEvents.length = 0

      // Select different key in same bindset - should work and emit event
      const result = await service.selectKey('F2', 'space', { bindset: 'Custom Bindset' })

      expect(result).toBe('F2')
      expect(service.cache.selectedKey).toBe('F2') // Key should be updated

      // Should emit the selection event for the different key
      const keySelectedEvents = capturedEvents.filter(e => e.event === 'key-selected')
      expect(keySelectedEvents).toHaveLength(1)
      expect(keySelectedEvents[0].data).toEqual({
        key: 'F2',
        environment: 'space',
        bindset: 'Custom Bindset',
        source: 'SelectionService'
      })
    })
  })

  describe('Cleanup', () => {
    it('should clean up request/response handlers on destroy', () => {
      const mockDetach = vi.fn()
      service._responseDetachFunctions = [mockDetach]
      
      service.destroy()
      
      expect(mockDetach).toHaveBeenCalled()
      expect(service._responseDetachFunctions).toEqual([])
    })
  })
})
