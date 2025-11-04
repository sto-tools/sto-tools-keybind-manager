import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import EventBus from '../../src/js/core/eventBus.js'
import StorageService from '../../src/js/components/services/StorageService.js'
import DataCoordinator from '../../src/js/components/services/DataCoordinator.js'
import InterfaceModeService from '../../src/js/components/services/InterfaceModeService.js'
import SelectionService from '../../src/js/components/services/SelectionService.js'

describe('Selection Persistence Bug Reproduction - Real Components', () => {
  let eventBus, storageService, dataCoordinator, interfaceModeService, selectionService

  beforeEach(async () => {
    // Create real event bus
    eventBus = new EventBus()

    // Create real services with minimal configuration
    storageService = new StorageService({ eventBus })
    dataCoordinator = new DataCoordinator({ eventBus, storage: storageService })
    interfaceModeService = new InterfaceModeService({ eventBus, storage: storageService })
    selectionService = new SelectionService({ eventBus })

    // Initialize services in the correct order (simulating real app startup)
    await storageService.onInit()
    await dataCoordinator.onInit()
    await interfaceModeService.onInit()
    await selectionService.onInit()

    // Set up test profile with initial selections
    const testProfile = {
      name: 'Bug Reproduction Test',
      description: 'Profile to test selection persistence bug',
      currentEnvironment: 'space',
      builds: {
        space: {
          keys: {
            'F1': [{ command: 'space_command_1' }],
            'F2': [{ command: 'space_command_2' }],
            'F3': [{ command: 'space_command_3' }]
          }
        },
        ground: {
          keys: {
            'G1': [{ command: 'ground_command_1' }],
            'G2': [{ command: 'ground_command_2' }]
          }
        }
      },
      aliases: {
        'TestAlias': { commands: ['say "test"'], description: 'Test alias' }
      },
      selections: {
        space: 'F1',    // Initial selection in Space
        ground: 'G1',   // Initial selection in Ground
        alias: 'TestAlias'
      },
      created: new Date().toISOString(),
      lastModified: new Date().toISOString()
    }

    // Create and switch to test profile
    await dataCoordinator.request('data:create-profile', {
      name: testProfile.name,
      description: testProfile.description
    })

    // Update profile with test data including initial selections
    const profiles = await dataCoordinator.request('data:get-all-profiles')
    const profileId = Object.keys(profiles).find(id => profiles[id].name === testProfile.name)

    await dataCoordinator.request('data:update-profile', {
      profileId: profileId,
      properties: testProfile
    })

    // Switch to the test profile
    await dataCoordinator.request('data:switch-profile', { profileId })

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  afterEach(async () => {
    // Clean up services
    selectionService?.onDestroy()
    interfaceModeService?.onDestroy()
    dataCoordinator?.onDestroy()
    storageService?.onDestroy()

    // Clear any remaining data
    await storageService.clearAllData()
  })

  it('should reproduce the selection persistence bug', async () => {
    console.log('\n=== REPRODUCING BUG: Selection Persistence Issue ===')

    // STEP 1: Verify initial state - should have F1 selected in Space
    console.log('\n--- Step 1: Initial State ---')
    expect(selectionService.cache.currentEnvironment).toBe('space')
    expect(selectionService.cache.selectedKey).toBe('F1')
    expect(selectionService.cachedSelections.space).toBe('F1')
    expect(selectionService.cachedSelections.ground).toBe('G1')
    console.log('✓ Initial state verified: Space=F1, Ground=G1')

    // STEP 2: User selects F2 in Space environment
    console.log('\n--- Step 2: User selects F2 in Space ---')
    await selectionService.request('selection:select-key', { keyName: 'F2', environment: 'space' })

    // Verify F2 is now selected and cached
    expect(selectionService.cache.selectedKey).toBe('F2')
    expect(selectionService.cachedSelections.space).toBe('F2') // This should be updated
    console.log('✓ User selected F2 in Space')
    console.log(`  - selectedKey: ${selectionService.cache.selectedKey}`)
    console.log(`  - cachedSelections.space: ${selectionService.cachedSelections.space}`)
    console.log(`  - cachedSelections.ground: ${selectionService.cachedSelections.ground}`)

    // STEP 3: User switches to Ground environment
    console.log('\n--- Step 3: User switches to Ground ---')
    await interfaceModeService.request('environment:switch', { mode: 'ground' })

    // Verify environment switched and Ground selection is restored
    expect(selectionService.cache.currentEnvironment).toBe('ground')
    expect(selectionService.cache.selectedKey).toBe('G1')
    console.log('✓ Switched to Ground, G1 restored')
    console.log(`  - currentEnvironment: ${selectionService.cache.currentEnvironment}`)
    console.log(`  - selectedKey: ${selectionService.cache.selectedKey}`)
    console.log(`  - cachedSelections.space: ${selectionService.cachedSelections.space}`)
    console.log(`  - cachedSelections.ground: ${selectionService.cachedSelections.ground}`)

    // CRITICAL CHECK: Verify that F2 was persisted to Space selections
    const currentProfile = await dataCoordinator.request('data:get-current-profile')
    console.log(`  - Profile selections.space: ${currentProfile.selections.space}`)
    console.log(`  - Profile selections.ground: ${currentProfile.selections.ground}`)

    // This should show F2 in Space selections
    expect(currentProfile.selections.space).toBe('F2')
    expect(currentProfile.selections.ground).toBe('G1')
    console.log('✓ F2 persisted to profile.space, G1 persisted to profile.ground')

    // STEP 4: Simulate page reload by creating fresh services
    console.log('\n--- Step 4: Simulating page reload ---')

    // Destroy current services
    selectionService.onDestroy()
    interfaceModeService.onDestroy()
    dataCoordinator.onDestroy()
    storageService.onDestroy()

    // Create fresh services (simulating page reload)
    const newStorageService = new StorageService({ eventBus })
    const newDataCoordinator = new DataCoordinator({ eventBus, storage: newStorageService })
    const newInterfaceModeService = new InterfaceModeService({ eventBus, storage: newStorageService })
    const newSelectionService = new SelectionService({ eventBus })

    // Initialize fresh services
    await newStorageService.onInit()
    await newDataCoordinator.onInit()
    await newInterfaceModeService.onInit()
    await newSelectionService.onInit()

    // Wait for initialization to complete
    await new Promise(resolve => setTimeout(resolve, 200))

    // Verify reload state
    expect(newSelectionService.cache.currentEnvironment).toBe('ground') // Should restore last environment
    expect(newSelectionService.cache.selectedKey).toBe('G1') // Should restore Ground selection
    console.log('✓ Page reload completed')
    console.log(`  - currentEnvironment: ${newSelectionService.cache.currentEnvironment}`)
    console.log(`  - selectedKey: ${newSelectionService.cache.selectedKey}`)
    console.log(`  - cachedSelections.space: ${newSelectionService.cachedSelections.space}`)
    console.log(`  - cachedSelections.ground: ${newSelectionService.cachedSelections.ground}`)

    // STEP 5: User switches back to Space environment (this is where the bug manifests)
    console.log('\n--- Step 5: User switches back to Space (BUG TEST) ---')
    await newInterfaceModeService.request('environment:switch', { mode: 'space' })

    // Verify the bug: it should restore F2 but might restore F1
    console.log('🔍 BUG CHECK RESULTS:')
    console.log(`  - currentEnvironment: ${newSelectionService.cache.currentEnvironment}`)
    console.log(`  - selectedKey: ${newSelectionService.cache.selectedKey}`)
    console.log(`  - cachedSelections.space: ${newSelectionService.cachedSelections.space}`)
    console.log(`  - cachedSelections.ground: ${newSelectionService.cachedSelections.ground}`)

    // The BUG: It should restore F2 but might restore F1
    if (newSelectionService.cache.selectedKey === 'F2') {
      console.log('✅ NO BUG: Correctly restored F2')
    } else if (newSelectionService.cache.selectedKey === 'F1') {
      console.log('🐛 BUG CONFIRMED: Restored F1 instead of F2!')
    } else {
      console.log(`❓ UNEXPECTED: Restored ${newSelectionService.cache.selectedKey}`)
    }

    // Final verification: Check what's in the profile vs what's in memory
    const finalProfile = await newDataCoordinator.request('data:get-current-profile')
    console.log(`  - Final profile selections.space: ${finalProfile.selections.space}`)
    console.log(`  - Final profile selections.ground: ${finalProfile.selections.ground}`)

    // Clean up new services
    newSelectionService.onDestroy()
    newInterfaceModeService.onDestroy()
    newDataCoordinator.onDestroy()
    newStorageService.onDestroy()
  })

  it('should verify normal selection persistence works correctly', async () => {
    console.log('\n=== CONTROL TEST: Normal selection persistence ===')

    // User selects F3 in Space
    await selectionService.request('selection:select-key', { keyName: 'F3', environment: 'space' })
    expect(selectionService.cache.selectedKey).toBe('F3')
    console.log('✓ Selected F3 in Space')

    // Simulate page reload (fresh services)
    selectionService.onDestroy()
    interfaceModeService.onDestroy()
    dataCoordinator.onDestroy()
    storageService.onDestroy()

    const newStorageService = new StorageService({ eventBus })
    const newDataCoordinator = new DataCoordinator({ eventBus, storage: newStorageService })
    const newInterfaceModeService = new InterfaceModeService({ eventBus, storage: newStorageService })
    const newSelectionService = new SelectionService({ eventBus })

    await newStorageService.onInit()
    await newDataCoordinator.onInit()
    await newInterfaceModeService.onInit()
    await newSelectionService.onInit()

    await new Promise(resolve => setTimeout(resolve, 200))

    // Should restore F3 in Space
    expect(newSelectionService.cache.selectedKey).toBe('F3')
    console.log('✅ CONTROL TEST PASSED: Normal selection persistence works')

    // Clean up
    newSelectionService.onDestroy()
    newInterfaceModeService.onDestroy()
    newDataCoordinator.onDestroy()
    newStorageService.onDestroy()
  })
})