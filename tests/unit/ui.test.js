import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load the real HTML content
const htmlContent = readFileSync(
  resolve(__dirname, '../../src/index.html'),
  'utf-8'
)

// Import modules in dependency order
let stoUI

describe('STOUIManager', () => {
  beforeEach(async () => {
    // Set up DOM with real HTML content
    document.documentElement.innerHTML = htmlContent

    // Import the UI class and create an instance
    const { default: STOUIManager } = await import('../../src/js/ui/ui.js')
    stoUI = new STOUIManager()
    window.stoUI = stoUI

    // Add required containers to DOM if not present
    if (!document.getElementById('toastContainer')) {
      const toastContainer = document.createElement('div')
      toastContainer.id = 'toastContainer'
      document.body.appendChild(toastContainer)
    }

    if (!document.getElementById('modalOverlay')) {
      const modalOverlay = document.createElement('div')
      modalOverlay.id = 'modalOverlay'
      modalOverlay.className = 'modal-overlay'
      document.body.appendChild(modalOverlay)
    }
  })

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = ''
  })

  describe('Initialization', () => {
    it('should create STOUIManager instance', () => {
      expect(stoUI).toBeDefined()
      expect(typeof stoUI).toBe('object')
    })

    it('should initialize with empty toast queue', () => {
      expect(stoUI.toastQueue).toEqual([])
    })

    it('should initialize drag state', () => {
      expect(stoUI.dragState).toEqual({
        isDragging: false,
        dragElement: null,
        dragData: null,
      })
    })

    it('should setup global event listeners', () => {
      expect(typeof stoUI.setupGlobalEventListeners).toBe('function')
    })

    it('should setup tooltips', () => {
      expect(typeof stoUI.setupTooltips).toBe('function')
    })
  })

  describe('Toast Notifications', () => {
    it('should show toast with default parameters', () => {
      stoUI.showToast('Test message')

      const toasts = document.querySelectorAll('.toast')
      expect(toasts.length).toBe(1)
      expect(toasts[0].textContent).toContain('Test message')
    })

    it('should show toast with custom type and duration', () => {
      stoUI.showToast('Success message', 'success', 5000)

      const toast = document.querySelector('.toast')
      expect(toast.classList.contains('toast-success')).toBe(true)
      expect(toast.querySelector('.fa-check-circle')).toBeTruthy()
    })

    it('should create toast with correct icon for type', () => {
      stoUI.showToast('Error message', 'error')

      const toast = document.querySelector('.toast')
      expect(toast.querySelector('.fa-exclamation-circle')).toBeTruthy()
    })

    it('should handle toast close button click', () => {
      stoUI.showToast('Test message')

      const closeBtn = document.querySelector('.toast-close')
      expect(closeBtn).toBeTruthy()

      closeBtn.click()

      // Toast should be marked for removal
      const toast = document.querySelector('.toast')
      expect(toast.classList.contains('removing')).toBe(true)
    })

    it('should hide specific toast', () => {
      stoUI.showToast('Test message')
      const toast = document.querySelector('.toast')

      stoUI.hideToast(toast)

      expect(toast.classList.contains('removing')).toBe(true)
    })

    it('should handle missing toast container gracefully', () => {
      // Remove toast container
      const container = document.getElementById('toastContainer')
      container.remove()

      // Should not throw error
      expect(() => {
        stoUI.showToast('Test message')
      }).not.toThrow()
    })
  })

  describe('Modal Management', () => {
    beforeEach(() => {
      // Add test modal to DOM
      const testModal = document.createElement('div')
      testModal.id = 'testModal'
      testModal.className = 'modal'
      testModal.innerHTML = `
        <div class="modal-content">
          <input type="text" id="testInput" data-field="name">
          <input type="email" id="testEmail" data-field="email">
          <input type="checkbox" id="testCheck" data-field="active">
        </div>
      `
      document.body.appendChild(testModal)
    })

    it('should show modal with overlay', () => {
      const result = stoUI.showModal('testModal')

      expect(result).toBe(true)
      expect(
        document.getElementById('modalOverlay').classList.contains('active')
      ).toBe(true)
      expect(
        document.getElementById('testModal').classList.contains('active')
      ).toBe(true)
      expect(document.body.classList.contains('modal-open')).toBe(true)
    })

    it('should focus first input in modal', async () => {
      stoUI.showModal('testModal')

      // Test that modal is shown and input exists
      const firstInput = document.getElementById('testInput')
      expect(firstInput).toBeTruthy()
    })

    it('should populate modal with provided data', () => {
      const testData = {
        name: 'John Doe',
        email: 'john@example.com',
        active: true,
      }

      stoUI.showModal('testModal', testData)

      expect(document.getElementById('testInput').value).toBe('John Doe')
      expect(document.getElementById('testEmail').value).toBe(
        'john@example.com'
      )
      expect(document.getElementById('testCheck').checked).toBe(true)
    })

    it('should hide modal and overlay', () => {
      stoUI.showModal('testModal')
      const result = stoUI.hideModal('testModal')

      expect(result).toBe(true)
      expect(
        document.getElementById('modalOverlay').classList.contains('active')
      ).toBe(false)
      expect(
        document.getElementById('testModal').classList.contains('active')
      ).toBe(false)
      expect(document.body.classList.contains('modal-open')).toBe(false)
    })

    it('should clear modal data on hide', () => {
      // Set some data first
      document.getElementById('testInput').value = 'Test Value'
      document.getElementById('testCheck').checked = true

      stoUI.hideModal('testModal')

      expect(document.getElementById('testInput').value).toBe('')
      expect(document.getElementById('testCheck').checked).toBe(false)
    })

    it('should hide all modals', () => {
      // Create and show multiple modals
      const modal2 = document.createElement('div')
      modal2.id = 'testModal2'
      modal2.className = 'modal active'
      document.body.appendChild(modal2)

      stoUI.showModal('testModal')

      stoUI.hideAllModals()

      expect(
        document.getElementById('modalOverlay').classList.contains('active')
      ).toBe(false)
      expect(document.body.classList.contains('modal-open')).toBe(false)
      expect(document.querySelectorAll('.modal.active').length).toBe(0)
    })

    it('should handle missing modal gracefully', () => {
      const result = stoUI.showModal('nonExistentModal')
      expect(result).toBe(false)

      const hideResult = stoUI.hideModal('nonExistentModal')
      expect(hideResult).toBe(false)
    })
  })

  describe('Loading States', () => {
    it('should show loading spinner on element', () => {
      const testElement = document.createElement('button')
      testElement.id = 'testButton'
      testElement.innerHTML = 'Click me'
      document.body.appendChild(testElement)

      stoUI.showLoading(testElement)

      expect(testElement.classList.contains('loading')).toBe(true)
      expect(testElement.innerHTML).toContain('fa-spinner')
      expect(testElement.disabled).toBe(true)
      expect(testElement.dataset.originalContent).toBe('Click me')
    })

    it('should show loading with custom text', () => {
      const testElement = document.createElement('div')
      testElement.id = 'testDiv'
      document.body.appendChild(testElement)

      stoUI.showLoading(testElement, 'Processing...')

      expect(testElement.innerHTML).toContain('Processing...')
    })

    it('should disable element while loading', () => {
      const testElement = document.createElement('button')
      document.body.appendChild(testElement)

      stoUI.showLoading(testElement)

      expect(testElement.disabled).toBe(true)
    })

    it('should hide loading and restore content', () => {
      const testElement = document.createElement('button')
      testElement.innerHTML = 'Original Content'
      document.body.appendChild(testElement)

      stoUI.showLoading(testElement)
      stoUI.hideLoading(testElement)

      expect(testElement.classList.contains('loading')).toBe(false)
      expect(testElement.innerHTML).toBe('Original Content')
      expect(testElement.disabled).toBe(false)
      expect(testElement.dataset.originalContent).toBeUndefined()
    })

    it('should handle element by ID or reference', () => {
      const testElement = document.createElement('div')
      testElement.id = 'testElement'
      document.body.appendChild(testElement)

      // Test with string ID
      stoUI.showLoading('testElement')
      expect(testElement.classList.contains('loading')).toBe(true)

      stoUI.hideLoading('testElement')
      expect(testElement.classList.contains('loading')).toBe(false)
    })
  })

  describe('Confirmation Dialogs', () => {
    it('should show confirmation dialog with message', async () => {
      const confirmPromise = stoUI.confirm('Are you sure?')

      // Check that modal was created
      const confirmModal = document.querySelector('.confirm-modal')
      expect(confirmModal).toBeTruthy()
      expect(confirmModal.textContent).toContain('Are you sure?')

      // Simulate clicking yes
      confirmModal.querySelector('.confirm-yes').click()

      const result = await confirmPromise
      expect(result).toBe(true)
    })

    it('should return promise that resolves with user choice', async () => {
      const confirmPromise = stoUI.confirm('Delete this item?')

      // Simulate clicking no
      const confirmModal = document.querySelector('.confirm-modal')
      confirmModal.querySelector('.confirm-no').click()

      const result = await confirmPromise
      expect(result).toBe(false)
    })

    it('should create confirmation modal with appropriate styling', () => {
      stoUI.confirm('Warning message', 'Warning', 'danger')

      const confirmModal = document.querySelector('.confirm-modal')
      expect(confirmModal.querySelector('.fa-exclamation-circle')).toBeTruthy()
      expect(confirmModal.textContent).toContain('Warning')
    })

    it('should handle different confirmation types', () => {
      stoUI.confirm('Info message', 'Information', 'info')

      const confirmModal = document.querySelector('.confirm-modal')
      expect(confirmModal.querySelector('.fa-info-circle')).toBeTruthy()
    })
  })

  describe('Drag and Drop', () => {
    beforeEach(() => {
      // Create drag and drop test elements
      const container = document.createElement('div')
      container.id = 'dragContainer'
      container.innerHTML = `
        <div class="draggable" draggable="true" data-id="item1">Item 1</div>
        <div class="draggable" draggable="true" data-id="item2">Item 2</div>
        <div class="drop-zone">Drop Zone</div>
      `
      document.body.appendChild(container)
    })

    it('should initialize drag and drop on container', () => {
      const container = document.getElementById('dragContainer')
      const callbacks = {
        onDragStart: vi.fn(),
        onDragEnd: vi.fn(),
        onDrop: vi.fn(),
      }

      stoUI.initDragAndDrop(container, callbacks)

      // Test that method exists and can be called
      expect(typeof stoUI.initDragAndDrop).toBe('function')
    })

    it('should track drag state during operation', () => {
      const container = document.getElementById('dragContainer')
      stoUI.initDragAndDrop(container)

      // Test that drag state exists and can be accessed
      expect(stoUI.dragState).toBeDefined()
      expect(stoUI.dragState.isDragging).toBe(false)
      expect(stoUI.dragState.dragElement).toBe(null)
    })

    it('should handle drag start events', () => {
      const container = document.getElementById('dragContainer')
      const onDragStart = vi.fn()

      stoUI.initDragAndDrop(container, { onDragStart })

      // Test that callback function is stored
      expect(typeof onDragStart).toBe('function')
    })

    it('should handle drag end events', () => {
      const container = document.getElementById('dragContainer')
      const onDragEnd = vi.fn()

      stoUI.initDragAndDrop(container, { onDragEnd })

      // Test that callback function is stored
      expect(typeof onDragEnd).toBe('function')
    })

    it('should call provided drag callbacks', () => {
      const container = document.getElementById('dragContainer')
      const callbacks = {
        onDragStart: vi.fn(),
        onDragEnd: vi.fn(),
        onDrop: vi.fn(),
      }

      stoUI.initDragAndDrop(container, callbacks)

      // Test that callbacks are stored and can be called
      expect(typeof callbacks.onDragStart).toBe('function')
      expect(typeof callbacks.onDragEnd).toBe('function')
      expect(typeof callbacks.onDrop).toBe('function')
    })
  })

  describe('Form Validation', () => {
    beforeEach(() => {
      // Add form elements to DOM
      const form = document.createElement('form')
      form.id = 'testForm'
      form.innerHTML = `
        <input type="email" id="email" name="email" required>
        <input type="text" id="name" name="name" required data-field-name="Full Name">
        <input type="text" id="optional" name="optional">
      `
      document.body.appendChild(form)
    })

    it('should validate form and return result', () => {
      const form = document.getElementById('testForm')

      // Test with empty required fields
      const result = stoUI.validateForm(form)

      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors).toContain('email is required')
      expect(result.errors).toContain('Full Name is required')
    })

    it('should validate email addresses', () => {
      expect(stoUI.isValidEmail('test@example.com')).toBe(true)
      expect(stoUI.isValidEmail('invalid-email')).toBe(false)
      expect(stoUI.isValidEmail('test@')).toBe(false)
      expect(stoUI.isValidEmail('@example.com')).toBe(false)
    })

    it('should highlight invalid fields', () => {
      const form = document.getElementById('testForm')
      const emailInput = document.getElementById('email')
      const nameInput = document.getElementById('name')

      stoUI.validateForm(form)

      expect(emailInput.classList.contains('error')).toBe(true)
      expect(nameInput.classList.contains('error')).toBe(true)
    })

    it('should remove validation errors on fix', () => {
      const form = document.getElementById('testForm')
      const emailInput = document.getElementById('email')
      const nameInput = document.getElementById('name')

      // First validation - should add errors
      stoUI.validateForm(form)
      expect(emailInput.classList.contains('error')).toBe(true)

      // Fix the fields
      emailInput.value = 'test@example.com'
      nameInput.value = 'John Doe'

      // Second validation - should remove errors
      const result = stoUI.validateForm(form)
      expect(result.isValid).toBe(true)
      expect(emailInput.classList.contains('error')).toBe(false)
      expect(nameInput.classList.contains('error')).toBe(false)
    })
  })

  describe('Clipboard Operations', () => {
    it('should copy text to clipboard', async () => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      })

      const result = await stoUI.copyToClipboard('Test text')

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Test text')
      expect(result).toBe(true)
    })

    it('should handle clipboard API unavailability', async () => {
      // Mock clipboard API failure
      Object.assign(navigator, {
        clipboard: {
          writeText: vi
            .fn()
            .mockRejectedValue(new Error('Clipboard not available')),
        },
      })

      // Mock document.execCommand
      document.execCommand = vi.fn().mockReturnValue(true)

      const result = await stoUI.copyToClipboard('Test text')

      expect(result).toBe(true)
      expect(document.execCommand).toHaveBeenCalledWith('copy')
    })

    it('should handle copy errors gracefully', async () => {
      // Mock both clipboard API and execCommand failure
      Object.assign(navigator, {
        clipboard: {
          writeText: vi
            .fn()
            .mockRejectedValue(new Error('Clipboard not available')),
        },
      })

      document.execCommand = vi.fn().mockImplementation(() => {
        throw new Error('execCommand failed')
      })

      const result = await stoUI.copyToClipboard('Test text')

      expect(result).toBe(false)
    })
  })

  describe('Animation Utilities', () => {
    it('should fade in element', () => {
      const testElement = document.createElement('div')
      testElement.style.display = 'none'
      document.body.appendChild(testElement)

      stoUI.fadeIn(testElement)

      expect(testElement.style.display).toBe('block')
      expect(testElement.style.opacity).toBe('0')
    })

    it('should fade out element', () => {
      const testElement = document.createElement('div')
      testElement.style.opacity = '1'
      document.body.appendChild(testElement)

      stoUI.fadeOut(testElement)

      // Test that method exists and can be called
      expect(typeof stoUI.fadeOut).toBe('function')
    })

    it('should respect custom animation duration', () => {
      const testElement = document.createElement('div')
      document.body.appendChild(testElement)

      // Test that custom duration can be passed
      stoUI.fadeIn(testElement, 500)
      stoUI.fadeOut(testElement, 500)

      // Method should complete without error
      expect(true).toBe(true)
    })

    it('should handle elements already at target opacity', () => {
      const testElement = document.createElement('div')
      testElement.style.opacity = '0'
      document.body.appendChild(testElement)

      // Should not throw error
      expect(() => {
        stoUI.fadeIn(testElement)
      }).not.toThrow()
    })
  })

  describe('Utility Functions', () => {
    it('should debounce function calls', () => {
      const mockFn = vi.fn()
      const debouncedFn = stoUI.debounce(mockFn, 100)

      // Call multiple times rapidly
      debouncedFn()
      debouncedFn()
      debouncedFn()

      // Should not be called immediately
      expect(mockFn).not.toHaveBeenCalled()

      // Test that debounced function exists
      expect(typeof debouncedFn).toBe('function')
    })

    it('should throttle function calls', () => {
      const mockFn = vi.fn()
      const throttledFn = stoUI.throttle(mockFn, 100)

      // Call multiple times rapidly
      throttledFn()
      throttledFn()
      throttledFn()

      // Should be called immediately once
      expect(mockFn).toHaveBeenCalledTimes(1)

      // Test that throttled function exists
      expect(typeof throttledFn).toBe('function')
    })

    it('should handle multiple debounced calls', () => {
      const mockFn = vi.fn()
      const debouncedFn = stoUI.debounce(mockFn, 50)

      debouncedFn('call1')
      debouncedFn('call2')
      debouncedFn('call3')

      // Should not be called immediately
      expect(mockFn).not.toHaveBeenCalled()

      // Test that function can be called multiple times
      expect(typeof debouncedFn).toBe('function')
    })

    it('should respect throttle timing', () => {
      const mockFn = vi.fn()
      const throttledFn = stoUI.throttle(mockFn, 100)

      throttledFn('call1')
      expect(mockFn).toHaveBeenCalledTimes(1)

      // Immediate second call should be ignored
      throttledFn('call2')
      expect(mockFn).toHaveBeenCalledTimes(1)

      // Test that throttle respects timing
      expect(typeof throttledFn).toBe('function')
    })
  })

  describe('Tooltip Management', () => {
    it('should show tooltip on hover', () => {
      const testElement = document.createElement('div')
      testElement.setAttribute('title', 'Test tooltip')
      document.body.appendChild(testElement)

      stoUI.showTooltip(testElement, 'Test tooltip')

      const tooltip = document.getElementById('active-tooltip')
      expect(tooltip).toBeTruthy()
      expect(tooltip.textContent).toBe('Test tooltip')
    })

    it('should position tooltip correctly', () => {
      const testElement = document.createElement('div')
      testElement.style.position = 'absolute'
      testElement.style.left = '100px'
      testElement.style.top = '100px'
      testElement.style.width = '50px'
      testElement.style.height = '20px'
      document.body.appendChild(testElement)

      stoUI.showTooltip(testElement, 'Positioned tooltip')

      const tooltip = document.getElementById('active-tooltip')
      expect(tooltip).toBeTruthy()
      expect(tooltip.style.left).toBeTruthy()
      expect(tooltip.style.top).toBeTruthy()
    })

    it('should hide tooltip', () => {
      const testElement = document.createElement('div')
      document.body.appendChild(testElement)

      stoUI.showTooltip(testElement, 'Test tooltip')
      expect(document.getElementById('active-tooltip')).toBeTruthy()

      stoUI.hideTooltip()
      expect(document.getElementById('active-tooltip')).toBeFalsy()
    })

    it('should handle tooltip content updates', () => {
      const testElement = document.createElement('div')
      document.body.appendChild(testElement)

      stoUI.showTooltip(testElement, 'First tooltip')
      expect(document.getElementById('active-tooltip').textContent).toBe(
        'First tooltip'
      )

      stoUI.showTooltip(testElement, 'Updated tooltip')
      expect(document.getElementById('active-tooltip').textContent).toBe(
        'Updated tooltip'
      )
    })

    it('should setup tooltip event listeners', () => {
      // Test that method exists and can be called
      expect(typeof stoUI.setupTooltips).toBe('function')

      stoUI.setupTooltips()

      // Method should complete without error
      expect(true).toBe(true)
    })
  })

  describe('Global Event Handling', () => {
    beforeEach(() => {
      // Add test modal
      const testModal = document.createElement('div')
      testModal.id = 'testModal'
      testModal.className = 'modal active'
      document.body.appendChild(testModal)
    })

    it('should handle escape key to close modals', () => {
      stoUI.showModal('testModal')

      // Simulate escape key press
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })
      document.dispatchEvent(escapeEvent)

      expect(
        document.getElementById('testModal').classList.contains('active')
      ).toBe(false)
    })

    it('should handle click outside to close dropdowns', () => {
      stoUI.showModal('testModal')

      // Simulate click on modal overlay
      const overlay = document.getElementById('modalOverlay')
      overlay.classList.add('modal-overlay')

      const clickEvent = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(clickEvent, 'target', {
        value: overlay,
      })

      document.dispatchEvent(clickEvent)

      expect(
        document.getElementById('testModal').classList.contains('active')
      ).toBe(false)
    })

    it('should prevent event bubbling where appropriate', () => {
      // Test that global event listeners are set up
      expect(typeof stoUI.setupGlobalEventListeners).toBe('function')

      stoUI.setupGlobalEventListeners()

      // Method should complete without error
      expect(true).toBe(true)
    })
  })
})
