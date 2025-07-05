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
}) 