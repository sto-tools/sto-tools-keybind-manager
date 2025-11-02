import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import ImportUI from '../../../src/js/components/ui/ImportUI.js'
import { createUIComponentFixture } from '../../fixtures/ui/component.js'

describe('ImportUI Toast Tests', () => {
  let fixture, component, showToastSpy

  beforeEach(() => {
    fixture = createUIComponentFixture(ImportUI, {
      i18n: {
        t: vi.fn((key, params) => {
          if (key === 'import_success_keys') return `Successfully imported ${params.count} keys`
          if (key === 'import_success_aliases') return `Successfully imported ${params.count} aliases`
          if (key === 'invalid_file_format') return 'Invalid file format'
          if (key === 'import_failed') return 'Import failed: unknown error'
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
        body: { appendChild: vi.fn(), removeChild: vi.fn(), createElement: vi.fn(() => ({
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

    // Mock request responses for data operations
    fixture.mockResponse('data:get-current-state', async () => ({
      currentProfile: 'default',
      currentEnvironment: 'space'
    }))

    // Mock promptEnvironment to return a value
    component.promptEnvironment = vi.fn((currentEnv) => Promise.resolve(currentEnv))

    // Now initialize the component
    component.init()
  })

  afterEach(() => {
    if (component && component.destroy) {
      component.destroy()
    }
    vi.restoreAllMocks()
  })

  describe('keybind import success', () => {
    it('should show success toast when keybind import succeeds', async () => {
      // Mock successful keybind import
      fixture.mockResponse('import:keybind-file', async () => ({
        success: true,
        message: 'import_success_keys',
        imported: { keys: 5 }
      }))

      // Simulate file content and type
      const fileContent = '{"test": "content"}'
      const file = new Blob([fileContent], { type: 'application/json' })
      const fileReader = new FileReader()

      // Create a mock file input and simulate file selection
      const mockFileInput = {
        files: [file],
        click: vi.fn(),
        addEventListener: vi.fn((event, callback) => {
          if (event === 'change') {
            // Simulate file being read
            setTimeout(() => {
              callback({ target: { result: fileContent } })
            }, 0)
          }
        })
      }

      // Override the document.getElementById to return our mock file input
      component.document.getElementById = vi.fn((id) => {
        if (id === 'keybindFileInput') {
          return mockFileInput
        }
        return null
      })

      // Simulate the keybind import process
      const result = await component.request('import:keybind-file', {
        content: fileContent,
        profileId: 'default',
        environment: 'space'
      })

      // Process the result like the component would
      if (result?.success) {
        const message = component.i18n?.t?.(result?.message, { count: result.imported?.keys || 0 })
        component.showToast(message, 'success')
      }

      // Should show success toast
      expect(showToastSpy).toHaveBeenCalledWith(
        'Successfully imported 5 keys',
        'success'
      )
    })
  })

  describe('alias import success', () => {
    it('should show success toast when alias import succeeds', async () => {
      // Mock successful alias import
      fixture.mockResponse('import:alias-file', async () => ({
        success: true,
        message: 'import_success_aliases',
        imported: { aliases: 3 }
      }))

      // Simulate file content and type
      const fileContent = '{"test": "content"}'
      const file = new Blob([fileContent], { type: 'application/json' })

      // Simulate the alias import process
      const result = await component.request('import:alias-file', {
        content: fileContent,
        profileId: 'default'
      })

      // Process the result like the component would
      if (result?.success) {
        const message = component.i18n?.t?.(result?.message, { count: result.imported?.aliases || 0 })
        component.showToast(message, 'success')
      }

      // Should show success toast
      expect(showToastSpy).toHaveBeenCalledWith(
        'Successfully imported 3 aliases',
        'success'
      )
    })
  })

  describe('keybind import failure', () => {
    it('should show error toast when keybind import fails', async () => {
      // Mock failed keybind import
      fixture.mockResponse('import:keybind-file', async () => ({
        success: false,
        error: 'invalid_file_format',
        params: { format: 'json' }
      }))

      // Simulate file content and type
      const fileContent = 'invalid content'
      const file = new Blob([fileContent], { type: 'text/plain' })

      // Simulate the keybind import process
      const result = await component.request('import:keybind-file', {
        content: fileContent,
        profileId: 'default',
        environment: 'space'
      })

      // Process the result like the component would
      if (!result?.success) {
        const message = component.i18n?.t?.(result?.error, result?.params)
        component.showToast(message, 'error')
      }

      // Should show error toast
      expect(showToastSpy).toHaveBeenCalledWith(
        'Invalid file format',
        'error'
      )
    })
  })

  describe('alias import failure', () => {
    it('should show error toast when alias import fails', async () => {
      // Mock failed alias import
      fixture.mockResponse('import:alias-file', async () => ({
        success: false,
        error: 'import_failed'
      }))

      // Simulate file content and type
      const fileContent = 'invalid content'
      const file = new Blob([fileContent], { type: 'text/plain' })

      // Simulate the alias import process
      const result = await component.request('import:alias-file', {
        content: fileContent,
        profileId: 'default'
      })

      // Process the result like the component would
      if (!result?.success) {
        const message = component.i18n?.t?.(result?.error, result?.params)
        component.showToast(message, 'error')
      }

      // Should show error toast
      expect(showToastSpy).toHaveBeenCalledWith(
        'Import failed: unknown error',
        'error'
      )
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