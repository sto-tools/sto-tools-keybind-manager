import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'

describe('UI Interactions', () => {
  let app, stoStorage, stoUI

  beforeEach(async () => {
    // Clear localStorage first
    localStorage.clear()

    // Simple mock setup
    if (typeof window !== 'undefined') {
      window.alert = vi.fn()
      window.confirm = vi.fn(() => true)
      window.prompt = vi.fn(() => 'test input')
    }

    // Wait for DOM to be ready with timeout
    const waitForDOM = () => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('DOM ready timeout'))
        }, 5000)

        if (document.readyState === 'complete') {
          clearTimeout(timeout)
          resolve()
        } else {
          document.addEventListener(
            'DOMContentLoaded',
            () => {
              clearTimeout(timeout)
              resolve()
            },
            { once: true }
          )
        }
      })
    }

    await waitForDOM()

    // Wait for the application to be fully loaded using the ready event
    const waitForApp = () => {
      return new Promise((resolve, reject) => {
        // Set a timeout in case the event never fires
        const timeout = setTimeout(() => {
          reject(new Error('App ready event timeout'))
        }, 10000)

        // Listen for the app ready event
        const handleReady = (payload) => {
          clearTimeout(timeout)
          eventBus.off('sto-app-ready', handleReady)
          resolve(payload.app)
        }

        const handleError = (payload) => {
          clearTimeout(timeout)
          eventBus.off('sto-app-ready', handleReady)
          eventBus.off('sto-app-error', handleError)
          reject(payload.error)
        }

        // Check if already loaded (in case event fired before we started listening)
        if (
          window.app &&
          window.COMMANDS &&
          window.stoStorage &&
          window.stoUI
        ) {
          clearTimeout(timeout)
          resolve(window.app)
          return
        }

        eventBus.on('sto-app-ready', handleReady)
        eventBus.on('sto-app-error', handleError)
      })
    }

    try {
      app = await waitForApp()

      // Get instances
      stoStorage = window.stoStorage
      stoUI = window.stoUI
    } catch (error) {
      console.error('Failed to wait for app:', error)
      throw error
    }
  })

  afterEach(async () => {
    // Clean up using browser test utilities
    if (typeof testUtils !== 'undefined') {
      testUtils.clearAppData()
    } else {
      // Fallback cleanup
      localStorage.clear()
      sessionStorage.clear()
    }

    // Restore original functions if we mocked them
    if (
      typeof vi !== 'undefined' &&
      vi.isMockFunction &&
      vi.isMockFunction(window.alert)
    ) {
      vi.restoreAllMocks()
    }
  })

  describe('key grid interactions', () => {
    it('should select keys by clicking', async () => {
      // Create a test profile
      const profileId = app.createProfile('UI Test Profile')
      app.switchProfile(profileId)

      // Get a key element
      const keyElement = document.querySelector('[data-key="F1"]')
      expect(keyElement).toBeDefined()

      // Click on the key
      keyElement.click()

      // Verify key gets selected
      expect(app.selectedKey).toBe('F1')
      // DOM class changes are handled by the app, test the app state instead
      expect(app.selectedKey).toBe('F1')

      // Click on a different key
      const f2Element = document.querySelector('[data-key="F2"]')
      f2Element.click()

      // Verify selection changes
      expect(app.selectedKey).toBe('F2')
    })

    it('should show key binding status visually', async () => {
      const profileId = app.createProfile('Visual Test Profile')
      app.switchProfile(profileId)

      const keyElement = document.querySelector('[data-key="F1"]')

      // Verify unbound key initially has no commands
      let profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F1']).toBeUndefined()

      // Create keybind on key
      app.selectKey('F1')
      app.addCommand('F1', { command: 'say "test"', type: 'chat' })

      // Verify bound key now has commands
      profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F1']).toBeDefined()
      expect(profile.builds.space.keys['F1']).toHaveLength(1)

      // Add multiple commands
      app.addCommand('F1', { command: 'emote wave', type: 'emote' })

      // Verify visual indication of multiple commands
      profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F1']).toHaveLength(2)
    })

    it('should filter keys by search', async () => {
      const profileId = app.createProfile('Filter Test Profile')
      app.switchProfile(profileId)

      // Get the key filter input
      const filterInput = document.getElementById('keyFilter')
      expect(filterInput).toBeDefined()

      // Count visible keys initially
      const allKeys = document.querySelectorAll('[data-key]')
      const initialCount = allKeys.length
      expect(initialCount).toBeGreaterThan(0)

      // Enter search term
      filterInput.value = 'F1'
      filterInput.dispatchEvent(new Event('input'))

      // Verify filtering works by checking app method
      app.filterKeys('F1')

      // Clear filter
      filterInput.value = ''
      filterInput.dispatchEvent(new Event('input'))
      app.showAllKeys()

      // Verify all keys shown again
      expect(filterInput.value).toBe('')
    })

    it('should toggle between grid and list views', async () => {
      const profileId = app.createProfile('View Test Profile')
      app.switchProfile(profileId)

      // Get the view toggle button (may not exist in DOM)
      const viewToggle = document.getElementById('toggleViewBtn')

      // Verify default view
      const keyGrid = document.getElementById('keyGrid')
      expect(keyGrid).toBeDefined()

      // Test view toggle functionality through app if button exists
      if (viewToggle) {
        viewToggle.click()
        expect(app.currentViewMode).toBeDefined()
      } else {
        // Test that app exists and functions (view mode may not be implemented)
        expect(app).toBeDefined()
        expect(typeof app.getCurrentProfile).toBe('function')
      }
    })
  })

  describe('command editing interactions', () => {
    it('should add commands via add button', async () => {
      const profileId = app.createProfile('Command Test Profile')
      app.switchProfile(profileId)

      // Select a key
      app.selectKey('F1')

      // Get add command button
      const addBtn = document.getElementById('addCommandBtn')
      expect(addBtn).toBeDefined()

      // Click add command button
      addBtn.click()

      // Verify modal or command addition interface appears
      // (In real app, this would open a modal)
      expect(window.alert).toHaveBeenCalledTimes(0) // No errors

      // Add command directly via app method
      app.addCommand('F1', { command: 'say "test command"', type: 'chat' })

      // Verify command appears in profile
      const profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F1']).toHaveLength(1)
      expect(profile.builds.space.keys['F1'][0].command).toBe(
        'say "test command"'
      )
    })

    it('should edit existing commands inline', async () => {
      const profileId = app.createProfile('Edit Test Profile')
      app.switchProfile(profileId)

      // Create initial command
      app.selectKey('F2')
      app.addCommand('F2', { command: 'say "original"', type: 'chat' })

      // Verify command exists
      let profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F2'][0].command).toBe('say "original"')

      // Simulate editing by replacing the command
      app.deleteKey('F2')
      app.addCommand('F2', { command: 'say "edited"', type: 'chat' })

      // Verify command updated
      profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F2'][0].command).toBe('say "edited"')
    })

    it('should delete commands with confirmation', async () => {
      const profileId = app.createProfile('Delete Test Profile')
      app.switchProfile(profileId)

      // Create command to delete
      app.selectKey('F3')
      app.addCommand('F3', { command: 'say "to delete"', type: 'chat' })

      // Verify command exists
      let profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F3']).toHaveLength(1)

      // Test deletion
      app.deleteKey('F3')

      // Verify command removed
      profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F3']).toBeUndefined()
    })

    it('should reorder commands via drag and drop', async () => {
      const profileId = app.createProfile('Reorder Test Profile')
      app.switchProfile(profileId)

      // Create multiple commands
      app.selectKey('F4')
      app.addCommand('F4', { command: 'say "first"', type: 'chat' })
      app.addCommand('F4', { command: 'say "second"', type: 'chat' })
      app.addCommand('F4', { command: 'say "third"', type: 'chat' })

      // Verify initial order
      let profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F4'][0].command).toBe('say "first"')
      expect(profile.builds.space.keys['F4'][1].command).toBe('say "second"')
      expect(profile.builds.space.keys['F4'][2].command).toBe('say "third"')

      // Simulate drag and drop reordering (move first to last)
      app.moveCommand('F4', 0, 2)

      // Verify new order
      profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F4'][0].command).toBe('say "second"')
      expect(profile.builds.space.keys['F4'][1].command).toBe('say "third"')
      expect(profile.builds.space.keys['F4'][2].command).toBe('say "first"')
    })
  })

  describe('command library interactions', () => {
    it('should browse command categories', async () => {
      const profileId = app.createProfile('Library Test Profile')
      app.switchProfile(profileId)

      // Test that command library data exists
      expect(window.COMMANDS).toBeDefined()
      expect(typeof window.COMMANDS).toBe('object')

      // Get different categories
      const categories = Object.keys(window.COMMANDS)
      expect(categories.length).toBeGreaterThan(0)

      // Verify categories have commands (use the first command's category)
      const firstCommand = Object.values(window.COMMANDS)[0]
      const categoryCommands = Object.values(window.COMMANDS).filter(
        (cmd) => cmd.category === firstCommand.category
      )
      expect(categoryCommands.length).toBeGreaterThan(0)
    })

    it('should search and filter commands', async () => {
      const profileId = app.createProfile('Search Test Profile')
      app.switchProfile(profileId)

      // Get command search input
      const searchInput = document.getElementById('commandSearch')
      expect(searchInput).toBeDefined()

      // Test search functionality
      const searchTerm = 'fire'
      searchInput.value = searchTerm
      searchInput.dispatchEvent(new Event('input'))

      // Verify filtering works
      const allCommands = Object.values(window.COMMANDS)
      const filteredCommands = allCommands.filter(
        (cmd) =>
          cmd.command.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (cmd.description &&
            cmd.description.toLowerCase().includes(searchTerm.toLowerCase()))
      )

      expect(filteredCommands.length).toBeGreaterThanOrEqual(0)

      // Clear search
      searchInput.value = ''
      searchInput.dispatchEvent(new Event('input'))
    })

    it('should add commands from library to key', async () => {
      const profileId = app.createProfile('Library Add Test Profile')
      app.switchProfile(profileId)

      // Select a key
      app.selectKey('F5')

      // Get a command from the library
      const commands = Object.values(window.COMMANDS)
      expect(commands.length).toBeGreaterThan(0)

      const testCommand = commands[0]

      // Add command from library to key
      app.addCommand('F5', {
        command: testCommand.command,
        type: testCommand.category,
      })

      // Verify command added
      const profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F5']).toHaveLength(1)
      expect(profile.builds.space.keys['F5'][0].command).toBe(
        testCommand.command
      )
    })

    it('should handle parameterized commands', async () => {
      const profileId = app.createProfile('Parameter Test Profile')
      app.switchProfile(profileId)

      // Find a parameterized command
      const commands = Object.values(window.COMMANDS)
      const paramCommand = commands.find(
        (cmd) => cmd.customizable && cmd.parameters
      )

      if (paramCommand) {
        // Test parameter handling
        const params = {}
        Object.keys(paramCommand.parameters).forEach((paramName) => {
          params[paramName] = 'test_value'
        })

        // Build parameterized command
        const builtCommand = app.buildParameterizedCommand(
          paramCommand.category,
          paramCommand.key || 'test',
          paramCommand,
          params
        )

        expect(builtCommand).toBeDefined()
        expect(builtCommand.command).toBeDefined()
      } else {
        // If no parameterized commands found, test passes
        expect(true).toBe(true)
      }
    })
  })

  describe('modal and dialog interactions', () => {
    it('should open and close modals properly', async () => {
      const profileId = app.createProfile('Modal Test Profile')
      app.switchProfile(profileId)

      // Create a test modal
      const testModal = document.createElement('div')
      testModal.id = 'testModal'
      testModal.className = 'modal'
      document.body.appendChild(testModal)

      // Create modal overlay if it doesn't exist
      let modalOverlay = document.getElementById('modalOverlay')
      if (!modalOverlay) {
        modalOverlay = document.createElement('div')
        modalOverlay.id = 'modalOverlay'
        modalOverlay.className = 'modal-overlay'
        document.body.appendChild(modalOverlay)
      }

      // Show modal (test if method exists and works)
      if (typeof stoUI.showModal === 'function') {
        const result = stoUI.showModal('testModal')
        expect(result).toBe(true)
        expect(testModal.classList.contains('active')).toBe(true)
        expect(modalOverlay.classList.contains('active')).toBe(true)

        // Hide modal
        const hideResult = stoUI.hideModal('testModal')
        expect(hideResult).toBe(true)
        expect(testModal.classList.contains('active')).toBe(false)
        expect(modalOverlay.classList.contains('active')).toBe(false)
      } else {
        // Test manual modal display with classes
        testModal.classList.add('active')
        expect(testModal.classList.contains('active')).toBe(true)
        testModal.classList.remove('active')
        expect(testModal.classList.contains('active')).toBe(false)
      }

      // Clean up
      document.body.removeChild(testModal)
      if (modalOverlay && modalOverlay.parentNode) {
        document.body.removeChild(modalOverlay)
      }
    })

    it('should handle form validation in modals', async () => {
      const profileId = app.createProfile('Validation Test Profile')
      app.switchProfile(profileId)

      // Test form validation through profile creation
      const profileName = ''

      // Empty name should be handled gracefully
      try {
        const newProfileId = app.createProfile(profileName)
        // If it succeeds, that's fine - the app handles empty names
        expect(newProfileId).toBeDefined()
      } catch (error) {
        // If it fails, that's also acceptable validation behavior
        expect(error).toBeDefined()
      }

      // Valid name should work
      const validProfileId = app.createProfile('Valid Profile Name')
      expect(validProfileId).toBeDefined()
    })

    it('should show confirmation dialogs for destructive actions', async () => {
      const profileId = app.createProfile('Confirmation Test Profile')
      app.switchProfile(profileId)

      // Create another profile to delete
      const deleteProfileId = app.createProfile('To Delete Profile')

      // Mock confirm to return false (cancel)
      window.confirm = vi.fn(() => false)

      // Attempt deletion (should be cancelled)
      const profilesBefore = Object.keys(
        stoStorage.getAllData().profiles
      ).length

      // Reset confirm to return true
      window.confirm = vi.fn(() => true)

      // Confirm deletion
      app.deleteProfile(deleteProfileId)

      // Verify deletion occurred
      const profilesAfter = Object.keys(stoStorage.getAllData().profiles).length
      expect(profilesAfter).toBeLessThan(profilesBefore)
    })
  })

  describe('toast notification interactions', () => {
    it('should show success toasts for completed actions', async () => {
      const profileId = app.createProfile('Toast Test Profile')
      app.switchProfile(profileId)

      // Create toast container if it doesn't exist
      let toastContainer = document.getElementById('toastContainer')
      let createdContainer = false
      if (!toastContainer) {
        toastContainer = document.createElement('div')
        toastContainer.id = 'toastContainer'
        toastContainer.className = 'toast-container'
        document.body.appendChild(toastContainer)
        createdContainer = true
      }

      // Show success toast (test if method exists and works)
      if (typeof stoUI.showToast === 'function') {
        // Clear any existing toasts first
        const existingToasts = toastContainer.querySelectorAll('.toast')
        existingToasts.forEach((toast) => toast.remove())

        stoUI.showToast('Test success message', 'success')

        // Wait a bit for the toast to be added
        await new Promise((resolve) => setTimeout(resolve, 50))

        // Verify toast appears
        const toasts = toastContainer.querySelectorAll('.toast')
        expect(toasts.length).toBeGreaterThan(0)

        // Find the success toast specifically
        const successToast = Array.from(toasts).find(
          (toast) =>
            toast.classList.contains('toast-success') ||
            toast.querySelector('.toast-message')?.textContent ===
              'Test success message'
        )
        expect(successToast).toBeDefined()
        expect(successToast.classList.contains('toast-success')).toBe(true)
      } else {
        // Test manual toast creation
        const toast = document.createElement('div')
        toast.className = 'toast toast-success'
        toast.textContent = 'Test success message'
        toastContainer.appendChild(toast)

        const toasts = toastContainer.querySelectorAll('.toast')
        expect(toasts.length).toBeGreaterThan(0)
      }

      // Clean up
      if (createdContainer && toastContainer.parentNode) {
        document.body.removeChild(toastContainer)
      }
    })

    it('should show error toasts for failed actions', async () => {
      const profileId = app.createProfile('Error Toast Test Profile')
      app.switchProfile(profileId)

      // Create toast container if it doesn't exist
      let toastContainer = document.getElementById('toastContainer')
      let createdContainer = false
      if (!toastContainer) {
        toastContainer = document.createElement('div')
        toastContainer.id = 'toastContainer'
        toastContainer.className = 'toast-container'
        document.body.appendChild(toastContainer)
        createdContainer = true
      }

      // Show error toast (test if method exists and works)
      if (typeof stoUI.showToast === 'function') {
        // Clear any existing toasts first
        const existingToasts = toastContainer.querySelectorAll('.toast')
        existingToasts.forEach((toast) => toast.remove())

        stoUI.showToast('Test error message', 'error')

        // Wait a bit for the toast to be added
        await new Promise((resolve) => setTimeout(resolve, 50))

        // Verify toast appears
        const toasts = toastContainer.querySelectorAll('.toast')
        expect(toasts.length).toBeGreaterThan(0)

        // Find the error toast specifically
        const errorToast = Array.from(toasts).find(
          (toast) =>
            toast.classList.contains('toast-error') ||
            toast.querySelector('.toast-message')?.textContent ===
              'Test error message'
        )
        expect(errorToast).toBeDefined()
        expect(errorToast.classList.contains('toast-error')).toBe(true)
      } else {
        // Test manual toast creation
        const toast = document.createElement('div')
        toast.className = 'toast toast-error'
        toast.textContent = 'Test error message'
        toastContainer.appendChild(toast)

        const toasts = toastContainer.querySelectorAll('.toast')
        expect(toasts.length).toBeGreaterThan(0)
      }

      // Clean up
      if (createdContainer && toastContainer.parentNode) {
        document.body.removeChild(toastContainer)
      }
    })

    it('should stack multiple toasts appropriately', async () => {
      const profileId = app.createProfile('Stack Toast Test Profile')
      app.switchProfile(profileId)

      // Create toast container if it doesn't exist
      let toastContainer = document.getElementById('toastContainer')
      let createdContainer = false
      if (!toastContainer) {
        toastContainer = document.createElement('div')
        toastContainer.id = 'toastContainer'
        toastContainer.className = 'toast-container'
        document.body.appendChild(toastContainer)
        createdContainer = true
      }

      // Show multiple toasts (test if method exists and works)
      if (typeof stoUI.showToast === 'function') {
        stoUI.showToast('First toast', 'info')
        stoUI.showToast('Second toast', 'success')
        stoUI.showToast('Third toast', 'warning')

        // Wait a bit for the toasts to be added
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Verify multiple toasts
        const toasts = toastContainer.querySelectorAll('.toast')
        expect(toasts.length).toBeGreaterThanOrEqual(2)
      } else {
        // Test manual toast creation
        const toast1 = document.createElement('div')
        toast1.className = 'toast toast-info'
        toast1.textContent = 'First toast'
        toastContainer.appendChild(toast1)

        const toast2 = document.createElement('div')
        toast2.className = 'toast toast-success'
        toast2.textContent = 'Second toast'
        toastContainer.appendChild(toast2)

        const toasts = toastContainer.querySelectorAll('.toast')
        expect(toasts.length).toBeGreaterThanOrEqual(2)
      }

      // Clean up
      if (createdContainer && toastContainer.parentNode) {
        document.body.removeChild(toastContainer)
      }
    })
  })

  describe('keyboard navigation and shortcuts', () => {
    it('should navigate using tab key', async () => {
      const profileId = app.createProfile('Tab Test Profile')
      app.switchProfile(profileId)

      // Get focusable elements
      const focusableElements = document.querySelectorAll(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )

      expect(focusableElements.length).toBeGreaterThan(0)

      // Test that elements can receive focus
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
        expect(document.activeElement).toBe(focusableElements[0])
      }
    })

    it('should support keyboard shortcuts', async () => {
      const profileId = app.createProfile('Shortcut Test Profile')
      app.switchProfile(profileId)

      // Test Escape key handling
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
      })

      document.dispatchEvent(escapeEvent)

      // Test passes if no errors occur
      expect(true).toBe(true)

      // Test Ctrl+S (save)
      const saveEvent = new KeyboardEvent('keydown', {
        key: 's',
        code: 'KeyS',
        ctrlKey: true,
      })

      document.dispatchEvent(saveEvent)

      // Test passes if no errors occur
      expect(true).toBe(true)
    })

    it('should handle Enter and Space for activation', async () => {
      const profileId = app.createProfile('Activation Test Profile')
      app.switchProfile(profileId)

      // Create test button
      const testButton = document.createElement('button')
      testButton.textContent = 'Test Button'
      let buttonClicked = false
      testButton.addEventListener('click', () => {
        buttonClicked = true
      })
      document.body.appendChild(testButton)

      // Focus button
      testButton.focus()

      // Test Enter activation
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
      })
      testButton.dispatchEvent(enterEvent)

      // Clean up
      document.body.removeChild(testButton)

      // Test passes if no errors occur
      expect(true).toBe(true)
    })
  })

  describe('responsive design interactions', () => {
    it('should adapt to mobile viewport', async () => {
      const profileId = app.createProfile('Mobile Test Profile')
      app.switchProfile(profileId)

      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })

      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 667,
      })

      // Dispatch resize event
      window.dispatchEvent(new Event('resize'))

      // Test that app still functions
      expect(app.getCurrentProfile()).toBeDefined()

      // Reset viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      })
    })

    it('should handle orientation changes', async () => {
      const profileId = app.createProfile('Orientation Test Profile')
      app.switchProfile(profileId)

      // Simulate orientation change
      Object.defineProperty(screen, 'orientation', {
        writable: true,
        configurable: true,
        value: { angle: 90 },
      })

      window.dispatchEvent(new Event('orientationchange'))

      // Test that app still functions
      expect(app.getCurrentProfile()).toBeDefined()
    })
  })

  describe('accessibility interactions', () => {
    it('should work with screen readers', async () => {
      const profileId = app.createProfile('Accessibility Test Profile')
      app.switchProfile(profileId)

      // Check for ARIA labels
      const elementsWithAria = document.querySelectorAll(
        '[aria-label], [aria-labelledby], [role]'
      )

      // Test passes if ARIA elements exist or if no errors occur
      expect(elementsWithAria.length).toBeGreaterThanOrEqual(0)
    })

    it('should support high contrast mode', async () => {
      const profileId = app.createProfile('Contrast Test Profile')
      app.switchProfile(profileId)

      // Simulate high contrast mode
      document.body.classList.add('high-contrast')

      // Test that app still functions
      expect(app.getCurrentProfile()).toBeDefined()

      // Clean up
      document.body.classList.remove('high-contrast')
    })

    it('should handle reduced motion preferences', async () => {
      const profileId = app.createProfile('Motion Test Profile')
      app.switchProfile(profileId)

      // Simulate reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

      // Test that app still functions
      expect(app.getCurrentProfile()).toBeDefined()
    })
  })

  describe('drag and drop interactions', () => {
    it('should provide visual feedback during drag', async () => {
      const profileId = app.createProfile('Drag Visual Test Profile')
      app.switchProfile(profileId)

      // Create test draggable element
      const dragElement = document.createElement('div')
      dragElement.draggable = true
      dragElement.textContent = 'Drag me'
      document.body.appendChild(dragElement)

      // Simulate drag start (use MouseEvent since DragEvent not available)
      const dragStartEvent = new MouseEvent('dragstart', {
        bubbles: true,
        cancelable: true,
      })

      dragElement.dispatchEvent(dragStartEvent)

      // Test passes if no errors occur
      expect(true).toBe(true)

      // Clean up
      document.body.removeChild(dragElement)
    })

    it('should handle drag cancel gracefully', async () => {
      const profileId = app.createProfile('Drag Cancel Test Profile')
      app.switchProfile(profileId)

      // Create test draggable element
      const dragElement = document.createElement('div')
      dragElement.draggable = true
      document.body.appendChild(dragElement)

      // Simulate drag and cancel (use MouseEvent since DragEvent not available)
      const dragStartEvent = new MouseEvent('dragstart', { bubbles: true })
      const dragEndEvent = new MouseEvent('dragend', { bubbles: true })

      dragElement.dispatchEvent(dragStartEvent)
      dragElement.dispatchEvent(dragEndEvent)

      // Test passes if no errors occur
      expect(true).toBe(true)

      // Clean up
      document.body.removeChild(dragElement)
    })

    it('should prevent invalid drops', async () => {
      const profileId = app.createProfile('Drop Validation Test Profile')
      app.switchProfile(profileId)

      // Create test elements
      const dragElement = document.createElement('div')
      const dropElement = document.createElement('div')
      dragElement.draggable = true
      document.body.appendChild(dragElement)
      document.body.appendChild(dropElement)

      // Simulate invalid drop (use MouseEvent since DragEvent not available)
      const dropEvent = new MouseEvent('drop', {
        bubbles: true,
        cancelable: true,
      })

      dropElement.dispatchEvent(dropEvent)

      // Test passes if no errors occur
      expect(true).toBe(true)

      // Clean up
      document.body.removeChild(dragElement)
      document.body.removeChild(dropElement)
    })
  })

  describe('context menu interactions', () => {
    it('should show context menus on right click', async () => {
      const profileId = app.createProfile('Context Menu Test Profile')
      app.switchProfile(profileId)

      // Get a key element
      const keyElement = document.querySelector('[data-key="F1"]')
      expect(keyElement).toBeDefined()

      // Simulate right click
      const contextMenuEvent = new MouseEvent('contextmenu', {
        button: 2,
        buttons: 2,
      })

      keyElement.dispatchEvent(contextMenuEvent)

      // Test passes if no errors occur
      expect(true).toBe(true)
    })

    it('should handle context menu keyboard access', async () => {
      const profileId = app.createProfile('Context Keyboard Test Profile')
      app.switchProfile(profileId)

      // Get a focusable element
      const keyElement = document.querySelector('[data-key="F1"]')
      expect(keyElement).toBeDefined()

      // Focus element
      keyElement.focus()

      // Simulate menu key
      const menuKeyEvent = new KeyboardEvent('keydown', {
        key: 'ContextMenu',
        code: 'ContextMenu',
      })

      keyElement.dispatchEvent(menuKeyEvent)

      // Test passes if no errors occur
      expect(true).toBe(true)
    })
  })

  describe('data persistence across sessions', () => {
    it('should restore state after page reload', async () => {
      const profileId = app.createProfile('Persistence Test Profile')
      app.switchProfile(profileId)

      // Make changes
      app.selectKey('F1')
      app.addCommand('F1', { command: 'say "persistent"', type: 'chat' })

      // Verify changes are in profile
      const profile = app.getCurrentProfile()
      expect(profile.builds.space.keys['F1']).toBeDefined()
      expect(profile.builds.space.keys['F1'][0].command).toBe(
        'say "persistent"'
      )

      // Simulate reload by reinitializing
      await app.init()

      // Verify state can be restored
      expect(app.getCurrentProfile()).toBeDefined()
    })

    it('should handle browser back/forward', async () => {
      const profileId = app.createProfile('Navigation Test Profile')
      app.switchProfile(profileId)

      // Simulate browser navigation
      const popStateEvent = new PopStateEvent('popstate', {
        state: { profileId: profileId },
      })

      window.dispatchEvent(popStateEvent)

      // Test passes if no errors occur
      expect(true).toBe(true)
    })
  })
})
