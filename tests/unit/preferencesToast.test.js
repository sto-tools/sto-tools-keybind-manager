import { describe, it, expect, vi } from 'vitest'
import PreferencesUI from '../../src/js/components/ui/PreferencesUI.js'
import PreferencesService from '../../src/js/components/services/PreferencesService.js'
import i18next from 'i18next'

// Regression test for duplicate "Preferences saved" toast (Issue #<untracked>)

describe('PreferencesUI save button', () => {
  it('shows the "preferences_saved" toast only once', () => {
    // Set up DOM with save button expected by PreferencesUI
    document.body.innerHTML = `
      <button id="savePreferencesBtn"></button>
    `

    // Stub i18next translation function to return key for predictability
    vi.spyOn(i18next, 't').mockImplementation((key) => key)

    // Mock dependencies
    const uiMock = { showToast: vi.fn() }
    const modalManagerMock = { hide: vi.fn() }
    const storageMock = {
      getSettings: vi.fn().mockReturnValue({}),
      saveSettings: vi.fn().mockReturnValue(true),
    }

    // Instantiate service + UI
    const service = new PreferencesService({ storage: storageMock })
    const prefsUI = new PreferencesUI({ service, modalManager: modalManagerMock, ui: uiMock })

    // Initialise (attaches event listeners)
    prefsUI.init()

    // Simulate user clicking "Save" button
    document.getElementById('savePreferencesBtn').click()

    // Expect toast called exactly once (no duplicates)
    expect(uiMock.showToast).toHaveBeenCalledTimes(1)
  })
}) 