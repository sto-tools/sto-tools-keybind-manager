// Test to verify SelectionService handles auto-selection when selected items are deleted
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBasicTestEnvironment } from '../../fixtures'
import SelectionService from '../../../src/js/components/services/SelectionService.js'

describe('SelectionService Deletion Auto-Selection', () => {
  let env, selectionService

  beforeEach(async () => {
    env = await createBasicTestEnvironment()
    
    selectionService = new SelectionService({ 
      eventBus: env.eventBus 
    })
    
    // Mock ComponentBase cache with test data
    selectionService.cache = {
      currentProfile: 'test-profile',
      profile: {
        id: 'test-profile',
        selections: {}
      },
      builds: {
        space: {
          keys: {
            'F1': ['FireAll'],
            'F2': ['Shield'], 
            'F3': ['TargetNearest']
          }
        },
        ground: {
          keys: {
            'F2': ['Sprint'],
            'F4': ['Jump']
          }
        }
      },
      keys: {
        'F1': ['FireAll'],
        'F2': ['Shield'], 
        'F3': ['TargetNearest']
      },
      aliases: {
        'TestAlias1': { commands: 'FireAll', type: 'alias' },
        'TestAlias2': { commands: 'Shield', type: 'alias' },
        'TestAlias3': { commands: 'TargetNearest', type: 'alias' }
      }
    }
    
    await selectionService.init()
  })

  afterEach(() => {
    env?.destroy?.()
  })

  describe('Alias Deletion Auto-Selection', () => {
    it('should auto-select another alias when selected alias is deleted in alias environment', async () => {
      // Set up: select an alias and switch to alias environment
      selectionService.currentEnvironment = 'alias'
      await selectionService.selectAlias('TestAlias1')
      
      const autoSelectSpy = vi.spyOn(selectionService, 'autoSelectFirst')
      
      // Create a promise that resolves when auto-selection completes
      let autoSelectComplete = false
      const originalAutoSelect = selectionService.autoSelectFirst.bind(selectionService)
      selectionService.autoSelectFirst = vi.fn(async (...args) => {
        const result = await originalAutoSelect(...args)
        autoSelectComplete = true
        return result
      })
      
      // Simulate alias deletion event
      env.eventBus.emit('alias-deleted', { name: 'TestAlias1' })
      
      // Wait for auto-selection to complete
      while (!autoSelectComplete) {
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      
      // Should have cleared selection and auto-selected
      expect(selectionService.selectedAlias).not.toBe('TestAlias1')
      expect(selectionService.cachedSelections.alias).not.toBe('TestAlias1')
      expect(selectionService.autoSelectFirst).toHaveBeenCalledWith('alias')
      
      // Should auto-select one of the remaining aliases
      expect(['TestAlias2', 'TestAlias3']).toContain(selectionService.selectedAlias)
    })

    it('should clear selection but not auto-select when selected alias is deleted outside alias environment', async () => {
      // Set up: select an alias but stay in space environment
      selectionService.currentEnvironment = 'space'
      await selectionService.selectAlias('TestAlias1')
      
      const autoSelectSpy = vi.spyOn(selectionService, 'autoSelectFirst')
      
      // Simulate alias deletion event
      env.eventBus.emit('alias-deleted', { name: 'TestAlias1' })
      
      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Should have cleared selection but not auto-selected (not in alias environment)
      expect(selectionService.selectedAlias).toBe(null)
      expect(selectionService.cachedSelections.alias).toBe(null)
      expect(autoSelectSpy).not.toHaveBeenCalled()
    })

    it('should not react when a non-selected alias is deleted', async () => {
      // Set up: select one alias
      await selectionService.selectAlias('TestAlias1')
      
      const autoSelectSpy = vi.spyOn(selectionService, 'autoSelectFirst')
      
      // Delete a different alias
      env.eventBus.emit('alias-deleted', { name: 'TestAlias2' })
      
      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Selection should remain unchanged
      expect(selectionService.selectedAlias).toBe('TestAlias1')
      expect(autoSelectSpy).not.toHaveBeenCalled()
    })
  })

  describe('Key Deletion Auto-Selection', () => {
    it('should auto-select another key when selected key is deleted in key environment', async () => {
      // Set up: select a key in space environment
      selectionService.currentEnvironment = 'space'
      await selectionService.selectKey('F1', 'space')
      
      // Create a promise that resolves when auto-selection completes
      let autoSelectComplete = false
      const originalAutoSelect = selectionService.autoSelectFirst.bind(selectionService)
      selectionService.autoSelectFirst = vi.fn(async (...args) => {
        const result = await originalAutoSelect(...args)
        autoSelectComplete = true
        return result
      })
      
      // Simulate key deletion event
      env.eventBus.emit('key-deleted', { keyName: 'F1' })
      
      // Wait for auto-selection to complete
      while (!autoSelectComplete) {
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      
      // Should have cleared selection and auto-selected
      expect(selectionService.selectedKey).not.toBe('F1')
      expect(selectionService.cachedSelections.space).not.toBe('F1')
      expect(selectionService.autoSelectFirst).toHaveBeenCalledWith('space')
      
      // Should auto-select one of the remaining keys
      expect(['F2', 'F3']).toContain(selectionService.selectedKey)
    })

    it('should clear selection but not auto-select when selected key is deleted outside key environment', async () => {
      // Set up: select a key but switch to alias environment
      selectionService.currentEnvironment = 'alias'
      await selectionService.selectKey('F1', 'space')
      
      const autoSelectSpy = vi.spyOn(selectionService, 'autoSelectFirst')
      
      // Simulate key deletion event
      env.eventBus.emit('key-deleted', { keyName: 'F1' })
      
      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Should have cleared selection but not auto-selected (in alias environment)
      expect(selectionService.selectedKey).toBe(null)
      expect(autoSelectSpy).not.toHaveBeenCalled()
    })

    it('should not react when a non-selected key is deleted', async () => {
      // Set up: select one key
      await selectionService.selectKey('F1', 'space')
      
      const autoSelectSpy = vi.spyOn(selectionService, 'autoSelectFirst')
      
      // Delete a different key
      env.eventBus.emit('key-deleted', { keyName: 'F2' })
      
      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Selection should remain unchanged
      expect(selectionService.selectedKey).toBe('F1')
      expect(autoSelectSpy).not.toHaveBeenCalled()
    })
  })

  describe('Event Broadcasting', () => {
    it('should emit alias-selected null event immediately when selected alias is deleted', async () => {
      // Set up: select an alias
      await selectionService.selectAlias('TestAlias1')
      
      const emitSpy = vi.spyOn(selectionService, 'emit')
      
      // Simulate alias deletion event
      env.eventBus.emit('alias-deleted', { name: 'TestAlias1' })
      
      // Should emit null selection immediately for UI update
      expect(emitSpy).toHaveBeenCalledWith('alias-selected', { 
        name: null, 
        source: 'SelectionService' 
      })
    })

    it('should emit key-selected null event immediately when selected key is deleted', async () => {
      // Set up: select a key
      await selectionService.selectKey('F1', 'space')
      
      // Reset the emit spy to only capture the deletion event
      if (selectionService.emit.mockClear) {
        selectionService.emit.mockClear()
      }
      
      // Simulate key deletion event
      env.eventBus.emit('key-deleted', { keyName: 'F1' })
      
      // Wait a moment for the event handler to execute
      await new Promise(resolve => setTimeout(resolve, 5))
      
      // Should emit null selection immediately for UI update
      expect(selectionService.emit).toHaveBeenCalledWith('key-selected', { 
        key: null, 
        source: 'SelectionService' 
      })
    })
  })
})