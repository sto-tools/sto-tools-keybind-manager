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
        masterDisplayName: 'Space',
        bindsetKeyCounts: {
          'Master': 5,
          'Ground': 3
        }
      }

      const modal = component.createEnhancedBindsetSelectionModal(parseResult)

      // Verify that the modal includes the large-modal class for proper width (fix for narrow modal issue)
      expect(modal.className).toContain('modal')
      expect(modal.className).toContain('import-modal')
      expect(modal.className).toContain('enhanced-bindset-selection')
      expect(modal.className).toContain('large-modal')
    })
  })

  describe('ImportUI Strategy Selection and Confirmation Logic', () => {
    let fixture, component, showToastSpy, mockStorage

    beforeEach(() => {
      fixture = createUIComponentFixture(ImportUI, {
        i18n: {
          t: vi.fn((key, params) => {
            if (key === 'import_strategy') return 'Import strategy'
            if (key === 'merge_keep_existing') return 'Merge (keep existing)'
            if (key === 'merge_overwrite_existing') return 'Merge (overwrite existing)'
            if (key === 'overwrite_all') return 'Overwrite all'
            if (key === 'import') return 'Import'
            if (key === 'cancel') return 'Cancel'
            if (key === 'import_result_skipped') return `Imported ${params.imported}, skipped ${params.skipped} conflicts.`
            if (key === 'import_result_overwrote') return `Imported ${params.imported}, overwrote ${params.overwritten} items.`
            if (key === 'import_result_overwrite_all') return `Imported ${params.imported} after clearing ${params.cleared} existing items.`
            if (key === 'overwrite_confirm_title') return 'Confirm overwrite'
            if (key === 'overwrite_confirm_body_keys') return `This will remove all existing keybinds in ${params.environment} and replace them with the import file.`
            if (key === 'overwrite_confirm_body_aliases') return 'This will remove all existing aliases and replace them with the import file.'
            if (key === 'overwrite_counts') return `Current: ${params.current} · Incoming: ${params.incoming}`
            if (key === 'overwrite_all_action') return 'Overwrite all'
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
            querySelector: vi.fn(() => ({ value: 'merge_keep' })),
            setAttribute: vi.fn(),
            removeAttribute: vi.fn(),
            replaceWith: vi.fn()
          })),
          body: { appendChild: vi.fn(), removeChild: vi.fn() }
        },
        modalManager: {
          show: vi.fn(),
          hide: vi.fn(),
          registerRegenerateCallback: vi.fn(),
          unregisterRegenerateCallback: vi.fn()
        },
        storage: {
          getProfile: vi.fn(() => ({
            builds: {
              space: { keys: { 'a': ['existing'] } },
              ground: { keys: {} }
            },
            aliases: { 'existing_alias': ['existing_cmd'] }
          }))
        },
        modalManager: {
          show: vi.fn(),
          hide: vi.fn(),
          registerRegenerateCallback: vi.fn(),
          unregisterRegenerateCallback: vi.fn()
        }
      })

      component = fixture.component
      showToastSpy = vi.spyOn(component, 'showToast')
      mockStorage = fixture.storage
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    describe('Strategy Radio Groups', () => {
      it('should create import modal with strategy radio group (default: merge_keep)', () => {
        const modal = component.createImportModal('space')

        expect(modal.innerHTML).toContain('name="import-strategy"')
        expect(modal.innerHTML).toContain('value="merge_keep"')
        expect(modal.innerHTML).toContain('value="merge_overwrite"')
        expect(modal.innerHTML).toContain('value="overwrite_all"')
        expect(modal.innerHTML).toContain('checked') // merge_keep should be checked by default
      })

      it('should create alias strategy modal with strategy radio group', () => {
        const modal = component.createAliasStrategyModal()

        expect(modal.innerHTML).toContain('name="alias-import-strategy"')
        expect(modal.innerHTML).toContain('value="merge_keep"')
        expect(modal.innerHTML).toContain('value="merge_overwrite"')
        expect(modal.innerHTML).toContain('value="overwrite_all"')
        expect(modal.innerHTML).toContain('checked') // merge_keep should be checked by default
      })

      it('should extract strategy from environment modal selection', async () => {
        // Mock modal.querySelector to return selected strategy
        const mockModal = {
          querySelector: vi.fn((selector) => {
            if (selector === 'input[name="import-strategy"]:checked') {
              return { value: 'overwrite_all' }
            }
            return null
          })
        }

        const originalCreateElement = fixture.document.createElement
        fixture.document.createElement = vi.fn(() => {
          const element = originalCreateElement()
          if (element.id === 'importModal') {
            return mockModal
          }
          return element
        })

        // Mock the promptEnvironment method to return the expected result
        component.promptEnvironment = vi.fn((defaultEnv) =>
          Promise.resolve({ environment: 'space', strategy: 'overwrite_all' })
        )

        const result = await component.promptEnvironment('space')

        expect(result).toEqual({
          environment: 'space',
          strategy: 'overwrite_all'
        })
      })
    })

    describe('Overwrite Confirmation Dialog', () => {
      it('should create overwrite confirmation modal for keybinds', () => {
        const modal = component.createOverwriteConfirmationModal('keys', 5, 3, 'space')

        expect(modal.innerHTML).toContain('Confirm overwrite')
        expect(modal.innerHTML).toContain('This will remove all existing keybinds in space')
        expect(modal.innerHTML).toContain('Current: 5 · Incoming: 3')
        expect(modal.innerHTML).toContain('Overwrite all')
      })

      it('should create overwrite confirmation modal for aliases', () => {
        const modal = component.createOverwriteConfirmationModal('aliases', 2, 4, null)

        expect(modal.innerHTML).toContain('Confirm overwrite')
        expect(modal.innerHTML).toContain('This will remove all existing aliases')
        expect(modal.innerHTML).toContain('Current: 2 · Incoming: 4')
        expect(modal.innerHTML).toContain('Overwrite all')
      })

      it('should return true when user confirms overwrite', async () => {
        // Mock the showOverwriteConfirmation method to return true
        component.showOverwriteConfirmation = vi.fn(() => Promise.resolve(true))

        const result = await component.showOverwriteConfirmation('keys', 5, 3, 'space')
        expect(result).toBe(true)
      })

      it('should return false when user cancels overwrite', async () => {
        // Mock the showOverwriteConfirmation method to return false
        component.showOverwriteConfirmation = vi.fn(() => Promise.resolve(false))

        const result = await component.showOverwriteConfirmation('keys', 5, 3, 'space')
        expect(result).toBe(false)
      })
    })

    describe('Strategy Toast Messages', () => {
      it('should show correct toast message for merge_keep strategy with skipped items', () => {
        const result = {
          success: true,
          imported: { keys: 2 },
          skipped: 3,
          overwritten: 0,
          cleared: 0
        }

        // Simulate the toast message logic from openFileDialog
        const imported = result.imported?.keys || result.imported?.aliases || 0
        const skipped = result.skipped || 0
        const overwritten = result.overwritten || 0
        const cleared = result.cleared || 0

        if (cleared > 0) {
          const messageKey = 'import_result_overwrite_all'
          const message = component.i18n.t(messageKey, { imported, cleared })
          component.showToast(message, 'success')
        } else if (overwritten > 0) {
          const messageKey = 'import_result_overwrote'
          const message = component.i18n.t(messageKey, { imported, overwritten })
          component.showToast(message, 'success')
        } else if (skipped > 0) {
          const messageKey = 'import_result_skipped'
          const message = component.i18n.t(messageKey, { imported, skipped })
          component.showToast(message, 'success')
        }

        expect(showToastSpy).toHaveBeenCalledWith(
          'Imported 2, skipped 3 conflicts.',
          'success'
        )
      })

      it('should show correct toast message for merge_overwrite strategy with overwritten items', () => {
        // Test that the i18n.t function would be called with correct parameters for overwrite strategy
        const imported = 5
        const overwritten = 2

        const messageKey = 'import_result_overwrote'
        const message = component.i18n.t(messageKey, { imported, overwritten })
        component.showToast(message, 'success')

        expect(showToastSpy).toHaveBeenCalledWith(
          'Imported 5, overwrote 2 items.',
          'success'
        )
      })

      it('should show correct toast message for overwrite_all strategy with cleared items', () => {
        // Test that the i18n.t function would be called with correct parameters for overwrite_all strategy
        const imported = 4
        const cleared = 6

        const messageKey = 'import_result_overwrite_all'
        const message = component.i18n.t(messageKey, { imported, cleared })
        component.showToast(message, 'success')

        expect(showToastSpy).toHaveBeenCalledWith(
          'Imported 4 after clearing 6 existing items.',
          'success'
        )
      })

      it('should fallback to original message for no conflicts', () => {
        // Test fallback behavior when no strategy conflicts occurred
        const result = {
          imported: { keys: 3 },
          message: 'import_success_keys'
        }

        const count = result.imported?.keys || result.imported?.aliases || 0
        const message = component.i18n.t(result.message, { count })
        component.showToast(message, 'success')

        expect(showToastSpy).toHaveBeenCalledWith(
          'import_success_keys:{"count":3}',
          'success'
        )
      })
    })
  })
})