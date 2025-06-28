import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import PreferencesService from '../../src/js/components/services/PreferencesService.js'
import HeaderMenuUI from '../../src/js/components/ui/HeaderMenuUI.js'
import StorageService from '../../src/js/components/services/StorageService.js'

describe('Theme and Language Integration', () => {
  let preferencesService
  let headerMenuUI
  let storageService
  let mockI18n

  beforeEach(() => {
    // Reset DOM to match the actual application structure
    document.documentElement.removeAttribute('data-theme')
    document.body.className = ''
    document.body.innerHTML = `
      <header class="app-header">
        <div class="header-right">
          <!-- Language Menu -->
          <div class="dropdown language-select">
            <button class="btn btn-icon dropdown-toggle" id="languageMenuBtn" data-i18n-title="language">
              <span id="languageFlag" class="fi fi-gb"></span>
            </button>
            <div class="dropdown-menu" id="languageMenu">
              <button class="dropdown-item language-option" data-lang="en">
                <span class="fi fi-gb"></span>
                <span>English</span>
              </button>
              <button class="dropdown-item language-option" data-lang="de">
                <span class="fi fi-de"></span>
                <span>Deutsch</span>
              </button>
              <button class="dropdown-item language-option" data-lang="es">
                <span class="fi fi-es"></span>
                <span>Español</span>
              </button>
              <button class="dropdown-item language-option" data-lang="fr">
                <span class="fi fi-fr"></span>
                <span>Français</span>
              </button>
            </div>
          </div>
          
          <!-- Settings Menu -->
          <div class="dropdown">
            <button class="btn btn-icon dropdown-toggle" id="settingsBtn" data-i18n-title="settings">
              <i class="fas fa-cog"></i>
            </button>
            <div class="dropdown-menu" id="settingsMenu">
              <button class="dropdown-item" id="themeToggleBtn">
                <i class="fas fa-moon"></i>
                <span id="themeToggleText" data-i18n="dark_mode">Dark Mode</span>
              </button>
            </div>
          </div>
        </div>
      </header>
    `

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

    // Initialize services
    storageService = new StorageService(eventBus)
    preferencesService = new PreferencesService({
      storage: storageService,
      eventBus,
      i18n: mockI18n
    })
    headerMenuUI = new HeaderMenuUI({ eventBus })

    // Initialize components
    preferencesService.init()
    headerMenuUI.init()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Theme Integration', () => {
    it('should toggle theme when theme button is clicked', async () => {
      const themeToggleBtn = document.getElementById('themeToggleBtn')
      
      // Initial state should be light theme
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
      
      // Click the theme toggle button
      themeToggleBtn.click()
      
      // Should switch to dark theme
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      
      // Button should update to show light mode option
      const themeIcon = themeToggleBtn.querySelector('i')
      const themeText = document.getElementById('themeToggleText')
      expect(themeIcon.className).toBe('fas fa-sun')
      expect(themeText.textContent).toBe('Light Mode')
      
      // Click again to toggle back
      themeToggleBtn.click()
      
      // Should switch back to light theme
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
      expect(themeIcon.className).toBe('fas fa-moon')
      expect(themeText.textContent).toBe('Dark Mode')
    })

    it('should persist theme changes across service reinitialization', () => {
      const themeToggleBtn = document.getElementById('themeToggleBtn')
      
      // Toggle to dark theme
      themeToggleBtn.click()
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      
      // Reinitialize preferences service (simulating app restart)
      const newPreferencesService = new PreferencesService({
        storage: storageService,
        eventBus,
        i18n: mockI18n
      })
      newPreferencesService.init()
      
      // Theme should still be dark
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('should emit toast notification on theme change', () => {
      const toastSpy = vi.fn()
      eventBus.on('toast:show', toastSpy)
      
      const themeToggleBtn = document.getElementById('themeToggleBtn')
      themeToggleBtn.click()
      
      expect(toastSpy).toHaveBeenCalledWith({
        message: 'Switched to Dark Mode',
        type: 'success'
      })
      
      eventBus.off('toast:show', toastSpy)
    })
  })

  describe('Language Integration', () => {
    it('should change language when language option is clicked', async () => {
      const germanOption = document.querySelector('[data-lang="de"]')
      
      // Initial state should be English
      expect(mockI18n.language).toBe('en')
      
      // Click the German option
      germanOption.click()
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Should change language to German
      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('de')
      expect(window.localizeCommandData).toHaveBeenCalled()
      expect(window.applyTranslations).toHaveBeenCalled()
      
      // Language flag should update
      const languageFlag = document.getElementById('languageFlag')
      expect(languageFlag.className).toBe('fi fi-de')
    })

    it('should update language flag for all supported languages', async () => {
      const languageFlag = document.getElementById('languageFlag')
      const testCases = [
        { lang: 'en', expectedClass: 'fi fi-gb', selector: '[data-lang="en"]' },
        { lang: 'de', expectedClass: 'fi fi-de', selector: '[data-lang="de"]' },
        { lang: 'es', expectedClass: 'fi fi-es', selector: '[data-lang="es"]' },
        { lang: 'fr', expectedClass: 'fi fi-fr', selector: '[data-lang="fr"]' }
      ]
      
      for (const { lang, expectedClass, selector } of testCases) {
        const option = document.querySelector(selector)
        option.click()
        
        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 10))
        
        expect(languageFlag.className).toBe(expectedClass)
      }
    })

    it('should emit language:changed event for other components', async () => {
      const languageChangedSpy = vi.fn()
      eventBus.on('language:changed', languageChangedSpy)
      
      const frenchOption = document.querySelector('[data-lang="fr"]')
      frenchOption.click()
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(languageChangedSpy).toHaveBeenCalledWith({ language: 'fr' })
      
      eventBus.off('language:changed', languageChangedSpy)
    })

    it('should persist language changes across service reinitialization', async () => {
      const spanishOption = document.querySelector('[data-lang="es"]')
      
      // Change to Spanish
      spanishOption.click()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Reinitialize preferences service (simulating app restart)
      const newPreferencesService = new PreferencesService({
        storage: storageService,
        eventBus,
        i18n: mockI18n
      })
      newPreferencesService.init()
      
      // Language flag should still show Spanish
      const languageFlag = document.getElementById('languageFlag')
      expect(languageFlag.className).toBe('fi fi-es')
    })

    it('should emit toast notification on language change', async () => {
      const toastSpy = vi.fn()
      eventBus.on('toast:show', toastSpy)
      
      const germanOption = document.querySelector('[data-lang="de"]')
      germanOption.click()
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(toastSpy).toHaveBeenCalledWith({
        message: 'Language updated',
        type: 'success'
      })
      
      eventBus.off('toast:show', toastSpy)
    })
  })

  describe('Combined Theme and Language Functionality', () => {
    it('should maintain theme when language changes', async () => {
      const themeToggleBtn = document.getElementById('themeToggleBtn')
      const germanOption = document.querySelector('[data-lang="de"]')
      
      // Set dark theme
      themeToggleBtn.click()
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      
      // Change language
      germanOption.click()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Theme should still be dark
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      
      // Language flag should be German
      const languageFlag = document.getElementById('languageFlag')
      expect(languageFlag.className).toBe('fi fi-de')
    })

    it('should maintain language when theme changes', async () => {
      const themeToggleBtn = document.getElementById('themeToggleBtn')
      const frenchOption = document.querySelector('[data-lang="fr"]')
      
      // Set French language
      frenchOption.click()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const languageFlag = document.getElementById('languageFlag')
      expect(languageFlag.className).toBe('fi fi-fr')
      
      // Change theme
      themeToggleBtn.click()
      
      // Language should still be French
      expect(languageFlag.className).toBe('fi fi-fr')
      
      // Theme should be dark
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('should handle rapid theme and language changes gracefully', async () => {
      const themeToggleBtn = document.getElementById('themeToggleBtn')
      const languageOptions = document.querySelectorAll('[data-lang]')
      
      // Rapid changes
      themeToggleBtn.click() // dark
      languageOptions[1].click() // de
      themeToggleBtn.click() // light
      languageOptions[2].click() // es
      themeToggleBtn.click() // dark
      languageOptions[3].click() // fr
      
      // Wait for all async operations
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Final state should be: dark theme, French language
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      const languageFlag = document.getElementById('languageFlag')
      expect(languageFlag.className).toBe('fi fi-fr')
    })
  })

  describe('Error Handling', () => {
    it('should handle missing DOM elements gracefully', () => {
      // Remove critical elements
      document.getElementById('themeToggleBtn')?.remove()
      document.getElementById('languageFlag')?.remove()
      
      expect(() => {
        eventBus.emit('theme:toggle')
        eventBus.emit('language:change', { language: 'de' })
      }).not.toThrow()
    })

    it('should handle i18n errors gracefully', async () => {
      mockI18n.changeLanguage.mockRejectedValue(new Error('i18n error'))
      
      const germanOption = document.querySelector('[data-lang="de"]')
      
      expect(() => {
        germanOption.click()
      }).not.toThrow()
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10))
    })

    it('should handle storage errors gracefully', () => {
      // Mock storage to throw errors
      vi.spyOn(storageService, 'saveSettings').mockImplementation(() => {
        throw new Error('Storage error')
      })
      
      const themeToggleBtn = document.getElementById('themeToggleBtn')
      
      expect(() => {
        themeToggleBtn.click()
      }).not.toThrow()
    })
  })
}) 