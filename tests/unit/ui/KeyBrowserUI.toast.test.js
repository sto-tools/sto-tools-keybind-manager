import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import KeyBrowserUI from '../../../src/js/components/ui/KeyBrowserUI.js'
import { createUIComponentFixture } from '../../fixtures/ui/component.js'

describe('KeyBrowserUI Toast Tests', () => {
  let fixture, component, showToastSpy

  beforeEach(() => {
    fixture = createUIComponentFixture(KeyBrowserUI, {
      i18n: {
        t: vi.fn((key, params) => {
          if (key === 'key_deleted') return `Key "${params.keyName}" deleted`
          if (key === 'key_duplicated') return `Key "${params.from}" duplicated as "${params.to}"`
          if (key === 'failed_to_delete_key') return 'Failed to delete key'
          return `${key}:${JSON.stringify(params)}`
        })
      },
      document: {
        getElementById: vi.fn(() => null),
        createElement: vi.fn(() => ({
          value: '',
          textContent: '',
          innerHTML: '',
          className: '',
          id: '',
          style: {},
          classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          click: vi.fn(),
          focus: vi.fn(),
          blur: vi.fn(),
          appendChild: vi.fn(),
          removeChild: vi.fn(),
          querySelector: vi.fn(),
          setAttribute: vi.fn(),
          removeAttribute: vi.fn()
        })),
        body: { appendChild: vi.fn(), removeChild: vi.fn(), querySelector: vi.fn(), createElement: vi.fn(() => ({
          value: '',
          textContent: '',
          innerHTML: '',
          className: '',
          id: '',
          style: {},
          classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          click: vi.fn(),
          focus: vi.fn(),
          blur: vi.fn(),
          appendChild: vi.fn(),
          removeChild: vi.fn(),
          querySelector: vi.fn(),
          setAttribute: vi.fn(),
          removeAttribute: vi.fn()
        })) }
      },
      autoInit: false // Don't auto-init so we can set up spies
    })

    component = fixture.component

    // Set up spies BEFORE initializing
    showToastSpy = vi.spyOn(component, 'showToast')

    // Mock request responses for key operations
    fixture.mockResponse('key:get-all', async () => ({
      keys: {}
    }))

    fixture.mockResponse('key:delete', async ({ key }) => {
      return {
        success: true,
        key: key,
        environment: 'space'
      }
    })

    // Mock confirmDialog to always return true
    component.confirmDialog = {
      confirm: vi.fn(() => Promise.resolve(true))
    }

    // Now initialize the component
    component.init()
  })

  afterEach(() => {
    if (component && component.destroy) {
      component.destroy()
    }
    vi.restoreAllMocks()
  })

  describe('delete operation', () => {
    it('should show success toast when key deletion succeeds', async () => {
      const keyName = 'testKey'

      // Call the confirmDeleteKey method
      const result = await component.confirmDeleteKey(keyName)

      // Should return true for success
      expect(result).toBe(true)

      // Should show success toast
      expect(showToastSpy).toHaveBeenCalledWith(
        'Key "testKey" deleted',
        'success'
      )
    })

    it('should show error toast when key deletion fails', async () => {
      // Create a new component with failure mock
      const failureFixture = createUIComponentFixture(KeyBrowserUI, {
        i18n: {
          t: vi.fn((key, params) => {
            if (key === 'failed_to_delete_key') return 'Failed to delete key'
            return `${key}:${JSON.stringify(params)}`
          })
        },
        autoInit: false
      })

      failureFixture.mockResponse('key:get-all', async () => ({ keys: {} }))
      failureFixture.mockResponse('key:delete', async ({ key }) => {
        return {
          success: false,
          error: 'failed_to_delete_key'
        }
      })

      const failureComponent = failureFixture.component
      failureComponent.confirmDialog = {
        confirm: vi.fn(() => Promise.resolve(true))
      }
      failureComponent.init()

      const failureToastSpy = vi.spyOn(failureComponent, 'showToast')
      const keyName = 'testKey'

      const result = await failureComponent.confirmDeleteKey(keyName)

      // Should return false for failure
      expect(result).toBe(false)

      // Should show error toast
      expect(failureToastSpy).toHaveBeenCalledWith(
        'Failed to delete key',
        'error'
      )

      failureComponent.destroy()
    })
  })

  describe('duplicate operation', () => {
    it('should show success toast when key duplication succeeds', async () => {
      const keyName = 'testKey'

      // Call the duplicateKey method
      const emitSpy = vi.spyOn(component, 'emit')
      const result = await component.duplicateKey(keyName)

      // Should return true for initiating duplication
      expect(result).toBe(true)

      // Should emit duplication event for KeyCaptureUI and not show toast immediately
      expect(emitSpy).toHaveBeenCalledWith('key:duplicate', { key: keyName })
      expect(showToastSpy).not.toHaveBeenCalled()
    })

    it('should show error toast when key duplication fails', async () => {
      // Create a new component with failure mock
      const failureFixture = createUIComponentFixture(KeyBrowserUI, {
        i18n: {
          t: vi.fn((key, params) => {
            if (key === 'failed_to_duplicate_key') return 'Failed to duplicate key'
            return `${key}:${JSON.stringify(params)}`
          })
        },
        autoInit: false
      })

      failureFixture.mockResponse('key:get-all', async () => ({ keys: {} }))
      const failureComponent = failureFixture.component
      failureComponent.confirmDialog = {
        confirm: vi.fn(() => Promise.resolve(true))
      }
      failureComponent.init()

      const failureToastSpy = vi.spyOn(failureComponent, 'showToast')
      const keyName = 'testKey'

      const result = await failureComponent.duplicateKey(null)

      // Should return false when no key provided
      expect(result).toBe(false)

      // Should not show toast; duplication not initiated
      expect(failureToastSpy).not.toHaveBeenCalled()

      failureComponent.destroy()
    })
  })

  describe('UIComponentBase integration', () => {
    it('should inherit showToast method from UIComponentBase', () => {
      expect(typeof component.showToast).toBe('function')
    })

    it('should have i18n dependency injected', () => {
      expect(component.i18n).toBeDefined()
      expect(typeof component.i18n.t).toBe('function')
    })
  })
})
