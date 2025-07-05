import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import PreferencesService from '../../../src/js/components/services/PreferencesService.js'
import { createServiceFixture } from '../../fixtures'

/**
 * Unit tests – PreferencesService
 */

describe('PreferencesService', () => {
  let fixture, service

  beforeEach(() => {
    fixture = createServiceFixture()
    service = new PreferencesService({ storage: fixture.storage, eventBus: fixture.eventBus })
    service.init()
  })

  afterEach(() => {
    fixture.destroy()
  })

  it('loads default settings when storage is empty', () => {
    const settings = service.getSettings()
    expect(settings).toHaveProperty('theme')
    expect(['default','dark']).toContain(settings.theme)
    expect(settings).toHaveProperty('language', 'en')
  })

  it('setSetting persists to storage and emits preferences:changed', () => {
    const spySave = fixture.storage.saveSettings
    service.setSetting('theme', 'dark')

    expect(service.getSetting('theme')).toBe('dark')
    expect(spySave).toHaveBeenCalled()
    fixture.eventBusFixture.expectEvent('preferences:changed', { key: 'theme', value: 'dark' })
  })

  it('updateThemeToggleButton syncs label and data-i18n with current theme', () => {
    // Setup DOM elements expected by updateThemeToggleButton
    const toggleBtn = document.createElement('button')
    toggleBtn.id = 'themeToggleBtn'
    // icon element inside button
    const iconEl = document.createElement('i')
    toggleBtn.appendChild(iconEl)
    document.body.appendChild(toggleBtn)

    const textSpan = document.createElement('span')
    textSpan.id = 'themeToggleText'
    textSpan.setAttribute('data-i18n', 'dark_mode')
    document.body.appendChild(textSpan)

    // Stub i18n translator to return readable labels
    service.i18n = { t: (key) => ({ light_mode: 'Light Mode', dark_mode: 'Dark Mode' }[key]) }

    // Act – switch to dark theme
    service.updateThemeToggleButton('dark')

    expect(iconEl.className).toBe('fas fa-sun')
    expect(textSpan.getAttribute('data-i18n')).toBe('light_mode')
    expect(textSpan.textContent).toBe('Light Mode')

    // Act – switch back to default (light) theme
    service.updateThemeToggleButton('default')

    expect(iconEl.className).toBe('fas fa-moon')
    expect(textSpan.getAttribute('data-i18n')).toBe('dark_mode')
    expect(textSpan.textContent).toBe('Dark Mode')
  })
}) 