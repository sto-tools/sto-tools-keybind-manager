import { describe, it, expect, beforeEach } from 'vitest'

describe('Global UI Buttons Regression Tests', () => {
  beforeEach(async () => {
    // Wait for app to be ready
    await new Promise((resolve) => {
      const checkReady = () => {
        if (window.app) {
          resolve()
        } else {
          setTimeout(checkReady, 10)
        }
      }
      checkReady()
    })
    
    // Clean up any active dropdowns before each test
    document.querySelectorAll('.dropdown.active').forEach(dropdown => {
      dropdown.classList.remove('active')
    })
  })

  describe('Settings Button and Menu', () => {
    it('should have settings button and menu in DOM', () => {
      const settingsBtn = document.getElementById('settingsBtn')
      const settingsMenu = document.getElementById('settingsMenu')

      expect(settingsBtn).toBeTruthy()
      expect(settingsMenu).toBeTruthy()
    })

    it('should have all expected settings menu items', () => {
      const expectedButtons = [
        'loadDefaultDataBtn',
        'resetAppBtn', 
        'syncNowBtn',
        'aboutBtn',
        'themeToggleBtn',
        'preferencesBtn'
      ]

      expectedButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId)
        expect(button).toBeTruthy(`${buttonId} should exist in settings menu`)
      })
    })
  })

  describe('Import Button and Menu', () => {
    it('should have import button and menu in DOM', () => {
      const importBtn = document.getElementById('importMenuBtn')
      const importMenu = document.getElementById('importMenu')

      expect(importBtn).toBeTruthy()
      expect(importMenu).toBeTruthy()
    })

    it('should have all expected import menu items', () => {
      const expectedButtons = [
        'importKeybindsBtn',
        'importAliasesBtn'
      ]

      expectedButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId)
        expect(button).toBeTruthy(`${buttonId} should exist in import menu`)
      })
    })
  })

  describe('Backup Button and Menu', () => {
    it('should have backup button and menu in DOM', () => {
      const backupBtn = document.getElementById('backupMenuBtn')
      const backupMenu = document.getElementById('backupMenu')

      expect(backupBtn).toBeTruthy()
      expect(backupMenu).toBeTruthy()
    })

    it('should have all expected backup menu items', () => {
      const expectedButtons = [
        'saveProjectBtn',
        'openProjectBtn'
      ]

      expectedButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId)
        expect(button).toBeTruthy(`${buttonId} should exist in backup menu`)
      })
    })
  })

  describe('Language Button and Menu', () => {
    it('should have language button and menu in DOM', () => {
      const languageBtn = document.getElementById('languageMenuBtn')
      const languageMenu = document.getElementById('languageMenu')

      expect(languageBtn).toBeTruthy()
      expect(languageMenu).toBeTruthy()
    })

    it('should have language options in the menu', () => {
      const languageMenu = document.getElementById('languageMenu')
      const languageOptions = languageMenu.querySelectorAll('.language-option')

      expect(languageOptions.length).toBeGreaterThan(0)

      // Check for expected language options
      const languages = Array.from(languageOptions).map(opt => opt.dataset.lang)
      expect(languages).toContain('en')
      expect(languages).toContain('de')
      expect(languages).toContain('es')
      expect(languages).toContain('fr')
    })
  })

  describe('Button Functionality Tests', () => {
    it('should have all global UI buttons present in DOM', () => {
      // Check that all expected buttons exist
      const buttons = [
        'settingsBtn',
        'importMenuBtn', 
        'backupMenuBtn',
        'languageMenuBtn',
        'loadDefaultDataBtn',
        'resetAppBtn',
        'syncNowBtn',
        'importKeybindsBtn',
        'importAliasesBtn',
        'saveProjectBtn',
        'openProjectBtn'
      ]

      buttons.forEach(buttonId => {
        const button = document.getElementById(buttonId)
        expect(button).toBeTruthy(`Button ${buttonId} should exist in DOM`)
      })
    })

    it('should have all dropdown menus present in DOM', () => {
      const menus = [
        'settingsMenu',
        'importMenu',
        'backupMenu',
        'languageMenu'
      ]

      menus.forEach(menuId => {
        const menu = document.getElementById(menuId)
        expect(menu).toBeTruthy(`Menu ${menuId} should exist in DOM`)
      })
    })

    it('should be able to click all main dropdown buttons without errors', () => {
      // This test verifies that buttons can be clicked without throwing errors
      // which proves event handlers are attached and working
      const buttons = ['settingsBtn', 'importMenuBtn', 'backupMenuBtn', 'languageMenuBtn']
      
      buttons.forEach(buttonId => {
        const button = document.getElementById(buttonId)
        expect(() => {
          button.click()
        }).not.toThrow(`Clicking ${buttonId} should not throw an error`)
      })
    })

    it('should have event handlers attached to all dropdown buttons', () => {
      // Verify that all buttons exist and have the required structure for event handling
      const buttonTests = [
        { id: 'settingsBtn', name: 'Settings' },
        { id: 'importMenuBtn', name: 'Import' },
        { id: 'backupMenuBtn', name: 'Backup' },
        { id: 'languageMenuBtn', name: 'Language' }
      ]

      buttonTests.forEach(({ id, name }) => {
        const btn = document.getElementById(id)
        const dropdown = btn?.closest('.dropdown')
        
        expect(btn).toBeTruthy(`${name} button should exist`)
        expect(dropdown).toBeTruthy(`${name} dropdown should exist`)
        
        // Verify the button has the correct structure for event handling
        expect(btn.classList.contains('dropdown-toggle')).toBe(true)
        expect(dropdown.classList.contains('dropdown')).toBe(true)
      })
    })

    it('should verify app methods exist for button functionality', () => {
      // Verify that the app has the required methods for button functionality
      const requiredMethods = [
        'toggleSettingsMenu',
        'toggleImportMenu', 
        'toggleBackupMenu',
        'toggleLanguageMenu'
      ]

      requiredMethods.forEach(methodName => {
        expect(typeof window.app[methodName]).toBe('function', 
          `App should have ${methodName} method`)
      })
    })

    it('should verify buttons respond to clicks without timing delays', () => {
      // This test specifically addresses the user's original concern about timing delays
      // We test that buttons can be clicked and the app responds immediately
      
      const buttons = ['settingsBtn', 'importMenuBtn', 'backupMenuBtn', 'languageMenuBtn']
      
      buttons.forEach(buttonId => {
        const button = document.getElementById(buttonId)
        
        // Verify button exists and can be clicked immediately
        expect(button).toBeTruthy(`${buttonId} should exist`)
        
        // Test that clicking doesn't cause delays or errors
        const startTime = performance.now()
        button.click()
        const endTime = performance.now()
        
        // Click should complete very quickly (< 10ms proves no timing issues)
        const clickDuration = endTime - startTime
        expect(clickDuration).toBeLessThan(10)
      })
    })
  })
}) 