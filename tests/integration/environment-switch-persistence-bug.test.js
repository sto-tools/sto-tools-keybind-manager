import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import StorageService from '../../src/js/components/services/StorageService.js'
import DataCoordinator from '../../src/js/components/services/DataCoordinator.js'
import InterfaceModeService from '../../src/js/components/services/InterfaceModeService.js'
import SelectionService from '../../src/js/components/services/SelectionService.js'

describe('Environment Switch Selection Persistence Bug Fix', () => {
  let storageService, dataCoordinator, interfaceModeService, selectionService

  beforeEach(async () => {
    // Create real services
    storageService = new StorageService({ eventBus })
    dataCoordinator = new DataCoordinator({ eventBus, storage: storageService })
    interfaceModeService = new InterfaceModeService({ eventBus, storage: storageService })
    selectionService = new SelectionService({ eventBus })

    // Initialize services in correct order
    storageService.init()
    await dataCoordinator.init()
    interfaceModeService.init()
    await selectionService.init()

    // Create test profile with initial selections
    const testProfile = {
      name: 'Bug Test Profile',
      description: 'Profile for testing environment switch selection persistence',
      currentEnvironment: 'space',
      builds: {
        space: { keys: { 'F1': [], 'F2': [], 'F3': [] } },
        ground: { keys: { 'G1': [], 'G2': [] } }
      },
      aliases: { 'TestAlias': { type: 'user' } },
      selections: {
        space: 'F1',  // Initial selection
        ground: 'G1', // Initial selection
        alias: 'TestAlias'
      }
    }

    // Create and set up test profile
    await dataCoordinator.request('data:create-profile', {
      name: testProfile.name,
      description: testProfile.description
    })

    const profiles = await dataCoordinator.request('data:get-all-profiles')
    const profileId = Object.keys(profiles).find(id => profiles[id].name === testProfile.name)

    await dataCoordinator.request('data:update-profile', {
      profileId: profileId,
      properties: testProfile
    })

    await dataCoordinator.request('data:switch-profile', { profileId })

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  afterEach(() => {
    // Clean up services
    interfaceModeService?.destroy?.()
    selectionService?.destroy?.()
    dataCoordinator?.destroy?.()
    storageService?.destroy?.()
  })

  it('should demonstrate the selection persistence bug fix', async () => {
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
    expect(selectionService.cachedSelections.space).toBe('F2')
    console.log('✓ User selected F2 in Space')
    console.log(`  - selectedKey: ${selectionService.cache.selectedKey}`)
    console.log(`  - cachedSelections.space: ${selectionService.cachedSelections.space}`)
    console.log(`  - cachedSelections.ground: ${selectionService.cachedSelections.ground}`)

    // STEP 3: User switches to Ground environment
    console.log('\n--- Step 3: User switches to Ground ---')
    await interfaceModeService.request('environment:switch', { mode: 'ground' })

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 50))

    // Verify environment switched and Ground selection is restored
    expect(selectionService.cache.currentEnvironment).toBe('ground')
    expect(selectionService.cache.selectedKey).toBe('G1')
    console.log('✓ Switched to Ground, G1 restored')
    console.log(`  - currentEnvironment: ${selectionService.cache.currentEnvironment}`)
    console.log(`  - selectedKey: ${selectionService.cache.selectedKey}`)
    console.log(`  - cachedSelections.space: ${selectionService.cachedSelections.space}`)
    console.log(`  - cachedSelections.ground: ${selectionService.cachedSelections.ground}`)

    // CRITICAL CHECK: Verify that F2 was persisted to Space selections
    const profiles = await dataCoordinator.request('data:get-all-profiles')
    const currentProfileId = dataCoordinator.state.currentProfile
    const currentProfile = profiles[currentProfileId]
    console.log(`  - Profile selections.space: ${currentProfile.selections.space}`)
    console.log(`  - Profile selections.ground: ${currentProfile.selections.ground}`)

    // This should show F2 in Space selections (THE FIX)
    expect(currentProfile.selections.space).toBe('F2')
    expect(currentProfile.selections.ground).toBe('G1')
    console.log('✅ FIX CONFIRMED: F2 persisted to profile.space, G1 persisted to profile.ground')

    // STEP 4: Switch back to Space environment to test if F2 is preserved
    console.log('\n--- Step 4: User switches back to Space (BUG TEST) ---')
    await interfaceModeService.request('environment:switch', { mode: 'space' })

    // Wait for async operations to complete (including the profile restoration fix)
    await new Promise(resolve => setTimeout(resolve, 300))

    // Verify the fix: F2 should be restored, not the original F1
    console.log('🔍 FIX VERIFICATION RESULTS:')
    console.log(`  - currentEnvironment: ${selectionService.cache.currentEnvironment}`)
    console.log(`  - selectedKey: ${selectionService.cache.selectedKey}`)
    console.log(`  - cachedSelections.space: ${selectionService.cachedSelections.space}`)
    console.log(`  - cachedSelections.ground: ${selectionService.cachedSelections.ground}`)

    // The FIX: It should restore F2 (not F1)
    if (selectionService.cache.selectedKey === 'F2') {
      console.log('✅ FIX CONFIRMED: Correctly restored F2!')
    } else if (selectionService.cache.selectedKey === 'F1') {
      console.log('🐛 BUG STILL EXISTS: Restored F1 instead of F2!')
    } else {
      console.log(`❓ UNEXPECTED: Restored ${selectionService.cache.selectedKey}`)
    }

    // Final verification: Check what's in the profile
    const finalProfiles = await dataCoordinator.request('data:get-all-profiles')
    const finalProfileId = dataCoordinator.state.currentProfile
    const finalProfile = finalProfiles[finalProfileId]
    console.log(`  - Final profile selections.space: ${finalProfile.selections.space}`)
    console.log(`  - Final profile selections.ground: ${finalProfile.selections.ground}`)

    // This assertion should pass if the fix works
    expect(selectionService.cache.selectedKey).toBe('F2',
      `Expected F2 to be restored after switching back to Space, but got ${selectionService.cache.selectedKey}`)

    // Also verify the profile still has the correct data
    expect(finalProfile.selections.space).toBe('F2')
    expect(finalProfile.selections.ground).toBe('G1')

    console.log('✅ FIX VERIFICATION COMPLETE: Bug has been resolved!')
  })
})