// Integration test to verify selection restoration fix on page reload

import { describe, it, expect, beforeEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import SelectionService from '../../src/js/components/services/SelectionService.js'
import DataCoordinator from '../../src/js/components/services/DataCoordinator.js'
import StorageService from '../../src/js/components/services/StorageService.js'

describe('Selection Restoration Fix - Page Reload', () => {
  let selectionService, dataCoordinator, storageService
  let emittedEvents = []

  beforeEach(async () => {
    // Clear events log
    emittedEvents = []

    // Monitor events
    const originalEmit = eventBus.emit
    eventBus.emit = function(event, data) {
      emittedEvents.push({ event, data })
      return originalEmit.call(this, event, data)
    }

    // Set up storage with profile containing selections
    storageService = new StorageService({ eventBus })
    await storageService.init()

    const testProfile = {
      name: 'Test Profile',
      description: 'Test profile with selections',
      currentEnvironment: 'ground',
      builds: {
        space: { keys: { 'F1': [{ command: 'space_command' }] } },
        ground: { keys: { 'F2': [{ command: 'ground_command' }] } }
      },
      aliases: { 'TestAlias': { commands: ['say "Hello"'], description: 'Test alias' } },
      selections: {
        space: 'F1',
        ground: 'F2',
        alias: 'TestAlias'
      },
      created: new Date().toISOString(),
      lastModified: new Date().toISOString()
    }

    await storageService.saveProfile('test-profile', testProfile)
    const allData = storageService.getAllData()
    allData.currentProfile = 'test-profile'
    await storageService.saveAllData(allData)

    // Initialize DataCoordinator first (simulates app startup order)
    dataCoordinator = new DataCoordinator({ eventBus, storage: storageService })
    await dataCoordinator.init()

    // Initialize SelectionService second (simulates app startup order)
    selectionService = new SelectionService({ eventBus })
    await selectionService.init()
  })

  it('should emit key-selected event after restoring selection from profile', () => {
    // Filter to key-selected events
    const keySelectedEvents = emittedEvents.filter(e => e.event === 'key-selected')
    
    // Should have at least one key-selected event
    expect(keySelectedEvents.length).toBeGreaterThan(0)
    
    // Should emit the correct restored selection
    const restorationEvent = keySelectedEvents.find(e => 
      e.data.key === 'F2' && 
      e.data.environment === 'ground' && 
      e.data.source === 'SelectionService'
    )
    
    expect(restorationEvent).toBeDefined()
    expect(restorationEvent.data).toEqual({
      key: 'F2',
      environment: 'ground',
      source: 'SelectionService'
    })
  })

  it('should correctly restore all selection state from profile', () => {
    // Verify the SelectionService state matches the profile
    expect(selectionService.currentEnvironment).toBe('ground')
    expect(selectionService.selectedKey).toBe('F2')
    expect(selectionService.selectedAlias).toBe(null) // Should be null since environment is 'ground', not 'alias'
    expect(selectionService.cachedSelections).toEqual({
      space: 'F1',
      ground: 'F2',
      alias: 'TestAlias'
    })
  })

  it('should handle alias environment restoration', async () => {
    // Test with alias environment
    const aliasProfile = {
      name: 'Alias Profile',
      description: 'Test profile with alias selection',
      currentEnvironment: 'alias',
      builds: {
        space: { keys: {} },
        ground: { keys: {} }
      },
      aliases: { 'TestAlias': { commands: ['say "Hello"'], description: 'Test alias' } },
      selections: {
        space: null,
        ground: null,
        alias: 'TestAlias'
      },
      created: new Date().toISOString(),
      lastModified: new Date().toISOString()
    }

    await storageService.saveProfile('alias-profile', aliasProfile)
    const allData = storageService.getAllData()
    allData.currentProfile = 'alias-profile'
    await storageService.saveAllData(allData)

    // Create new instances to simulate page reload
    const newDataCoordinator = new DataCoordinator({ eventBus, storage: storageService })
    await newDataCoordinator.init()

    const newSelectionService = new SelectionService({ eventBus })
    await newSelectionService.init()

    // Should restore alias selection
    expect(newSelectionService.currentEnvironment).toBe('alias')
    expect(newSelectionService.selectedAlias).toBe('TestAlias')
    expect(newSelectionService.selectedKey).toBe(null) // Should be null in alias environment

    // Should emit alias-selected event
    const aliasSelectedEvents = emittedEvents.filter(e => e.event === 'alias-selected')
    const restorationEvent = aliasSelectedEvents.find(e => 
      e.data.name === 'TestAlias' && 
      e.data.source === 'SelectionService'
    )
    expect(restorationEvent).toBeDefined()
  })

  it('should work with DataCoordinator late-join handshake mechanism', () => {
    // The test setup itself validates the late-join handshake works
    // If we get here with correct state, the handshake succeeded
    
    // Verify DataCoordinator has the profile data
    const dcState = dataCoordinator.getCurrentState()
    expect(dcState.currentProfileData).toBeDefined()
    expect(dcState.currentProfileData.selections).toEqual({
      space: 'F1',
      ground: 'F2',
      alias: 'TestAlias'
    })
    
    // Verify SelectionService received and processed this data
    expect(selectionService.cache.currentProfile).toBe('test-profile')
    expect(selectionService.cache.profile).toBeDefined()
  })
})