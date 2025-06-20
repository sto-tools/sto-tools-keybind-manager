// Test for localization functionality
import { describe, it, expect, beforeEach } from 'vitest'
import i18next from 'i18next'
import en from '../../src/i18n/en.json'
import '../../src/js/data.js'

describe('Localization Fix', () => {
  beforeEach(async () => {
    // Initialize i18next
    await i18next.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: { translation: en }
      }
    })
    
    // Make i18next available globally (this is the fix)
    window.i18next = i18next
  })

  it('should have localizeCommandData function available', () => {
    expect(window.localizeCommandData).toBeDefined()
    expect(typeof window.localizeCommandData).toBe('function')
  })

  it('should access i18next when localizeCommandData is called', () => {
    // Store original values
    const originalTargetingName = window.STO_DATA.commands.targeting.name
    const originalTargetingDescription = window.STO_DATA.commands.targeting.description
    
    // Call localization function
    expect(() => {
      window.localizeCommandData()
    }).not.toThrow()
    
    // The function should have run without throwing an error
    // Since we're using English translations, the values might be the same
    // but the important thing is that it doesn't throw an error
    expect(window.STO_DATA.commands.targeting.name).toBeDefined()
    expect(window.STO_DATA.commands.targeting.description).toBeDefined()
  })

  it('should not throw error when i18next is available globally', () => {
    // Ensure i18next is available
    expect(window.i18next).toBeDefined()
    expect(window.i18next.t).toBeDefined()
    
    // Test that it can translate a key
    const translated = window.i18next.t('command_categories.targeting')
    expect(translated).toBe('Targeting')
    
    // Call localization function - should not throw
    expect(() => {
      window.localizeCommandData()
    }).not.toThrow()
  })

  it('should return early when i18next is not available', () => {
    // Temporarily remove i18next
    const originalI18next = window.i18next
    delete window.i18next
    
    // Should return early without throwing
    expect(() => {
      window.localizeCommandData()
    }).not.toThrow()
    
    // Restore i18next
    window.i18next = originalI18next
  })

  it('should localize command categories correctly', () => {
    // Call localization
    window.localizeCommandData()
    
    // Check that category names are translated
    expect(window.STO_DATA.commands.targeting.name).toBe('Targeting')
    expect(window.STO_DATA.commands.combat.name).toBe('Combat')
    expect(window.STO_DATA.commands.tray.name).toBe('Tray Execution')
    
    // Check that category descriptions are translated
    expect(window.STO_DATA.commands.targeting.description).toBe('Target selection and management')
    expect(window.STO_DATA.commands.combat.description).toBe('Weapon firing and combat actions')
  })

  it('should localize individual commands correctly', () => {
    // Call localization
    window.localizeCommandData()
    
    // Check specific command translations
    expect(window.STO_DATA.commands.targeting.commands.target_enemy_near.name).toBe('Target Nearest Enemy')
    expect(window.STO_DATA.commands.targeting.commands.target_enemy_near.description).toBe('Target the nearest enemy in view')
    
    expect(window.STO_DATA.commands.combat.commands.fire_all.name).toBe('Fire All Weapons')
    expect(window.STO_DATA.commands.combat.commands.fire_all.description).toBe('Fire all weapons')
  })
}) 