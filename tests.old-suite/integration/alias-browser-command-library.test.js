// Integration tests for alias handling through AliasBrowserService and CommandLibraryUI
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import CommandLibraryService from '../../src/js/components/services/CommandLibraryService.js'
import CommandLibraryUI from '../../src/js/components/ui/CommandLibraryUI.js'
import AliasBrowserService from '../../src/js/components/services/AliasBrowserService.js'

// Stub minimal i18n implementation for CommandLibraryUI
if (!global.i18next) {
  global.i18next = { t: (k) => k }
}

describe('Alias handling via AliasBrowserService + CommandLibraryUI', () => {
  let mockProfile, mockStorage, mockUI, commandLibraryService, commandLibraryUI

  beforeEach(() => {
    // Mock profile with regular & VFX aliases
    mockProfile = {
      name: 'Test Profile',
      aliases: {
        RegularAlias: {
          name: 'RegularAlias',
          description: 'A regular alias',
          commands: 'target_nearest_enemy $$ FireAll',
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

    // Minimal in-memory storage mock
    mockStorage = {
      _profiles: { 'test-profile': mockProfile },
      getProfile: vi.fn((id) => mockStorage._profiles[id] || null),
      getAllData: vi.fn(() => ({
        currentProfile: 'test-profile',
        profiles: mockStorage._profiles,
      })),
      saveProfile: vi.fn((id, profile) => {
        mockStorage._profiles[id] = JSON.parse(JSON.stringify(profile))
        return true
      }),
    }

    // Basic UI & modal stubs expected by constructor
    mockUI = {
      showToast: vi.fn(),
    }

    // Ensure DOM container exists
    document.body.innerHTML = '<div id="commandCategories"></div>'

    // Instantiate service & UI
    commandLibraryService = new CommandLibraryService({
      storage: mockStorage,
      eventBus,
      i18n: global.i18next,
      ui: mockUI,
      modalManager: mockUI,
    })
    commandLibraryService.setCurrentProfile('test-profile')

    commandLibraryUI = new CommandLibraryUI({
      service: commandLibraryService,
      eventBus,
      ui: mockUI,
      modalManager: mockUI,
      document,
    })

    // Spy on helper to catch regressions
    vi.spyOn(commandLibraryUI, 'createAliasCategoryElement')

    // Clear any initial mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders regular & VFX alias categories', () => {
    commandLibraryUI.updateCommandLibrary()

    const categories = document.getElementById('commandCategories')
    const regular = categories.querySelector('[data-category="aliases"]')
    const vfx = categories.querySelector('[data-category="vertigo-aliases"]')

    expect(regular).toBeTruthy()
    expect(vfx).toBeTruthy()

    // Ensure helper called for each category type
    expect(commandLibraryUI.createAliasCategoryElement).toHaveBeenCalledTimes(2)
  })

  it('categories persist across multiple update calls', () => {
    // First update
    commandLibraryUI.updateCommandLibrary()

    // Second update – should not throw & categories should remain
    commandLibraryUI.updateCommandLibrary()

    const categories = document.getElementById('commandCategories')
    expect(categories.querySelector('[data-category="aliases"]')).toBeTruthy()
    expect(
      categories.querySelector('[data-category="vertigo-aliases"]')
    ).toBeTruthy()
  })

  it('reflects newly created aliases from AliasBrowserService', () => {
    // Create alias via browser-level service
    const aliasBrowserService = new AliasBrowserService({ storage: mockStorage, ui: mockUI })
    aliasBrowserService.currentProfileId = 'test-profile'
    const created = aliasBrowserService.createAlias('NewAlias', 'A brand new alias')
    expect(created).toBe(true)

    // After creation, update command library & expect alias to appear
    commandLibraryUI.updateCommandLibrary()
    const categories = document.getElementById('commandCategories')
    const regularCategory = categories.querySelector('[data-category="aliases"]')
    expect(regularCategory.innerHTML).toContain('NewAlias')
  })
}) 