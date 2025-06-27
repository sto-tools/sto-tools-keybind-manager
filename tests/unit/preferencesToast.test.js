import { describe, it, expect, vi } from 'vitest'
import PreferencesUI from '../../src/js/components/ui/PreferencesUI.js'
import PreferencesService from '../../src/js/components/services/PreferencesService.js'
import { respond } from '../../src/js/core/requestResponse.js'
import eventBus from '../../src/js/core/eventBus.js'
import i18next from 'i18next'

// Regression test for duplicate "Preferences saved" toast (Issue #<untracked>)

describe('PreferencesUI save button', () => {
  it('shows the "preferences_saved" toast only once', async () => {
    // Set up DOM with save button expected by PreferencesUI
    document.body.innerHTML = `
      <button id="savePreferencesBtn"></button>
    `

    // Stub i18next translation function to return key for predictability
    vi.spyOn(i18next, 't').mockImplementation((key) => key)

    // Mock dependencies
    const uiMock = { showToast: vi.fn() }
    const storageMock = {
      getSettings: vi.fn().mockReturnValue({}),
      saveSettings: vi.fn().mockReturnValue(true),
    }

    // Mock the request/response system
    const detachInit = respond(eventBus, 'preferences:init', () => {})
    const detachSave = respond(eventBus, 'preferences:save-settings', () => true)

    // Instantiate service + UI
    const service = new PreferencesService({ storage: storageMock })
    const prefsUI = new PreferencesUI({ service, ui: uiMock })

    // Initialise (attaches event listeners)
    await prefsUI.init()

    // Simulate user clicking "Save" button
    document.getElementById('savePreferencesBtn').click()

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10))

    // Clean up mocked responses
    detachInit()
    detachSave()

    // Expect toast called exactly once (no duplicates)
    expect(uiMock.showToast).toHaveBeenCalledTimes(1)
  })
}) 