// Integration test for command library alias persistence
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import eventBus from '../../src/js/eventBus.js'

describe('Command Library Alias Persistence Integration', () => {
  let mockApp, mockProfile, mockUI, mockStorage, mockAliasManager

  beforeEach(() => {
    // Mock profile with both regular and VFX aliases
    mockProfile = {
      name: 'Test Profile',
      aliases: {
        RegularAlias: {
          name: 'RegularAlias',
          description: 'A regular command alias',
          commands: 'target_nearest_enemy $$ FireAll',
        },
        CustomCommand: {
          name: 'CustomCommand',
          description: 'Custom combat sequence',
          commands: '+TrayExecByTray 0 0 $$ +power_exec Distribute_Shields',
        },
        dynFxSetFXExlusionList_Space: {
          name: 'dynFxSetFXExlusionList_Space',
          description: 'VFX - Disable Space Visual Effects',
          commands: 'dynFxSetFXExlusionList Fx_Test_Effect_1,Fx_Test_Effect_2',
        },
        dynFxSetFXExlusionList_Ground: {
          name: 'dynFxSetFXExlusionList_Ground',
          description: 'VFX - Disable Ground Visual Effects',
          commands: 'dynFxSetFXExlusionList Fx_Ground_Effect_1',
        },
      },
      keys: {},
    }

    // Mock storage
    mockStorage = {
      getProfile: vi.fn(() => mockProfile),
      getAllData: vi.fn(() => ({
        currentProfile: 'test-profile',
        profiles: {
          'test-profile': mockProfile,
        },
      })),
    }

    // Mock app
    mockApp = {
      getCurrentProfile: vi.fn(() => mockProfile),
      currentProfile: 'test-profile',
      currentEnvironment: 'space',
      init: vi.fn().mockResolvedValue(undefined),
      setupCommandLibrary: vi.fn(),
      loadData: vi.fn().mockResolvedValue(undefined),
    }

    // Mock UI
    mockUI = {
      showModal: vi.fn(),
      hideModal: vi.fn(),
      showToast: vi.fn(),
    }

    // Set up globals
    global.app = mockApp
    global.stoUI = mockUI
    global.stoStorage = mockStorage

    // Mock DOM with command categories container
    document.body.innerHTML = `
      <div id="commandCategories"></div>
    `

    // Mock STO_DATA for setupCommandLibrary
    global.STO_DATA = {
      commands: {
        targeting: {
          name: 'Targeting',
          icon: 'fas fa-crosshairs',
          commands: {
            target_self: {
              name: 'Target Self',
              command: 'target_self',
              description: 'Target yourself',
              icon: '👤',
            },
          },
        },
      },
    }

    // Clear all mocks
    vi.clearAllMocks()

    // Ensure fresh module imports for each test
    vi.resetModules()
  })

  afterEach(() => {
    delete global.app
    delete global.stoUI
    delete global.stoStorage
    delete global.stoAliases
    delete window.stoAliases
    delete global.STO_DATA
  })

  it('should preserve aliases when setupCommandLibrary is called after aliases are added', async () => {
    // Import and create the app and alias manager instances
    const { default: STOToolsKeybindManager } = await import('../../src/js/app.js')
    const { default: STOAliasManager } = await import('../../src/js/aliases.js')

    // Create real app instance
    const app = new STOToolsKeybindManager()
    global.app = app
    window.app = app

    // Create alias manager instance
    const aliasManager = new STOAliasManager()
    global.stoAliases = aliasManager
    window.stoAliases = aliasManager

    // Initialize alias manager first (this adds aliases to command library)
    aliasManager.init()

    // Verify aliases are in the command library
    const commandCategories = document.getElementById('commandCategories')
    let vfxCategory = commandCategories.querySelector('[data-category="vertigo-aliases"]')
    let regularCategory = commandCategories.querySelector('[data-category="aliases"]')

    expect(vfxCategory).toBeTruthy()
    expect(regularCategory).toBeTruthy()

    // Verify alias items are present
    let vfxAliases = vfxCategory.querySelectorAll('.vertigo-alias-item')
    let regularAliases = regularCategory.querySelectorAll('.alias-item')
    expect(vfxAliases).toHaveLength(2) // Space and Ground VFX aliases
    expect(regularAliases).toHaveLength(2) // RegularAlias and CustomCommand

    // Now call setupCommandLibrary (this is what was clearing aliases before the fix)
    app.setupCommandLibrary()

    // Verify that aliases are still present after setupCommandLibrary
    vfxCategory = commandCategories.querySelector('[data-category="vertigo-aliases"]')
    regularCategory = commandCategories.querySelector('[data-category="aliases"]')

    expect(vfxCategory).toBeTruthy()
    expect(regularCategory).toBeTruthy()

    // Verify alias items are still present
    vfxAliases = vfxCategory.querySelectorAll('.vertigo-alias-item')
    regularAliases = regularCategory.querySelectorAll('.alias-item')
    expect(vfxAliases).toHaveLength(2)
    expect(regularAliases).toHaveLength(2)

    // Verify specific aliases are still there
    const aliasNames = Array.from(vfxAliases).map((el) => el.dataset.alias)
    expect(aliasNames).toContain('dynFxSetFXExlusionList_Space')
    expect(aliasNames).toContain('dynFxSetFXExlusionList_Ground')

    const regularAliasNames = Array.from(regularAliases).map((el) => el.dataset.alias)
    expect(regularAliasNames).toContain('RegularAlias')
    expect(regularAliasNames).toContain('CustomCommand')
  })

  it('should handle multiple setupCommandLibrary calls without losing aliases', async () => {
    // Import and create instances
    const { default: STOToolsKeybindManager } = await import('../../src/js/app.js')
    const { default: STOAliasManager } = await import('../../src/js/aliases.js')

    const app = new STOToolsKeybindManager()
    global.app = app
    window.app = app

    const aliasManager = new STOAliasManager()
    global.stoAliases = aliasManager
    window.stoAliases = aliasManager

    // Initialize alias manager
    aliasManager.init()

    // Call setupCommandLibrary multiple times (simulating language changes, etc.)
    app.setupCommandLibrary()
    app.setupCommandLibrary()
    app.setupCommandLibrary()

    // Verify aliases are still present after multiple calls
    const commandCategories = document.getElementById('commandCategories')
    const vfxCategory = commandCategories.querySelector('[data-category="vertigo-aliases"]')
    const regularCategory = commandCategories.querySelector('[data-category="aliases"]')

    expect(vfxCategory).toBeTruthy()
    expect(regularCategory).toBeTruthy()

    const vfxAliases = vfxCategory.querySelectorAll('.vertigo-alias-item')
    const regularAliases = regularCategory.querySelectorAll('.alias-item')
    expect(vfxAliases).toHaveLength(2)
    expect(regularAliases).toHaveLength(2)
  })

  it('should handle case where stoAliases is not available during setupCommandLibrary', async () => {
    // Import and create app instance
    const { default: STOToolsKeybindManager } = await import('../../src/js/app.js')

    const app = new STOToolsKeybindManager()
    global.app = app
    window.app = app

    // Don't set up stoAliases - this simulates the case where it's not available
    delete global.stoAliases
    delete window.stoAliases

    // This should not throw an error even when stoAliases is not available
    expect(() => app.setupCommandLibrary()).not.toThrow()

    // Verify standard commands are still set up
    const commandCategories = document.getElementById('commandCategories')
    const targetingCategory = commandCategories.querySelector('[data-category="targeting"]')
    expect(targetingCategory).toBeTruthy()
  })

  it('should handle case where stoAliases exists but updateCommandLibrary method is not available', async () => {
    // Import and create app instance
    const { default: STOToolsKeybindManager } = await import('../../src/js/app.js')

    const app = new STOToolsKeybindManager()
    global.app = app
    window.app = app

    // Set up a mock stoAliases without updateCommandLibrary method
    global.stoAliases = {}
    window.stoAliases = {}

    // This should not throw an error even when updateCommandLibrary is not available
    expect(() => app.setupCommandLibrary()).not.toThrow()

    // Verify standard commands are still set up
    const commandCategories = document.getElementById('commandCategories')
    const targetingCategory = commandCategories.querySelector('[data-category="targeting"]')
    expect(targetingCategory).toBeTruthy()
  })
}) 