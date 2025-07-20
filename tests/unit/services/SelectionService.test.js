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
  })

  describe('Initialization', () => {
    it('should initialize with correct default state', () => {
      expect(service.selectedKey).toBe(null)
      expect(service.selectedAlias).toBe(null)
      expect(service.editingContext).toBe(null)
      expect(service.currentEnvironment).toBe('space')
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
      expect(service.selectedKey).toBe('F1')
      expect(service.selectedAlias).toBe(null) // Should clear alias
      expect(service.cachedSelections.space).toBe('F1')
      
      expect(capturedEvents).toContainEqual({
        event: 'key-selected',
        data: { key: 'F1', environment: 'space', source: 'SelectionService' }
      })
    })

    it('should select key in specified environment', async () => {
      await service.selectKey('F2', 'ground')
      
      expect(service.selectedKey).toBe('F2')
      expect(service.cachedSelections.ground).toBe('F2')
      
      expect(capturedEvents).toContainEqual({
        event: 'key-selected',
        data: { key: 'F2', environment: 'ground', source: 'SelectionService' }
      })
    })

    it('should clear alias selection when selecting key', async () => {
      service.selectedAlias = 'TestAlias'
      
      await service.selectKey('F3')
      
      expect(service.selectedKey).toBe('F3')
      expect(service.selectedAlias).toBe(null)
    })

    it('should attempt to persist selection to profile', async () => {
      service.cache.currentProfile = 'test-profile'
      service.cache.profile = { selections: { ground: 'F8' } }
      
      await service.selectKey('F4')
      
      expect(service.request).toHaveBeenCalledWith('data:update-profile', {
        profileId: 'test-profile',
        properties: {
          selections: {
            ground: 'F8',
            space: 'F4'
          }
        }
      })
    })
  })

  describe('Alias Selection', () => {
    it('should select an alias and emit alias-selected event', async () => {
      const result = await service.selectAlias('TestAlias')
      
      expect(result).toBe('TestAlias')
      expect(service.selectedAlias).toBe('TestAlias')
      expect(service.selectedKey).toBe(null) // Should clear key
      expect(service.cachedSelections.alias).toBe('TestAlias')
      
      expect(capturedEvents).toContainEqual({
        event: 'alias-selected',
        data: { name: 'TestAlias', source: 'SelectionService' }
      })
    })

    it('should clear key selection when selecting alias', async () => {
      service.selectedKey = 'F1'
      
      await service.selectAlias('TestAlias')
      
      expect(service.selectedAlias).toBe('TestAlias')
      expect(service.selectedKey).toBe(null)
    })

    it('should persist alias selection to profile', async () => {
      service.cache.currentProfile = 'test-profile'
      service.cache.profile = { selections: { space: 'F5' } }
      
      await service.selectAlias('TestAlias')
      
      expect(service.request).toHaveBeenCalledWith('data:update-profile', {
        profileId: 'test-profile',
        properties: {
          selections: {
            space: 'F5',
            alias: 'TestAlias'
          }
        }
      })
    })
  })

  describe('Selection Clearing', () => {
    beforeEach(() => {
      // Set up some initial selections directly (avoiding mutual exclusion)
      service.selectedKey = 'F1'
      service.selectedAlias = 'TestAlias'
      service.setEditingContext({ param: 'test' })
      capturedEvents.length = 0 // Clear captured events
    })

    it('should clear key selection only', () => {
      service.clearSelection('key')
      
      expect(service.selectedKey).toBe(null)
      expect(service.selectedAlias).toBe('TestAlias') // Should remain
      expect(service.editingContext).toBeTruthy() // Should remain
      
      expect(capturedEvents).toContainEqual({
        event: 'key-selected',
        data: { key: null, source: 'SelectionService' }
      })
    })

    it('should clear alias selection only', () => {
      service.clearSelection('alias')
      
      expect(service.selectedAlias).toBe(null)
      expect(service.selectedKey).toBe('F1') // Should remain
      expect(service.editingContext).toBeTruthy() // Should remain
      
      expect(capturedEvents).toContainEqual({
        event: 'alias-selected',
        data: { name: null, source: 'SelectionService' }
      })
    })

    it('should clear editing context only', () => {
      service.clearSelection('editing')
      
      expect(service.editingContext).toBe(null)
      expect(service.selectedKey).toBe('F1') // Should remain
      expect(service.selectedAlias).toBe('TestAlias') // Should remain
    })

    it('should clear all selections', () => {
      service.clearSelection('all')
      
      expect(service.selectedKey).toBe(null)
      expect(service.selectedAlias).toBe(null)
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
    })

    it('should switch to ground environment and restore cached selection', async () => {
      await service.switchEnvironment('ground')
      
      expect(service.currentEnvironment).toBe('ground')
      expect(service.selectedKey).toBe('F2')
      expect(service.selectedAlias).toBe(null)
      
      expect(capturedEvents).toContainEqual({
        event: 'environment:switched',
        data: { from: 'space', to: 'ground', source: 'SelectionService' }
      })
    })

    it('should switch to alias environment and restore cached selection', async () => {
      await service.switchEnvironment('alias')
      
      expect(service.currentEnvironment).toBe('alias')
      expect(service.selectedAlias).toBe('TestAlias')
      expect(service.selectedKey).toBe(null)
      
      expect(capturedEvents).toContainEqual({
        event: 'environment:switched',
        data: { from: 'space', to: 'alias', source: 'SelectionService' }
      })
    })

    it('should clear opposite selection when switching environments', async () => {
      service.selectedKey = 'CurrentKey'
      service.cachedSelections.alias = 'TestAlias' // Set up cached alias for switching
      capturedEvents.length = 0 // Clear existing events
      
      await service.switchEnvironment('alias')
      
      expect(service.selectedKey).toBe(null)
      expect(service.selectedAlias).toBe('TestAlias') // Should restore cached alias
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
      expect(service.selectedKey).toBe('F1')
      expect(service.request).toHaveBeenCalledWith('data:get-keys', { environment: 'space' })
    })

    it('should auto-select first alias in alias environment', async () => {
      service.request.mockResolvedValueOnce({ Alias1: {}, Alias2: {} })
      
      const result = await service.autoSelectFirst('alias')
      
      expect(result).toBe('Alias1')
      expect(service.selectedAlias).toBe('Alias1')
      expect(service.request).toHaveBeenCalledWith('data:get-aliases')
    })

    it('should return null when no items available for auto-selection', async () => {
      service.request.mockResolvedValueOnce({})
      
      const result = await service.autoSelectFirst('space')
      
      expect(result).toBe(null)
      expect(service.selectedKey).toBe(null)
    })

    it('should handle auto-selection errors gracefully', async () => {
      service.request.mockRejectedValueOnce(new Error('Data service error'))
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      
      const result = await service.autoSelectFirst('space')
      
      expect(result).toBe(null)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SelectionService] Failed to auto-select'),
        expect.any(Error)
      )
      
      consoleSpy.mockRestore()
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
      service.selectedKey = 'F1'
      service.selectedAlias = 'TestAlias'
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
      service.currentEnvironment = 'space'
      expect(service.getSelectedItem()).toBe('F1')
      
      service.currentEnvironment = 'alias'
      expect(service.getSelectedItem()).toBe('TestAlias')
    })

    it('should return selected item for specified environment', () => {
      expect(service.getSelectedItem('space')).toBe('F1')
      expect(service.getSelectedItem('alias')).toBe('TestAlias')
    })
  })

  describe('Profile Integration', () => {
    it('should restore selections from profile data', () => {
      const profile = {
        selections: {
          space: 'F5',
          ground: 'F6',
          alias: 'ProfileAlias'
        }
      }
      
      service.currentEnvironment = 'ground'
      service.restoreSelectionsFromProfile(profile)
      
      expect(service.cachedSelections.space).toBe('F5')
      expect(service.cachedSelections.ground).toBe('F6')
      expect(service.cachedSelections.alias).toBe('ProfileAlias')
      expect(service.selectedKey).toBe('F6') // Current environment selection
      expect(service.selectedAlias).toBe(null)
    })

    it('should handle profile updates from DataCoordinator', () => {
      const profile = { id: 'test', name: 'Test Profile' }
      
      service.updateCacheFromProfile(profile)
      
      expect(service.cache.profile).toEqual(profile)
    })
  })

  describe('ComponentBase Integration', () => {
    it('should return only owned state in getCurrentState()', () => {
      service.selectedKey = 'F1'
      service.selectedAlias = 'TestAlias'
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
      expect(service.currentEnvironment).toBe('ground')
      expect(service.selectedKey).toBe('F2')
      expect(service.selectedAlias).toBe(null)
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
      expect(service.currentEnvironment).toBe('space')
    })

    it('should handle environment changes via switchEnvironment', async () => {
      service.cachedSelections.ground = 'F2'
      
      // Directly test the switchEnvironment method
      await service.switchEnvironment('ground')
      
      expect(service.currentEnvironment).toBe('ground')
      expect(service.selectedKey).toBe('F2')
    })
  })

  describe('Legacy Compatibility', () => {
    it('should provide legacy key:get-selected response', async () => {
      service.selectedKey = 'F1'
      
      // This would be called via request/response system
      const handlers = service._responseDetachFunctions
      expect(handlers.length).toBeGreaterThan(0)
      
      // Verify the service has the right component name for identification
      expect(service.componentName).toBe('SelectionService')
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