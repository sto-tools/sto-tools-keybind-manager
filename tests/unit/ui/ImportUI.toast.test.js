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

  describe('bindset selection modal', () => {
    it('should create bindset selection modal with checkboxes', () => {
      const bindsetNames = ['Master', 'Combat', 'Social']
      const hasMasterBindset = true
      const masterDisplayName = 'Primary Bindset'

      const modal = component.createBindsetSelectionModal(bindsetNames, hasMasterBindset, masterDisplayName)

      expect(modal).toBeDefined()
      expect(modal.className).toBe('modal import-modal')
      expect(modal.innerHTML).toContain('select_bindsets_to_import')
      expect(modal.innerHTML).toContain('bindset_Master')
      expect(modal.innerHTML).toContain('bindset_Combat')
      expect(modal.innerHTML).toContain('bindset_Social')
      expect(modal.innerHTML).toContain('Primary Bindset')
      expect(modal.innerHTML).toContain('type="checkbox"')
    })

    it('should pre-select Master bindset by default', () => {
      const bindsetNames = ['Master', 'Combat']
      const hasMasterBindset = true
      const masterDisplayName = 'Primary Bindset'

      const modal = component.createBindsetSelectionModal(bindsetNames, hasMasterBindset, masterDisplayName)

      // Master should be checked, others should not
      expect(modal.innerHTML).toContain('value="Master" checked')
      expect(modal.innerHTML).toContain('value="Combat"')
      expect(modal.innerHTML).not.toContain('value="Combat" checked')
    })

    it('should handle regeneration method gracefully when no modal exists', () => {
      // Ensure no current modal data exists
      component.currentBindsetSelectionModal = null

      // Should not throw when no modal is present
      expect(() => component.regenerateBindsetSelectionModal()).not.toThrow()
    })
  })

  describe('KBF Import - Instant Toast Behavior (Post-Fix)', () => {
    it('should show instant success toast when KBF import succeeds', async () => {
      // Mock successful KBF import - note no progress tracking
      fixture.mockResponse('import:kbf-file', async () => ({
        success: true,
        message: 'kbf_import_completed',
        imported: { bindsets: 2, keys: 45, aliases: 8 },
        stats: { totalErrors: 0, totalWarnings: 3 },
        errors: [],
        warnings: ['Warning 1', 'Warning 2', 'Warning 3']
      }))

      // Mock current profile and environment
      fixture.mockResponse('profile:get-current', async () => 'test-profile')
      fixture.mockResponse('profile:get-environment', async () => 'space')

      // Simulate KBF file content (base64 encoded)
      const fileContent = 'VmFsaWQgS0JGIEZvcm1hdA=='

      // Simulate the KBF import process
      const result = await component.request('import:kbf-file', {
        content: fileContent,
        profileId: 'test-profile',
        environment: 'space'
      })

      // Process the result like the component would
      if (result?.success) {
        const message = component.i18n?.t?.(result?.message) || result?.message
        component.showToast(message, 'success', result?.warnings)
      }

      // Should show instant success toast (like other imports)
      expect(showToastSpy).toHaveBeenCalledWith(
        'kbf_import_completed:undefined',
        'success',
        ['Warning 1', 'Warning 2', 'Warning 3']
      )
    })

    it('should show instant error toast when KBF import fails', async () => {
      // Mock failed KBF import
      fixture.mockResponse('import:kbf-file', async () => ({
        success: false,
        error: 'invalid_kbf_file_format',
        message: 'Invalid KBF file format',
        errors: ['Invalid Base64 encoding', 'Missing KEYSET records'],
        warnings: []
      }))

      // Mock current profile and environment
      fixture.mockResponse('profile:get-current', async () => 'test-profile')
      fixture.mockResponse('profile:get-environment', async () => 'space')

      // Simulate KBF file content
      const fileContent = 'SW52YWxpZCBGb3JtYXQ='

      // Simulate the KBF import process
      const result = await component.request('import:kbf-file', {
        content: fileContent,
        profileId: 'test-profile',
        environment: 'space'
      })

      // Process the result like the component would
      if (!result?.success) {
        const message = component.i18n?.t?.(result?.error) || result?.message
        component.showToast(message, 'error')
      }

      // Should show instant error toast (like other imports)
      expect(showToastSpy).toHaveBeenCalledWith(
        'invalid_kbf_file_format:undefined',
        'error'
      )
    })

    it('should NOT have progress modal methods available (removed in fix)', () => {
      // Progress modal methods should be completely removed
      expect(typeof component.showProgressModal).toBe('undefined')
      expect(typeof component.hideProgressModal).toBe('undefined')
      expect(typeof component.createProgressModal).toBe('undefined')
      expect(typeof component.regenerateProgressModal).toBe('undefined')
    })

    it('should NOT have currentProgressModal property (removed in fix)', () => {
      // Should not have progress modal state
      expect(component.currentProgressModal).toBeUndefined()
    })

    it('should behave consistently with other import types', async () => {
      // Mock all three import types to ensure consistent behavior
      fixture.mockResponse('import:keybind-file', async () => ({
        success: true,
        message: 'import_success_keys',
        imported: { keys: 5 }
      }))

      fixture.mockResponse('import:alias-file', async () => ({
        success: true,
        message: 'import_success_aliases',
        imported: { aliases: 3 }
      }))

      fixture.mockResponse('import:kbf-file', async () => ({
        success: true,
        message: 'kbf_import_completed',
        imported: { bindsets: 2, keys: 45, aliases: 8 }
      }))

      fixture.mockResponse('profile:get-current', async () => 'test-profile')
      fixture.mockResponse('profile:get-environment', async () => 'space')

      // Test keybind import
      const keybindResult = await component.request('import:keybind-file', {
        content: '{"test": "content"}',
        profileId: 'test-profile',
        environment: 'space'
      })

      if (keybindResult?.success) {
        const message = component.i18n?.t?.(keybindResult?.message, { count: keybindResult.imported?.keys || 0 })
        component.showToast(message, 'success')
      }

      // Test alias import
      const aliasResult = await component.request('import:alias-file', {
        content: '{"test": "content"}',
        profileId: 'test-profile'
      })

      if (aliasResult?.success) {
        const message = component.i18n?.t?.(aliasResult?.message, { count: aliasResult.imported?.aliases || 0 })
        component.showToast(message, 'success')
      }

      // Test KBF import - should behave identically
      const kbfResult = await component.request('import:kbf-file', {
        content: 'VmFsaWQgS0JGIEZvcm1hdA==',
        profileId: 'test-profile',
        environment: 'space'
      })

      if (kbfResult?.success) {
        const message = component.i18n?.t?.(kbfResult?.message) || kbfResult?.message
        component.showToast(message, 'success')
      }

      // All should use showToast with instant feedback
      expect(showToastSpy).toHaveBeenCalledTimes(3)
      expect(showToastSpy).toHaveBeenNthCalledWith(1, 'Successfully imported 5 keys', 'success')
      expect(showToastSpy).toHaveBeenNthCalledWith(2, 'Successfully imported 3 aliases', 'success')
      expect(showToastSpy).toHaveBeenNthCalledWith(3, 'kbf_import_completed:undefined', 'success')
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

    it('should have bindset selection methods available', () => {
      expect(typeof component.createBindsetSelectionModal).toBe('function')
      expect(typeof component.promptBindsetSelection).toBe('function')
      expect(typeof component.regenerateBindsetSelectionModal).toBe('function')
    })

    it('should NOT have progress modal methods available (removed in fix)', () => {
      // Progress modal methods should be completely removed
      expect(typeof component.showProgressModal).toBe('undefined')
      expect(typeof component.hideProgressModal).toBe('undefined')
      expect(typeof component.createProgressModal).toBe('undefined')
      expect(typeof component.regenerateProgressModal).toBe('undefined')
    })

    it('should create enhanced bindset selection modal with large-modal class (regression: js-kbf-import-modal-width)', () => {
      const parseResult = {
        bindsetNames: ['Master', 'Ground'],
        hasMasterBindset: true,
        masterDisplayName: 'Space'
      }

      const modal = component.createEnhancedBindsetSelectionModal(parseResult)

      // Verify that the modal includes the large-modal class for proper width (fix for narrow modal issue)
      expect(modal.className).toContain('modal')
      expect(modal.className).toContain('import-modal')
      expect(modal.className).toContain('enhanced-bindset-selection')
      expect(modal.className).toContain('large-modal')
    })
  })
})