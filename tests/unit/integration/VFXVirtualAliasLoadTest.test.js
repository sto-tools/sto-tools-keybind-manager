// Integration test for VFX virtual alias loading on page reload
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createServiceFixture } from '../../fixtures/index.js'
import VFXManagerService from '../../../src/js/components/services/VFXManagerService.js'
import CommandLibraryService from '../../../src/js/components/services/CommandLibraryService.js'

// Mock VFX effects data
global.VFX_EFFECTS = {
  space: [
    { effect: 'Plasma_Torpedo_Explosion', name: 'Plasma Torpedo Explosion' },
    { effect: 'Phaser_Beam', name: 'Phaser Beam' }
  ],
  ground: [
    { effect: 'Explosion_Large', name: 'Large Explosion' }
  ]
}

describe('VFX Virtual Alias Loading on Page Reload', () => {
  let harness, vfxService, commandLibraryService, capturedEvents

  beforeEach(async () => {
    harness = createServiceFixture()
    capturedEvents = []

    // Create VFXManagerService
    vfxService = new VFXManagerService(harness.eventBus)

    // Create CommandLibraryService with mocks
    const mockUI = { showToast: vi.fn() }
    const mockI18n = { t: vi.fn((key, params) => key) }
    const mockModalManager = { show: vi.fn() }
    
    commandLibraryService = new CommandLibraryService({
      eventBus: harness.eventBus,
      storage: harness.storage,
      i18n: mockI18n,
      ui: mockUI,
      modalManager: mockModalManager
    })

    // Capture events
    harness.eventBus.on('vfx:settings-changed', (data) => {
      capturedEvents.push({ event: 'vfx:settings-changed', data })
    })
    harness.eventBus.on('aliases-changed', (data) => {
      capturedEvents.push({ event: 'aliases-changed', data })
    })

    // Initialize services
    await vfxService.init()
    await commandLibraryService.init()
  })

  afterEach(() => {
    harness?.cleanup?.()
  })

  it('should load virtual VFX aliases when profile with VFX settings is loaded', async () => {
    // Create a profile with VFX settings
    const profileWithVFX = {
      id: 'test_profile',
      name: 'Test Profile',
      migrationVersion: '2.1.0',
      vertigoSettings: {
        selectedEffects: {
          space: ['Plasma_Torpedo_Explosion', 'Phaser_Beam'],
          ground: ['Explosion_Large']
        },
        showPlayerSay: true
      },
      aliases: {
        'userAlias': { commands: ['TestCommand'], type: 'alias' }
      }
    }

    // Clear captured events
    capturedEvents.length = 0

    // Simulate profile being loaded (emitted by DataCoordinator)
    harness.eventBus.emit('profile:switched', {
      profileId: 'test_profile',
      profile: profileWithVFX
    })

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 10))

    // Verify VFX settings loaded event was emitted
    const vfxEvent = capturedEvents.find(e => e.event === 'vfx:settings-changed')
    expect(vfxEvent).toBeDefined()
    expect(vfxEvent.data.selectedEffects.space).toEqual(['Plasma_Torpedo_Explosion', 'Phaser_Beam'])
    expect(vfxEvent.data.selectedEffects.ground).toEqual(['Explosion_Large'])
    expect(vfxEvent.data.showPlayerSay).toBe(true)

    // Verify CommandLibraryService received the event and updated aliases
    const aliasEvent = capturedEvents.find(e => e.event === 'aliases-changed')
    expect(aliasEvent).toBeDefined()
    expect(aliasEvent.data.aliases).toBeDefined()

    // Verify virtual VFX aliases are available
    const virtualAliases = await vfxService.getVirtualVFXAliases()
    expect(virtualAliases).toHaveProperty('dynFxSetFXExclusionList_Space')
    expect(virtualAliases).toHaveProperty('dynFxSetFXExclusionList_Ground')
    
    // Verify Space alias has commands
    expect(virtualAliases.dynFxSetFXExclusionList_Space.commands).toEqual([
      'dynFxSetFXExclusionList Plasma_Torpedo_Explosion,Phaser_Beam',
      'PlayerSay VFX Suppression Loaded'
    ])
    expect(virtualAliases.dynFxSetFXExclusionList_Space.type).toBe('vfx-alias')
    expect(virtualAliases.dynFxSetFXExclusionList_Space.virtual).toBe(true)

    // Verify Ground alias has commands
    expect(virtualAliases.dynFxSetFXExclusionList_Ground.commands).toEqual([
      'dynFxSetFXExclusionList Explosion_Large',
      'PlayerSay VFX Suppression Loaded'
    ])
  })

  it('should create empty virtual VFX aliases when no effects are selected', async () => {
    // Create a profile with empty VFX settings
    const profileWithEmptyVFX = {
      id: 'test_profile',
      name: 'Test Profile',
      migrationVersion: '2.1.0',
      vertigoSettings: {
        selectedEffects: {
          space: [],
          ground: []
        },
        showPlayerSay: false
      }
    }

    // Clear captured events
    capturedEvents.length = 0

    // Simulate profile being loaded
    harness.eventBus.emit('profile:switched', {
      profileId: 'test_profile',
      profile: profileWithEmptyVFX
    })

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 10))

    // Verify virtual VFX aliases are still created (even when empty)
    const virtualAliases = await vfxService.getVirtualVFXAliases()
    expect(virtualAliases).toHaveProperty('dynFxSetFXExclusionList_Space')
    expect(virtualAliases).toHaveProperty('dynFxSetFXExclusionList_Ground')
    
    // Verify empty aliases have empty commands
    expect(virtualAliases.dynFxSetFXExclusionList_Space.commands).toEqual([])
    expect(virtualAliases.dynFxSetFXExclusionList_Ground.commands).toEqual([])
    expect(virtualAliases.dynFxSetFXExclusionList_Space.type).toBe('vfx-alias')
    expect(virtualAliases.dynFxSetFXExclusionList_Ground.type).toBe('vfx-alias')
  })

  it('should create empty virtual VFX aliases when profile has no VFX settings', async () => {
    // Create a profile without VFX settings
    const profileWithoutVFX = {
      id: 'test_profile',
      name: 'Test Profile',
      migrationVersion: '2.1.0',
      aliases: {
        'userAlias': { commands: ['TestCommand'], type: 'alias' }
      }
    }

    // Clear captured events
    capturedEvents.length = 0

    // Simulate profile being loaded
    harness.eventBus.emit('profile:switched', {
      profileId: 'test_profile',
      profile: profileWithoutVFX
    })

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 10))

    // Verify virtual VFX aliases are still created with defaults
    const virtualAliases = await vfxService.getVirtualVFXAliases()
    expect(virtualAliases).toHaveProperty('dynFxSetFXExclusionList_Space')
    expect(virtualAliases).toHaveProperty('dynFxSetFXExclusionList_Ground')
    
    // Verify aliases have empty commands (default state)
    expect(virtualAliases.dynFxSetFXExclusionList_Space.commands).toEqual([])
    expect(virtualAliases.dynFxSetFXExclusionList_Ground.commands).toEqual([])
  })
})