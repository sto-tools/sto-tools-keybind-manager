import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import PreferencesService from '../../src/js/components/services/PreferencesService.js'
import eventBus from '../../src/js/core/eventBus.js'

describe('PreferencesService - Theme and Language Management', () => {
  let preferencesService
  let mockStorage
  let mockI18n
  let mockToastEmit

  beforeEach(() => {
    // Reset DOM
    document.documentElement.removeAttribute('data-theme')
    document.body.className = ''
    document.body.innerHTML = `
      <div id="themeToggleBtn">
        <i class="fas fa-moon"></i>
      </div>
      <span id="themeToggleText">Dark Mode</span>
      <span id="languageFlag" class="fi fi-gb"></span>
    `

    // Mock storage
    mockStorage = {
      getSettings: vi.fn(() => ({})),
      saveSettings: vi.fn(() => true)
    }

    // Mock i18next
    mockI18n = {
      language: 'en',
      changeLanguage: vi.fn(() => Promise.resolve()),
      t: vi.fn((key, options) => {
        const translations = {
          'switched_to_theme': `Switched to ${options?.themeName || 'theme'}`,
          'language_updated': 'Language updated',
          'light_mode': 'Light Mode',
          'dark_mode': 'Dark Mode'
        }
        return translations[key] || key
      })
    }

    // Mock global functions
    global.window = {
      applyTranslations: vi.fn(),
      localizeCommandData: vi.fn()
    }

    // Track toast emissions
    mockToastEmit = vi.fn()
    const originalEmit = eventBus.emit
    eventBus.emit = vi.fn((event, data) => {
      if (event === 'toast:show') {
        mockToastEmit(event, data)
      }
      return originalEmit.call(eventBus, event, data)
    })

    preferencesService = new PreferencesService({
      storage: mockStorage,
      eventBus,
      i18n: mockI18n
    })
  })

  afterEach(() => {
    eventBus.emit.mockRestore?.()
    vi.clearAllMocks()
  })

  describe('Theme Management', () => {
    it('should apply default theme on initialization', () => {
      preferencesService.init()
      
      // Default theme should not set data-theme attribute
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    })

    it('should apply dark theme correctly', () => {
      mockStorage.getSettings.mockReturnValue({ theme: 'dark' })
      
      preferencesService.init()
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('should handle theme toggle from default to dark', () => {
      preferencesService.init()
      
      // Trigger theme toggle
      eventBus.emit('theme:toggle')
      
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(mockStorage.saveSettings).toHaveBeenCalled()
      expect(mockToastEmit).toHaveBeenCalledWith('toast:show', {
        message: 'Switched to Dark Mode',
        type: 'success'
      })
    })

    it('should handle theme toggle from dark to default', () => {
      mockStorage.getSettings.mockReturnValue({ theme: 'dark' })
      preferencesService.init()
      
      // Trigger theme toggle
      eventBus.emit('theme:toggle')
      
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
      expect(mockStorage.saveSettings).toHaveBeenCalled()
      expect(mockToastEmit).toHaveBeenCalledWith('toast:show', {
        message: 'Switched to Light Mode',
        type: 'success'
      })
    })

    it('should update theme toggle button correctly for dark theme', () => {
      preferencesService.settings.theme = 'dark'
      preferencesService.updateThemeToggleButton('dark')
      
      const themeIcon = document.querySelector('#themeToggleBtn i')
      const themeText = document.getElementById('themeToggleText')
      
      expect(themeIcon.className).toBe('fas fa-sun')
      expect(themeText.textContent).toBe('Light Mode')
    })

    it('should update theme toggle button correctly for light theme', () => {
      preferencesService.settings.theme = 'default'
      preferencesService.updateThemeToggleButton('default')
      
      const themeIcon = document.querySelector('#themeToggleBtn i')
      const themeText = document.getElementById('themeToggleText')
      
      expect(themeIcon.className).toBe('fas fa-moon')
      expect(themeText.textContent).toBe('Dark Mode')
    })

    it('should handle missing DOM elements gracefully', () => {
      document.body.innerHTML = ''
      
      expect(() => {
        preferencesService.updateThemeToggleButton('dark')
        preferencesService.applyTheme()
      }).not.toThrow()
    })
  })

  describe('Language Management', () => {
    it('should apply default language on initialization', async () => {
      preferencesService.init()
      
      expect(mockI18n.changeLanguage).not.toHaveBeenCalled() // Same language
    })

    it('should change language when different from current', async () => {
      mockStorage.getSettings.mockReturnValue({ language: 'de' })
      
      preferencesService.init()
      
      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('de')
    })

    it('should handle language change event', async () => {
      preferencesService.init()
      
      // Trigger language change
      eventBus.emit('language:change', { language: 'fr' })
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('fr')
      expect(mockStorage.saveSettings).toHaveBeenCalled()
      expect(window.localizeCommandData).toHaveBeenCalled()
      expect(mockToastEmit).toHaveBeenCalledWith('toast:show', {
        message: 'Language updated',
        type: 'success'
      })
    })

    it('should update language flag correctly', () => {
      const testCases = [
        { lang: 'en', expectedClass: 'fi fi-gb' },
        { lang: 'de', expectedClass: 'fi fi-de' },
        { lang: 'es', expectedClass: 'fi fi-es' },
        { lang: 'fr', expectedClass: 'fi fi-fr' },
        { lang: 'unknown', expectedClass: 'fi fi-gb' } // fallback
      ]
      
      testCases.forEach(({ lang, expectedClass }) => {
        preferencesService.updateLanguageFlag(lang)
        const flag = document.getElementById('languageFlag')
        expect(flag.className).toBe(expectedClass)
      })
    })

    it('should emit language:changed event for other components', async () => {
      const languageChangedSpy = vi.fn()
      eventBus.on('language:changed', languageChangedSpy)
      
      preferencesService.init()
      
      // Trigger language change
      eventBus.emit('language:change', { language: 'de' })
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(languageChangedSpy).toHaveBeenCalledWith({ language: 'de' })
      
      eventBus.off('language:changed', languageChangedSpy)
    })

    it('should handle missing DOM elements gracefully', () => {
      document.body.innerHTML = ''
      
      expect(() => {
        preferencesService.updateLanguageFlag('de')
      }).not.toThrow()
    })

    it('should apply translations after language change', async () => {
      preferencesService.init()
      
      eventBus.emit('language:change', { language: 'de' })
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(window.applyTranslations).toHaveBeenCalled()
    })
  })

  describe('Browser Language Detection', () => {
    it('should detect supported browser language', () => {
      // Mock navigator in global scope
      Object.defineProperty(global, 'navigator', {
        value: {
          languages: ['de-DE', 'en-US'],
          language: 'de-DE'
        },
        configurable: true
      })
      
      const detectedLang = preferencesService.detectBrowserLanguage()
      expect(detectedLang).toBe('de')
    })

    it('should fallback to English for unsupported language', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          languages: ['ja-JP'],
          language: 'ja-JP'
        },
        configurable: true
      })
      
      const detectedLang = preferencesService.detectBrowserLanguage()
      expect(detectedLang).toBe('en')
    })

    it('should handle missing navigator gracefully', () => {
      delete global.navigator
      
      const detectedLang = preferencesService.detectBrowserLanguage()
      expect(detectedLang).toBe('en')
    })

    it('should handle errors gracefully', () => {
      Object.defineProperty(global, 'navigator', {
        get() {
          throw new Error('Navigator access denied')
        },
        configurable: true
      })
      
      const detectedLang = preferencesService.detectBrowserLanguage()
      expect(detectedLang).toBe('en')
    })
  })

  describe('Event Listener Setup', () => {
    it('should set up theme toggle event listener', () => {
      const toggleSpy = vi.spyOn(preferencesService, 'toggleTheme')
      
      // Re-initialize to set up event listeners
      preferencesService.setupEventListeners()
      
      eventBus.emit('theme:toggle')
      
      expect(toggleSpy).toHaveBeenCalled()
    })

    it('should set up language change event listener', () => {
      const changeSpy = vi.spyOn(preferencesService, 'changeLanguage')
      
      // Re-initialize to set up event listeners
      preferencesService.setupEventListeners()
      
      eventBus.emit('language:change', { language: 'de' })
      
      expect(changeSpy).toHaveBeenCalledWith('de')
    })

    it('should handle missing eventBus gracefully', () => {
      const serviceWithoutEventBus = new PreferencesService({
        storage: mockStorage,
        eventBus: null,
        i18n: mockI18n
      })
      
      expect(() => {
        serviceWithoutEventBus.setupEventListeners()
      }).not.toThrow()
    })
  })

  describe('Integration with Settings', () => {
    it('should persist theme changes to storage', () => {
      preferencesService.init()
      
      eventBus.emit('theme:toggle')
      
      expect(mockStorage.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'dark' })
      )
    })

    it('should persist language changes to storage', async () => {
      preferencesService.init()
      
      eventBus.emit('language:change', { language: 'fr' })
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(mockStorage.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'fr' })
      )
    })

    it('should emit preferences:changed events', () => {
      const changesSpy = vi.fn()
      eventBus.on('preferences:changed', changesSpy)
      
      preferencesService.init()
      eventBus.emit('theme:toggle')
      
      expect(changesSpy).toHaveBeenCalledWith({
        key: 'theme',
        value: 'dark'
      })
      
      eventBus.off('preferences:changed', changesSpy)
    })
  })
}) 