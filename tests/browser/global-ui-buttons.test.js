import { describe, it, expect, beforeEach } from 'vitest'

describe('Global UI Buttons Regression Tests', () => {
  beforeEach(async () => {
    // Wait for app to be ready
    await new Promise((resolve) => {
      const checkReady = () => {
        if (window.app && window.app.profileService) {
          resolve()
        } else {
          setTimeout(checkReady, 10)
        }
      }
      checkReady()
    })
  })

  describe('Settings Button and Menu', () => {
    it('should have settings button and menu in DOM', () => {
      const settingsBtn = document.getElementById('settingsBtn')
      const settingsMenu = document.getElementById('settingsMenu')

      expect(settingsBtn).toBeTruthy()
      expect(settingsMenu).toBeTruthy()
    })

    it('should toggle settings menu visibility when button is clicked', () => {
      const settingsBtn = document.getElementById('settingsBtn')
      const dropdown = settingsBtn.closest('.dropdown')

      // Initially dropdown should not have active class
      expect(dropdown.classList.contains('active')).toBe(false)

      // Click settings button
      settingsBtn.click()

      // Dropdown should now have active class
      expect(dropdown.classList.contains('active')).toBe(true)
      
      // Click again to close
      settingsBtn.click()
      
      // Dropdown should not have active class again
      expect(dropdown.classList.contains('active')).toBe(false)
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

    it('should toggle import menu visibility when button is clicked', () => {
      const importBtn = document.getElementById('importMenuBtn')
      const dropdown = importBtn.closest('.dropdown')

      // Initially dropdown should not have active class
      expect(dropdown.classList.contains('active')).toBe(false)

      // Click import button
      importBtn.click()

      // Dropdown should now have active class
      expect(dropdown.classList.contains('active')).toBe(true)
      
      // Click again to close
      importBtn.click()
      
      // Dropdown should not have active class again
      expect(dropdown.classList.contains('active')).toBe(false)
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

    it('should toggle backup menu visibility when button is clicked', () => {
      const backupBtn = document.getElementById('backupMenuBtn')
      const dropdown = backupBtn.closest('.dropdown')

      // Initially dropdown should not have active class
      expect(dropdown.classList.contains('active')).toBe(false)

      // Click backup button
      backupBtn.click()

      // Dropdown should now have active class
      expect(dropdown.classList.contains('active')).toBe(true)
      
      // Click again to close
      backupBtn.click()
      
      // Dropdown should not have active class again
      expect(dropdown.classList.contains('active')).toBe(false)
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

    it('should toggle language menu visibility when button is clicked', () => {
      const languageBtn = document.getElementById('languageMenuBtn')
      const dropdown = languageBtn.closest('.dropdown')

      // Initially dropdown should not have active class
      expect(dropdown.classList.contains('active')).toBe(false)

      // Click language button
      languageBtn.click()

      // Dropdown should now have active class
      expect(dropdown.classList.contains('active')).toBe(true)
      
      // Click again to close
      languageBtn.click()
      
      // Dropdown should not have active class again
      expect(dropdown.classList.contains('active')).toBe(false)
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

  describe('Comprehensive Button Test', () => {
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
      const dropdownButtons = [
        'settingsBtn',
        'importMenuBtn',
        'backupMenuBtn',
        'languageMenuBtn'
      ]

      dropdownButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId)
        expect(() => {
          button.click()
        }).not.toThrow(`Clicking ${buttonId} should not throw an error`)
      })
    })
  })
}) 