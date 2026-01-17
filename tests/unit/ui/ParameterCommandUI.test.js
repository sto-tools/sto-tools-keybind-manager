import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import ParameterCommandUI from '../../../src/js/components/ui/ParameterCommandUI.js'
import { createServiceFixture } from '../../fixtures'
import { STOError } from '../../../src/js/core/errors.js'

describe('ParameterCommandUI', () => {
  let fixture, ui, mockModalManager, mockI18n, mockUI, mockDocument

  beforeEach(() => {
    fixture = createServiceFixture()
    mockModalManager = {
      hide: vi.fn(),
      show: vi.fn(),
      registerRegenerateCallback: vi.fn(),
      unregisterRegenerateCallback: vi.fn()
    }
    mockI18n = {
      t: vi.fn((key, params) => {
        const translations = {
          'error_generating_command': 'Error generating command',
          'please_select_a_key_first': 'Please select a key first',
          'please_select_an_alias_first': 'Please select an alias first'
        }
        return translations[key] || key
      })
    }
    mockUI = {
      showToast: vi.fn()
    }
    mockDocument = {
      getElementById: vi.fn(),
      createElement: vi.fn(),
      querySelectorAll: vi.fn()
    }

    ui = new ParameterCommandUI({
      eventBus: fixture.eventBus,
      modalManager: mockModalManager,
      i18n: mockI18n,
      ui: mockUI,
      document: mockDocument
    })

    if (typeof ui.init === 'function') ui.init()

    // Mock the request method for async operations
    ui.request = vi.fn().mockResolvedValue({})
  })

  afterEach(() => {
    fixture.destroy()
  })

  describe('safeParseNumber', () => {
    it('should return undefined for empty string', () => {
      const result = ui.safeParseNumber('', 'test')
      expect(result).toBeUndefined()
    })

    it('should return undefined for undefined value', () => {
      const result = ui.safeParseNumber(undefined, 'test')
      expect(result).toBeUndefined()
    })

    it('should return undefined for null value', () => {
      const result = ui.safeParseNumber(null, 'test')
      expect(result).toBeUndefined()
    })

    it('should return valid numbers for valid numeric inputs', () => {
      expect(ui.safeParseNumber('123', 'test')).toBe(123)
      expect(ui.safeParseNumber('0', 'test')).toBe(0)
      expect(ui.safeParseNumber('-5', 'test')).toBe(-5)
      expect(ui.safeParseNumber('3.14', 'test')).toBe(3.14)
      expect(ui.safeParseNumber('1e5', 'test')).toBe(100000)
    })

    it('should throw STOError for invalid numeric inputs', () => {
      const invalidInputs = ['abc', '1.2.3', '123abc', 'hello', '1..2', 'NaN']

      invalidInputs.forEach(input => {
        expect(() => {
          ui.safeParseNumber(input, 'testParam')
        }).toThrow(STOError)

        try {
          ui.safeParseNumber(input, 'testParam')
        } catch (error) {
          expect(error.name).toBe('STOError')
          expect(error.code).toBe('INVALID_PARAMETER_NUMBER')
          expect(error.message).toContain('Invalid number for testParam')
          expect(error.message).toContain(`'${input}'`)
        }
      })
    })
  })

  describe('safeParseBoolean', () => {
    it('should return undefined for empty string', () => {
      const result = ui.safeParseBoolean('', 'test')
      expect(result).toBeUndefined()
    })

    it('should return undefined for undefined value', () => {
      const result = ui.safeParseBoolean(undefined, 'test')
      expect(result).toBeUndefined()
    })

    it('should return undefined for null value', () => {
      const result = ui.safeParseBoolean(null, 'test')
      expect(result).toBeUndefined()
    })

    it('should transform non-zero numbers to 1 (true)', () => {
      expect(ui.safeParseBoolean('1', 'test')).toBe(1)
      expect(ui.safeParseBoolean('2', 'test')).toBe(1)
      expect(ui.safeParseBoolean('5', 'test')).toBe(1)
      expect(ui.safeParseBoolean('-1', 'test')).toBe(1)
      expect(ui.safeParseBoolean('0.5', 'test')).toBe(1)
      expect(ui.safeParseBoolean('3.14', 'test')).toBe(1)
    })

    it('should keep 0 as 0 (false)', () => {
      expect(ui.safeParseBoolean('0', 'test')).toBe(0)
    })

    it('should throw STOError for invalid numeric inputs', () => {
      const invalidInputs = ['abc', '1.2.3', '123abc', 'hello', '1..2', 'NaN']

      invalidInputs.forEach(input => {
        expect(() => {
          ui.safeParseBoolean(input, 'testParam')
        }).toThrow(STOError)

        try {
          ui.safeParseBoolean(input, 'testParam')
        } catch (error) {
          expect(error.name).toBe('STOError')
          expect(error.code).toBe('INVALID_PARAMETER_BOOLEAN')
          expect(error.message).toContain('Invalid boolean for testParam')
          expect(error.message).toContain(`'${input}'`)
        }
      })
    })

    // Regression test for the original bug
    it('should transform invalid boolean values like 2, 3, -1 to 1', () => {
      // These are the exact scenarios from the bug report
      expect(ui.safeParseBoolean('2', 'active')).toBe(1)
      expect(ui.safeParseBoolean('3', 'active')).toBe(1)
      expect(ui.safeParseBoolean('-1', 'active')).toBe(1)
      expect(ui.safeParseBoolean('5', 'active')).toBe(1)
    })
  })

  describe('getParameterValues', () => {
    let mockContainer, mockInputs

    beforeEach(() => {
      mockInputs = []
      mockContainer = {
        querySelectorAll: vi.fn(() => mockInputs)
      }
      mockDocument.getElementById.mockReturnValue(mockContainer)
    })

    it('should return empty object when no container found', () => {
      mockDocument.getElementById.mockReturnValue(null)
      const result = ui.getParameterValues()
      expect(result).toEqual({})
    })

    it('should handle empty input values correctly', () => {
      mockInputs = [
        { name: 'tray', type: 'number', value: '' },
        { name: 'slot', type: 'number', value: '' },
        { name: 'active', type: 'number', value: '' }
      ]

      const result = ui.getParameterValues()
      expect(result).toEqual({
        tray: undefined,
        slot: undefined,
        active: undefined
      })
    })

    it('should parse valid number inputs correctly', () => {
      mockInputs = [
        { name: 'tray', type: 'number', value: '1' },
        { name: 'slot', type: 'number', value: '5' },
        { name: 'active', type: 'number', value: '0' },
        { name: 'textParam', type: 'text', value: 'hello' },
        { name: 'selectParam', type: 'select', value: 'option1' }
      ]

      const result = ui.getParameterValues()
      expect(result).toEqual({
        tray: 1,
        slot: 5,
        active: 0,
        textParam: 'hello',
        selectParam: 'option1'
      })
    })

    it('should use safeParseBoolean for boolean parameters and transform values', () => {
      // Set up currentParameterCommand with boolean parameter definitions
      ui.currentParameterCommand = {
        commandDef: {
          parameters: {
            tray: { type: 'number' },
            slot: { type: 'number' },
            active: { type: 'boolean' },  // Boolean parameter
            textParam: { type: 'text' }
          }
        }
      }

      mockInputs = [
        { name: 'tray', type: 'number', value: '1' },
        { name: 'slot', type: 'number', value: '5' },
        { name: 'active', type: 'number', value: '2' }, // Invalid boolean value - should be transformed
        { name: 'textParam', type: 'text', value: 'hello' }
      ]

      const result = ui.getParameterValues()
      expect(result).toEqual({
        tray: 1,          // Regular number - parsed as-is
        slot: 5,          // Regular number - parsed as-is
        active: 1,        // Boolean - 2 transformed to 1 (true)
        textParam: 'hello'
      })
    })

    it('should use safeParseBoolean for boolean parameters and keep 0 as 0', () => {
      // Set up currentParameterCommand with boolean parameter definitions
      ui.currentParameterCommand = {
        commandDef: {
          parameters: {
            tray: { type: 'number' },
            active: { type: 'boolean' },  // Boolean parameter
            textParam: { type: 'text' }
          }
        }
      }

      mockInputs = [
        { name: 'tray', type: 'number', value: '1' },
        { name: 'active', type: 'number', value: '0' }, // Valid boolean value - should stay 0
        { name: 'textParam', type: 'text', value: 'hello' }
      ]

      const result = ui.getParameterValues()
      expect(result).toEqual({
        tray: 1,          // Regular number - parsed as-is
        active: 0,        // Boolean - 0 stays 0 (false)
        textParam: 'hello'
      })
    })

    it('should throw STOError for invalid number inputs', () => {
      mockInputs = [
        { name: 'tray', type: 'number', value: 'abc' },
        { name: 'slot', type: 'number', value: '1.2.3' }
      ]

      expect(() => ui.getParameterValues()).toThrow(STOError)
    })

    it('should ignore inputs without names', () => {
      mockInputs = [
        { type: 'number', value: '123' }, // no name
        { name: '', type: 'text', value: 'test' }, // empty name
        { name: 'validParam', type: 'text', value: 'value' }
      ]

      const result = ui.getParameterValues()
      expect(result).toEqual({
        validParam: 'value'
      })
    })
  })

  describe('updateParameterPreview Error Handling', () => {
    let mockPreviewElement

    beforeEach(() => {
      mockPreviewElement = {
        textContent: '',
        style: { color: '' }
      }
      mockDocument.getElementById.mockReturnValue(mockPreviewElement)

      ui.currentParameterCommand = {
        categoryId: 'testCategory',
        commandId: 'testCommand',
        commandDef: { name: 'Test Command', command: 'TestCommand', parameters: {} }
      }
    })

    it('should return early if no currentParameterCommand', async () => {
      ui.currentParameterCommand = null
      await ui.updateParameterPreview()
      expect(ui.request).not.toHaveBeenCalled()
    })

    it('should display validation error when invalid numbers detected', async () => {
      // Mock getParameterValues to throw validation error
      const getParameterValuesSpy = vi.spyOn(ui, 'getParameterValues')
      getParameterValuesSpy.mockImplementation(() => {
        throw new STOError('Invalid number for tray: \'abc\' is not a valid number', 'INVALID_PARAMETER_NUMBER')
      })

      await ui.updateParameterPreview()

      expect(mockPreviewElement.textContent).toBe('Invalid number for tray: \'abc\' is not a valid number')
      expect(mockPreviewElement.style.color).toBe('#d63031')
    })

    it('should display generic error message when error has no message', async () => {
      const getParameterValuesSpy = vi.spyOn(ui, 'getParameterValues')
      getParameterValuesSpy.mockImplementation(() => {
        const error = new STOError('', 'INVALID_PARAMETER_NUMBER')
        error.message = null
        throw error
      })

      await ui.updateParameterPreview()

      expect(mockPreviewElement.textContent).toBe('Invalid parameter values')
      expect(mockPreviewElement.style.color).toBe('#d63031')
    })

    it('should reset preview color on successful command generation', async () => {
      // Mock successful parameter validation
      vi.spyOn(ui, 'getParameterValues').mockReturnValue({ tray: 1, slot: 2 })

      // Mock successful command building
      ui.request.mockResolvedValue('+TrayExecByTray 1 2')

      // Start with error color
      mockPreviewElement.style.color = '#d63031'

      await ui.updateParameterPreview()

      expect(mockPreviewElement.style.color).toBe('')
      expect(mockPreviewElement.textContent).toBe('+TrayExecByTray 1 2')
    })
  })

  describe('saveParameterCommand Error Handling', () => {
    beforeEach(() => {
      // Mock cache state
      ui.cache.currentEnvironment = 'space'
      ui.cache.selectedKey = 'F1'

      ui.currentParameterCommand = {
        categoryId: 'testCategory',
        commandId: 'testCommand',
        isEditing: false,
        commandDef: { name: 'Test Command', command: 'TestCommand', parameters: {} }
      }
    })

    it('should show warning toast when no key selected', async () => {
      ui.cache.selectedKey = null

      await ui.saveParameterCommand()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Please select a key first',
        'warning'
      )
    })

    it('should show warning toast when no currentParameterCommand', async () => {
      ui.currentParameterCommand = null

      await ui.saveParameterCommand()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Please select a key first',
        'warning'
      )
    })

    it('should show error toast when validation fails', async () => {
      // Mock getParameterValues to throw validation error
      vi.spyOn(ui, 'getParameterValues').mockImplementation(() => {
        throw new STOError('Invalid number for tray: \'abc\' is not a valid number', 'INVALID_PARAMETER_NUMBER')
      })

      await ui.saveParameterCommand()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Invalid number for tray: \'abc\' is not a valid number',
        'error'
      )
    })

    it('should show generic error toast when error has no message', async () => {
      vi.spyOn(ui, 'getParameterValues').mockImplementation(() => {
        const error = new STOError('', 'INVALID_PARAMETER_NUMBER')
        error.message = null
        throw error
      })

      await ui.saveParameterCommand()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Invalid parameter values',
        'error'
      )
    })

    it('should proceed with command building when validation passes', async () => {
      // Mock successful parameter validation
      vi.spyOn(ui, 'getParameterValues').mockReturnValue({ tray: 1, slot: 2 })

      // Mock successful command building
      ui.request.mockResolvedValue('+TrayExecByTray 1 2')

      const expectedCommandDef = ui.currentParameterCommand.commandDef

      await ui.saveParameterCommand()

      expect(ui.request).toHaveBeenCalledWith('parameter-command:build', {
        categoryId: 'testCategory',
        commandId: 'testCommand',
        commandDef: expectedCommandDef,
        params: { tray: 1, slot: 2 }
      })
    })
  })

  describe('Integration Tests', () => {
    it('should prevent command building with NaN parameters', async () => {
      // Mock parameter inputs container
      const mockContainer = {
        querySelectorAll: vi.fn(() => [
          { name: 'tray', type: 'number', value: 'abc' }, // invalid
          { name: 'slot', type: 'number', value: '2' }  // valid
        ])
      }
      // Mock preview element
      const mockPreviewElement = { textContent: '', style: { color: '' } }

      mockDocument.getElementById.mockImplementation((id) => {
        if (id === 'parameterInputs') {
          return mockContainer
        } else if (id === 'parameterCommandPreview') {
          return mockPreviewElement
        }
        return null
      })

      ui.currentParameterCommand = {
        categoryId: 'testCategory',
        commandId: 'testCommand',
        commandDef: { name: 'Test Command', command: 'TestCommand', parameters: {} }
      }

      await ui.updateParameterPreview()

      expect(mockPreviewElement.textContent).toContain('Invalid number for tray')
      expect(mockPreviewElement.style.color).toBe('#d63031')
      expect(ui.request).not.toHaveBeenCalled()
    })

    it('should allow command building with valid parameters', async () => {
      // Mock parameter inputs container
      const mockContainer = {
        querySelectorAll: vi.fn(() => [
          { name: 'tray', type: 'number', value: '1' },
          { name: 'slot', type: 'number', value: '2' }
        ])
      }
      // Mock preview element
      const mockPreviewElement = { textContent: '', style: { color: '' } }

      mockDocument.getElementById.mockImplementation((id) => {
        if (id === 'parameterInputs') {
          return mockContainer
        } else if (id === 'parameterCommandPreview') {
          return mockPreviewElement
        }
        return null
      })

      ui.currentParameterCommand = {
        categoryId: 'testCategory',
        commandId: 'testCommand',
        commandDef: { name: 'Test Command', command: 'TestCommand', parameters: {} }
      }

      ui.request.mockResolvedValue('+TrayExecByTray 1 2')

      await ui.updateParameterPreview()

      expect(mockPreviewElement.textContent).toBe('+TrayExecByTray 1 2')
      expect(mockPreviewElement.style.color).toBe('')
      expect(ui.request).toHaveBeenCalledWith('parameter-command:build', {
        categoryId: 'testCategory',
        commandId: 'testCommand',
        commandDef: ui.currentParameterCommand.commandDef,
        params: { tray: 1, slot: 2 }
      })
    })
  })

  describe('Modal Regeneration', () => {
    it('should register regeneration callback when creating modal', () => {
      // Mock DOM elements for modal creation
      const mockModal = {
        id: 'parameterModal',
        innerHTML: '',
        appendChild: vi.fn(),
        querySelectorAll: vi.fn(() => []),
        replaceWith: vi.fn()
      }

      const mockBody = { appendChild: vi.fn() }
      mockDocument.createElement.mockReturnValue(mockModal)
      mockDocument.body = mockBody
      mockDocument.getElementById.mockReturnValue(mockModal)

      // Add 'cancel' translation to mock i18n
      mockI18n.t.mockImplementation((key) => {
        const translations = {
          'cancel': 'Cancel',
          'add_command': 'Add Command',
          'generated_command': 'Generated Command:',
          'parameter_configuration': 'Parameter Configuration'
        }
        return translations[key] || key
      })

      ui.createParameterModal()

      expect(mockModalManager.registerRegenerateCallback).toHaveBeenCalledWith(
        'parameterModal',
        expect.any(Function)
      )
    })

    it('should regenerate modal content while preserving state', () => {
      // Mock modal element
      const mockModal = {
        id: 'parameterModal',
        innerHTML: '',
        querySelectorAll: vi.fn(() => [])
      }

      mockDocument.getElementById.mockReturnValue(mockModal)

      // Add translations including 'save' for editing mode
      mockI18n.t.mockImplementation((key) => {
        const translations = {
          'cancel': 'Cancel',
          'add_command': 'Add Command',
          'save': 'Save',
          'generated_command': 'Generated Command:',
          'parameter_configuration': 'Parameter Configuration'
        }
        return translations[key] || key
      })

      // Set up current parameter command in editing mode
      ui.currentParameterCommand = {
        commandDef: { name: 'Test Command', parameters: {} },
        isEditing: true
      }

      // Mock populateParameterModalForEdit method
      ui.populateParameterModalForEdit = vi.fn()
      ui.getParameterValues = vi.fn(() => ({ tray: '1', slot: '2' }))

      // Call regeneration
      ui.regenerateParameterModal()

      // Verify modal HTML was updated
      expect(mockModal.innerHTML).toContain('Cancel')
      expect(mockModal.innerHTML).toContain('Save') // Should show 'Save' in editing mode
      expect(mockModal.innerHTML).toContain('Generated Command:')
      expect(mockModal.innerHTML).toContain('Parameter Configuration')

      // Verify state preservation method was called
      expect(ui.populateParameterModalForEdit).toHaveBeenCalledWith(
        ui.currentParameterCommand.commandDef,
        { tray: '1', slot: '2' }
      )
    })

    it('should unregister regeneration callback when cancelling', () => {
      ui.cancelParameterCommand()

      expect(mockModalManager.unregisterRegenerateCallback).toHaveBeenCalledWith('parameterModal')
    })

    it('should unregister regeneration callback when saving', async () => {
      // Set up for successful save
      ui.cache.currentEnvironment = 'space'
      ui.cache.selectedKey = 'F1'
      ui.currentParameterCommand = {
        categoryId: 'testCategory',
        commandId: 'testCommand',
        commandDef: { name: 'Test Command', command: 'TestCommand', parameters: {} }
      }

      // Mock parameter inputs and preview
      const mockContainer = {
        querySelectorAll: vi.fn(() => [
          { name: 'tray', type: 'number', value: '1' },
          { name: 'slot', type: 'number', value: '2' }
        ])
      }
      const mockPreviewElement = { textContent: '', style: { color: '' } }

      mockDocument.getElementById.mockImplementation((id) => {
        if (id === 'parameterInputs') return mockContainer
        if (id === 'parameterCommandPreview') return mockPreviewElement
        return null
      })

      ui.request.mockResolvedValue('+TrayExecByTray 1 2')

      await ui.saveParameterCommand()

      expect(mockModalManager.unregisterRegenerateCallback).toHaveBeenCalledWith('parameterModal')
    })
  })
})
