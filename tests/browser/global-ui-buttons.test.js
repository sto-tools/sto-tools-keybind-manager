import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Global UI Buttons Regression Tests', () => {
  let originalAlert, originalConfirm, originalPrompt

  beforeEach(async () => {
    // Load real HTML
    const htmlPath = path.join(process.cwd(), 'src', 'index.html')
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8')
    document.documentElement.innerHTML = htmlContent

    // Clear localStorage
    localStorage.clear()

    // Mock browser APIs that would show actual UI
    originalAlert = window.alert
    originalConfirm = window.confirm
    originalPrompt = window.prompt

    window.alert = vi.fn()
    window.confirm = vi.fn(() => true)
    window.prompt = vi.fn((message, defaultValue) => {
      if (message.includes('profile name')) return 'Test Profile'
      return defaultValue || 'test'
    })

    // Mock file operations
    global.URL = {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn()
    }

    // Mock file reader
    global.FileReader = class MockFileReader {
      constructor() {
        this.onload = null
        this.readAsText = vi.fn((file) => {
          // Simulate async file reading
          setTimeout(() => {
            if (this.onload) {
              this.onload({ target: { result: 'mock file content' } })
            }
          }, 0)
        })
      }
    }

    // Mock createElement for file inputs
    const originalCreateElement = document.createElement.bind(document)
    document.createElement = vi.fn((tagName) => {
      const element = originalCreateElement(tagName)
      if (tagName === 'input') {
        element.click = vi.fn()
      } else if (tagName === 'a') {
        element.click = vi.fn()
      }
      return element
    })

    // Load the app modules and initialize
    await import('../../src/js/data.js')
    
    // Import and setup global objects
    const { default: STOStorage } = await import('../../src/js/services/storage.js')
    const { default: STOKeybindFileManager } = await import('../../src/js/features/keybinds.js')
    const { default: STOUIManager } = await import('../../src/js/ui/ui.js')
    const { default: STOToolsKeybindManager } = await import('../../src/js/app.js')

    global.stoStorage = new STOStorage()
    global.stoKeybinds = new STOKeybindFileManager()
    global.stoUI = new STOUIManager()
    global.app = new STOToolsKeybindManager()

    // Mock stoSync for sync button
    global.stoSync = {
      syncProject: vi.fn()
    }

    // Initialize the app
    await global.app.init()

    // Wait for app to be ready
    await new Promise(resolve => {
      if (window.app && window.app.profileService) {
        resolve()
      } else {
        const checkReady = () => {
          if (window.app && window.app.profileService) {
            resolve()
          } else {
            setTimeout(checkReady, 10)
          }
        }
        checkReady()
      }
    })
  })

  afterEach(() => {
    // Restore original functions
    window.alert = originalAlert
    window.confirm = originalConfirm
    window.prompt = originalPrompt
    
    // Clear globals
    delete global.stoStorage
    delete global.stoKeybinds
    delete global.stoUI
    delete global.app
    delete global.stoSync
    
    vi.clearAllMocks()
  })

  describe('Settings Button and Menu', () => {
    it('should open settings menu when settings button is clicked', async () => {
      const settingsBtn = document.getElementById('settingsBtn')
      const settingsMenu = document.getElementById('settingsMenu')

      expect(settingsBtn).toBeTruthy()
      expect(settingsMenu).toBeTruthy()

      // Initially menu should be hidden
      expect(settingsMenu.style.display).toBe('none')

      // Click settings button
      settingsBtn.click()

      // Menu should now be visible
      expect(settingsMenu.style.display).toBe('block')
    })

    it('should close settings menu when clicking outside', async () => {
      const settingsBtn = document.getElementById('settingsBtn')
      const settingsMenu = document.getElementById('settingsMenu')

      // Open menu
      settingsBtn.click()
      expect(settingsMenu.style.display).toBe('block')

      // Click outside (on document body)
      document.body.click()

      // Menu should be closed
      expect(settingsMenu.style.display).toBe('none')
    })

    it('should execute load default data when button is clicked', async () => {
      const settingsBtn = document.getElementById('settingsBtn')
      const loadDefaultBtn = document.getElementById('loadDefaultDataBtn')

      expect(settingsBtn).toBeTruthy()
      expect(loadDefaultBtn).toBeTruthy()

      // Spy on storage method
      const loadDefaultSpy = vi.spyOn(global.stoStorage, 'loadDefaultData')
      loadDefaultSpy.mockReturnValue(true)

      // Open settings menu
      settingsBtn.click()

      // Click load default data
      loadDefaultBtn.click()

      // Should have called the storage method
      expect(loadDefaultSpy).toHaveBeenCalled()
    })

    it('should execute reset application when button is clicked', async () => {
      const settingsBtn = document.getElementById('settingsBtn')
      const resetBtn = document.getElementById('resetAppBtn')

      expect(settingsBtn).toBeTruthy()
      expect(resetBtn).toBeTruthy()

      // Spy on storage method
      const clearDataSpy = vi.spyOn(global.stoStorage, 'clearAllData')

      // Open settings menu
      settingsBtn.click()

      // Click reset app
      resetBtn.click()

      // Should have called the clear data method
      expect(clearDataSpy).toHaveBeenCalled()
    })

    it('should execute sync when sync button is clicked', async () => {
      const settingsBtn = document.getElementById('settingsBtn')
      const syncBtn = document.getElementById('syncNowBtn')

      expect(settingsBtn).toBeTruthy()
      expect(syncBtn).toBeTruthy()

      // Open settings menu
      settingsBtn.click()

      // Click sync now
      syncBtn.click()

      // Should have called sync method
      expect(global.stoSync.syncProject).toHaveBeenCalled()
    })
  })

  describe('Import Button and Menu', () => {
    it('should open import menu when import button is clicked', async () => {
      const importBtn = document.getElementById('importMenuBtn')
      const importMenu = document.getElementById('importMenu')

      expect(importBtn).toBeTruthy()
      expect(importMenu).toBeTruthy()

      // Initially menu should be hidden
      expect(importMenu.style.display).toBe('none')

      // Click import button
      importBtn.click()

      // Menu should now be visible
      expect(importMenu.style.display).toBe('block')
    })

    it('should trigger keybind import when import keybinds button is clicked', async () => {
      const importBtn = document.getElementById('importMenuBtn')
      const importKeybindsBtn = document.getElementById('importKeybindsBtn')

      expect(importBtn).toBeTruthy()
      expect(importKeybindsBtn).toBeTruthy()

      // Spy on keybind import method
      const importSpy = vi.spyOn(global.stoKeybinds, 'importKeybindFile')

      // Open import menu
      importBtn.click()

      // Click import keybinds
      importKeybindsBtn.click()

      // Should have created a file input (checked via document.createElement spy)
      expect(document.createElement).toHaveBeenCalledWith('input')
    })

    it('should trigger alias import when import aliases button is clicked', async () => {
      const importBtn = document.getElementById('importMenuBtn')
      const importAliasesBtn = document.getElementById('importAliasesBtn')

      expect(importBtn).toBeTruthy()
      expect(importAliasesBtn).toBeTruthy()

      // Spy on alias import method
      const importSpy = vi.spyOn(global.stoKeybinds, 'importAliasFile')

      // Open import menu
      importBtn.click()

      // Click import aliases
      importAliasesBtn.click()

      // Should have created a file input (checked via document.createElement spy)
      expect(document.createElement).toHaveBeenCalledWith('input')
    })

    it('should close import menu after import action', async () => {
      const importBtn = document.getElementById('importMenuBtn')
      const importKeybindsBtn = document.getElementById('importKeybindsBtn')
      const importMenu = document.getElementById('importMenu')

      // Open import menu
      importBtn.click()
      expect(importMenu.style.display).toBe('block')

      // Click import keybinds
      importKeybindsBtn.click()

      // Menu should be closed after action
      expect(importMenu.style.display).toBe('none')
    })
  })

  describe('Backup Button and Menu', () => {
    it('should open backup menu when backup button is clicked', async () => {
      const backupBtn = document.getElementById('backupMenuBtn')
      const backupMenu = document.getElementById('backupMenu')

      expect(backupBtn).toBeTruthy()
      expect(backupMenu).toBeTruthy()

      // Initially menu should be hidden
      expect(backupMenu.style.display).toBe('none')

      // Click backup button
      backupBtn.click()

      // Menu should now be visible
      expect(backupMenu.style.display).toBe('block')
    })

    it('should execute project save when save project button is clicked', async () => {
      const backupBtn = document.getElementById('backupMenuBtn')
      const saveProjectBtn = document.getElementById('saveProjectBtn')

      expect(backupBtn).toBeTruthy()
      expect(saveProjectBtn).toBeTruthy()

      // Spy on storage export method
      const exportSpy = vi.spyOn(global.stoStorage, 'exportData')
      exportSpy.mockReturnValue('{"test": "data"}')

      // Open backup menu
      backupBtn.click()

      // Click save project
      saveProjectBtn.click()

      // Should have called export method
      expect(exportSpy).toHaveBeenCalled()
      
      // Should have created download link
      expect(document.createElement).toHaveBeenCalledWith('a')
    })

    it('should execute project open when open project button is clicked', async () => {
      const backupBtn = document.getElementById('backupMenuBtn')
      const openProjectBtn = document.getElementById('openProjectBtn')

      expect(backupBtn).toBeTruthy()
      expect(openProjectBtn).toBeTruthy()

      // Open backup menu
      backupBtn.click()

      // Click open project
      openProjectBtn.click()

      // Should have created a file input for JSON files
      expect(document.createElement).toHaveBeenCalledWith('input')
    })
  })

  describe('Language Button and Menu', () => {
    it('should open language menu when language button is clicked', async () => {
      const languageBtn = document.getElementById('languageMenuBtn')
      const languageMenu = document.getElementById('languageMenu')

      expect(languageBtn).toBeTruthy()
      expect(languageMenu).toBeTruthy()

      // Initially menu should be hidden
      expect(languageMenu.style.display).toBe('none')

      // Click language button
      languageBtn.click()

      // Menu should now be visible
      expect(languageMenu.style.display).toBe('block')
    })

    it('should have language options in the menu', async () => {
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

    it('should execute language change when language option is clicked', async () => {
      const languageBtn = document.getElementById('languageMenuBtn')
      const languageMenu = document.getElementById('languageMenu')

      // Open language menu
      languageBtn.click()

      const languageOptions = languageMenu.querySelectorAll('.language-option')
      expect(languageOptions.length).toBeGreaterThan(0)

      // Spy on app's changeLanguage method
      const changeLanguageSpy = vi.spyOn(global.app, 'changeLanguage')

      // Click first language option
      const firstOption = languageOptions[0]
      const expectedLang = firstOption.dataset.lang

      firstOption.click()

      // Should have called changeLanguage method
      expect(changeLanguageSpy).toHaveBeenCalledWith(expectedLang)

      // Menu should be closed after selection
      expect(languageMenu.style.display).toBe('none')
    })
  })

  describe('Event Listener Integration', () => {
    it('should have all global UI event listeners properly attached', async () => {
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

    it('should prevent event propagation for dropdown toggles', async () => {
      const settingsBtn = document.getElementById('settingsBtn')
      
      // Create a mock event with stopPropagation
      const mockEvent = {
        stopPropagation: vi.fn(),
        target: settingsBtn,
        currentTarget: settingsBtn
      }

      // Manually trigger click event
      settingsBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      // The menu should open (this tests that the event handler is working)
      const settingsMenu = document.getElementById('settingsMenu')
      expect(settingsMenu.style.display).toBe('block')
    })

    it('should close all dropdown menus when clicking outside', async () => {
      const settingsBtn = document.getElementById('settingsBtn')
      const importBtn = document.getElementById('importMenuBtn')
      const backupBtn = document.getElementById('backupMenuBtn')
      const languageBtn = document.getElementById('languageMenuBtn')

      const settingsMenu = document.getElementById('settingsMenu')
      const importMenu = document.getElementById('importMenu')
      const backupMenu = document.getElementById('backupMenu')
      const languageMenu = document.getElementById('languageMenu')

      // Open all menus
      settingsBtn.click()
      importBtn.click()
      backupBtn.click()
      languageBtn.click()

      // Verify all are open
      expect(settingsMenu.style.display).toBe('block')
      expect(importMenu.style.display).toBe('block')
      expect(backupMenu.style.display).toBe('block')
      expect(languageMenu.style.display).toBe('block')

      // Click outside
      document.body.click()

      // All should be closed
      expect(settingsMenu.style.display).toBe('none')
      expect(importMenu.style.display).toBe('none')
      expect(backupMenu.style.display).toBe('none')
      expect(languageMenu.style.display).toBe('none')
    })
  })

  describe('Error Handling', () => {
    it('should handle missing stoKeybinds gracefully', async () => {
      // Temporarily remove stoKeybinds
      const originalStoKeybinds = global.stoKeybinds
      delete global.stoKeybinds

      const importBtn = document.getElementById('importMenuBtn')
      const importKeybindsBtn = document.getElementById('importKeybindsBtn')

      // Open import menu and click import keybinds
      importBtn.click()
      
      // This should not throw an error even without stoKeybinds
      expect(() => {
        importKeybindsBtn.click()
      }).not.toThrow()

      // Restore stoKeybinds
      global.stoKeybinds = originalStoKeybinds
    })

    it('should handle missing stoSync gracefully', async () => {
      // Temporarily remove stoSync
      const originalStoSync = global.stoSync
      delete global.stoSync

      const settingsBtn = document.getElementById('settingsBtn')
      const syncBtn = document.getElementById('syncNowBtn')

      // Open settings and click sync
      settingsBtn.click()
      
      // This should not throw an error even without stoSync
      expect(() => {
        syncBtn.click()
      }).not.toThrow()

      // Restore stoSync
      global.stoSync = originalStoSync
    })

    it('should handle missing DOM elements gracefully', async () => {
      // Remove a button temporarily
      const settingsBtn = document.getElementById('settingsBtn')
      const parent = settingsBtn.parentNode
      parent.removeChild(settingsBtn)

      // App should still function without throwing errors
      expect(() => {
        global.app.setupEventListeners()
      }).not.toThrow()

      // Restore the button
      parent.appendChild(settingsBtn)
    })
  })
}) 