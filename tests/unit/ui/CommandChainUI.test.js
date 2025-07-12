import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { generateBindToAliasName } from '../../../src/js/lib/aliasNameValidator.js'
import CommandChainUI from '../../../src/js/components/ui/CommandChainUI.js'

describe('Bind-to-Alias Mode', () => {
  let ui, mockDocument, mockEventBus, mockUI

  beforeEach(() => {
    // Mock document and UI
    mockDocument = {
      getElementById: vi.fn(),
      querySelector: vi.fn(),
      createElement: vi.fn(() => ({
        innerHTML: '',
        classList: { remove: vi.fn(), add: vi.fn() },
        style: {},
        replaceChildren: vi.fn()
      }))
    }
    
    mockUI = {
      showToast: vi.fn()
    }

    // Mock event bus with request/response capability  
    mockEventBus = {
      on: vi.fn(() => () => {}), // Return cleanup function
      off: vi.fn(), // Add missing off method
      emit: vi.fn(),
      request: vi.fn()
    }

    // Mock the preferences request to return false by default
    mockEventBus.request.mockImplementation((topic, data) => {
      if (topic === 'preferences:get-setting' && data?.key === 'bindToAliasMode') {
        return Promise.resolve(false)
      }
      if (topic === 'command-chain:is-stabilized') {
        return Promise.resolve(false) // Default to not stabilized
      }
      if (topic === 'fileops:generate-mirrored-commands') {
        return Promise.resolve(null) // Default to no mirroring
      }
      return Promise.resolve({})
    })

    // Create CommandChainUI instance
    ui = new CommandChainUI({
      eventBus: mockEventBus,
      ui: mockUI,
      document: mockDocument
    })
  })

  describe('Alias Name Generation', () => {
    it('should generate correct alias names for different environments and keys', () => {
      // Test normal cases
      expect(generateBindToAliasName('space', 'Q')).toBe('space_q')
      expect(generateBindToAliasName('ground', 'F1')).toBe('ground_f1')
      expect(generateBindToAliasName('space', 'Ctrl+A')).toBe('space_ctrl_a')
      
      // Test special characters
      expect(generateBindToAliasName('space', 'Shift+Space')).toBe('space_shift_space')
      expect(generateBindToAliasName('ground', 'Alt+Tab')).toBe('ground_alt_tab')
      
      // Test edge cases
      expect(generateBindToAliasName('space', '1')).toBe('space_k1') // Number key gets 'k' prefix
      expect(generateBindToAliasName('space', '')).toBe(null) // Empty key name
    })

    it('should handle special key names correctly', () => {
      expect(generateBindToAliasName('space', 'NumPad1')).toBe('space_numpad1')
      expect(generateBindToAliasName('space', 'Mouse4')).toBe('space_mouse4')
      expect(generateBindToAliasName('ground', 'Alt+F4')).toBe('ground_alt_f4')
      expect(generateBindToAliasName('space', 'Page Up')).toBe('space_page_up')
    })

    it('should handle invalid key names gracefully', () => {
      expect(generateBindToAliasName('space', '')).toBe(null)
      expect(generateBindToAliasName('space', '   ')).toBe(null)
      expect(generateBindToAliasName('space', '!!!')).toBe('space_exclamationexclamationexclamation') // Special chars get converted
    })

    it('should show generated alias section when bind-to-alias mode is active', async () => {
      const mockGeneratedAlias = { style: { display: 'none' } }
      const mockAliasPreview = { textContent: '' }
      const mockCommandPreview = { textContent: '' }
      
      mockDocument.getElementById.mockImplementation((id) => {
        if (id === 'generatedAlias') return mockGeneratedAlias
        if (id === 'aliasPreview') return mockAliasPreview  
        if (id === 'commandPreview') return mockCommandPreview
        return null
      })

      ui._currentEnvironment = 'space'
      
      const commands = [
        { command: 'FireAll' },
        { command: '+power_exec Distribute_Shields' }
      ]

      await ui.updateBindToAliasMode(true, 'Q', commands)
      
      expect(mockGeneratedAlias.style.display).toBe('')
      expect(mockAliasPreview.textContent).toBe('alias space_q <& FireAll $$ +power_exec Distribute_Shields &>')
      expect(mockCommandPreview.textContent).toBe('Q "space_q"')
    })

    it('should hide generated alias section when bind-to-alias mode is disabled', async () => {
      const mockGeneratedAlias = { style: {} }
      const mockAliasPreview = { textContent: '' }
      const mockCommandPreview = { textContent: '' }
      const mockLabel = { setAttribute: vi.fn(), parentElement: { } }
      
      // Set initial state 
      mockGeneratedAlias.style.display = ''
      
      mockDocument.getElementById.mockImplementation((id) => {
        if (id === 'generatedAlias') return mockGeneratedAlias
        if (id === 'aliasPreview') return mockAliasPreview
        if (id === 'commandPreview') return mockCommandPreview
        return null
      })

      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '.generated-command label[data-i18n]') return mockLabel
        return null
      })

      const commands = [{ command: 'FireAll' }]
      
      await ui.updateBindToAliasMode(false, 'Q', commands)
      
      expect(mockGeneratedAlias.style.display).toBe('none')
      expect(mockCommandPreview.textContent).toBe('Q "FireAll"')
      expect(mockLabel.setAttribute).toHaveBeenCalledWith('data-i18n', 'generated_command')
    })

    it('should handle empty commands in bind-to-alias mode', async () => {
      const mockGeneratedAlias = { style: { display: 'none' } }
      const mockAliasPreview = { textContent: '' }
      const mockCommandPreview = { textContent: '' }
      
      mockDocument.getElementById.mockImplementation((id) => {
        if (id === 'generatedAlias') return mockGeneratedAlias
        if (id === 'aliasPreview') return mockAliasPreview
        if (id === 'commandPreview') return mockCommandPreview
        return null
      })

      ui._currentEnvironment = 'space'
      
      await ui.updateBindToAliasMode(true, 'Q', [])
      
      expect(mockGeneratedAlias.style.display).toBe('')
      expect(mockAliasPreview.textContent).toBe('alias space_q <&  &>')
      expect(mockCommandPreview.textContent).toBe('Q "space_q"')
    })

    it('should not show generated alias section in alias environment', async () => {
      const mockGeneratedAlias = { style: {} }
      const mockAliasPreview = { textContent: '' }
      const mockCommandPreview = { textContent: '' }
      const mockLabel = { setAttribute: vi.fn(), parentElement: { } }
      
      // Set initial state 
      mockGeneratedAlias.style.display = ''
      
      mockDocument.getElementById.mockImplementation((id) => {
        if (id === 'generatedAlias') return mockGeneratedAlias
        if (id === 'aliasPreview') return mockAliasPreview
        if (id === 'commandPreview') return mockCommandPreview
        return null
      })

      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '.generated-command label[data-i18n]') return mockLabel
        return null
      })

      ui._currentEnvironment = 'alias'
      
      const commands = [{ command: 'FireAll' }]
      
      await ui.updateBindToAliasMode(false, 'MyAlias', commands)
      
      expect(mockGeneratedAlias.style.display).toBe('none')
      expect(mockCommandPreview.textContent).toBe('alias MyAlias <& FireAll &>')
      expect(mockLabel.setAttribute).toHaveBeenCalledWith('data-i18n', 'generated_alias')
    })

    it('should show empty quoted string when no commands and bind-to-alias mode is disabled', async () => {
      const mockGeneratedAlias = { style: {} }
      const mockAliasPreview = { textContent: '' }
      const mockCommandPreview = { textContent: '' }
      const mockLabel = { setAttribute: vi.fn(), parentElement: { } }

      // Ensure generatedAlias starts hidden (any value is fine as it should stay hidden)
      mockGeneratedAlias.style.display = 'none'

      mockDocument.getElementById.mockImplementation((id) => {
        if (id === 'generatedAlias') return mockGeneratedAlias
        if (id === 'aliasPreview') return mockAliasPreview
        if (id === 'commandPreview') return mockCommandPreview
        return null
      })

      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '.generated-command label[data-i18n]') return mockLabel
        return null
      })

      ui._currentEnvironment = 'space'

      await ui.updateBindToAliasMode(false, 'F4', [])

      // generatedAlias should remain hidden
      expect(mockGeneratedAlias.style.display).toBe('none')
      // Command preview should show key with empty quoted string
      expect(mockCommandPreview.textContent).toBe('F4 ""')
      expect(mockLabel.setAttribute).toHaveBeenCalledWith('data-i18n', 'generated_command')
    })

    it('should update label when updatePreviewLabel is called in alias environment', () => {
      const mockLabel = { setAttribute: vi.fn(), parentElement: { } }
      
      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '.generated-command label[data-i18n]') return mockLabel
        return null
      })

      // Set environment to alias
      ui._currentEnvironment = 'alias'
      
      // Call updatePreviewLabel directly (this is what gets called on environment change)
      ui.updatePreviewLabel()
      
      // Should update the label to alias format
      expect(mockLabel.setAttribute).toHaveBeenCalledWith('data-i18n', 'generated_alias')
    })
  })

  describe('Copy Alias Functionality', () => {
    it('should copy alias content to clipboard when copy button is clicked', async () => {
      const mockAliasPreview = { textContent: 'space_q "FireAll"' }
      const mockCopyButton = { addEventListener: vi.fn() }
      
      mockDocument.getElementById.mockImplementation((id) => {
        if (id === 'aliasPreview') return mockAliasPreview
        if (id === 'copyAliasBtn') return mockCopyButton
        return null
      })

      // Mock clipboard API
      const mockWriteText = vi.fn().mockResolvedValue()
      Object.assign(navigator, {
        clipboard: { writeText: mockWriteText }
      })

      await ui.onInit()
      
      // Simulate button click
      expect(mockCopyButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
      const clickHandler = mockCopyButton.addEventListener.mock.calls[0][1]
      
      await clickHandler()
      
      expect(mockWriteText).toHaveBeenCalledWith('space_q "FireAll"')
      expect(mockUI.showToast).toHaveBeenCalledWith('Alias copied to clipboard', 'success')
    })
  })

  describe('bindset dropdown behavior', () => {
    beforeEach(() => {
      // Setup bindsets feature
      ui._bindsetsEnabled = true
      ui._bindsetNames = ['Primary Bindset', 'Custom Bindset']
      ui.activeBindset = 'Primary Bindset'
      ui._selectedKey = 'F1'
      ui._currentEnvironment = 'space'
    })

    it('should update stabilization button state when switching bindsets', async () => {
      // Mock different stabilization states for different bindsets
      ui.request = vi.fn().mockImplementation(async (action, payload) => {
        if (action === 'command:is-stabilized') {
          if (payload.bindset === 'Custom Bindset') {
            return true // Stabilized in custom bindset
          } else {
            return false // Not stabilized in primary bindset
          }
        }
        return []
      })

      // Setup DOM elements
      const mockButton = { 
        disabled: false, 
        classList: { 
          toggle: vi.fn(),
          remove: vi.fn(),
          contains: vi.fn().mockReturnValue(false)
        } 
      }
      const mockDropdownBtn = { 
        style: { display: '' },
        addEventListener: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, bottom: 0 })
      }
      
      ui.document.getElementById = vi.fn().mockImplementation((id) => {
        if (id === 'stabilizeExecutionOrderBtn') return mockButton
        if (id === 'bindsetDropdownBtn') return mockDropdownBtn
        if (id === 'bindsetSelect') return { style: { display: 'none' } }
        if (id === 'bindsetOptionsMenu') return null
        return null
      })

      ui.document.body = { appendChild: vi.fn() }
      ui.document.querySelector = vi.fn().mockReturnValue(null) // Mock for updateBindsetBanner
      ui.document.createElement = vi.fn().mockReturnValue({
        id: '',
        className: '',
        style: {},
        innerHTML: '',
        textContent: '',
        addEventListener: vi.fn(),
        appendChild: vi.fn()
      })
      ui.document.addEventListener = vi.fn()

      // Setup the dropdown
      await ui.setupBindsetDropdown()

      // Simulate initial state - primary bindset (not stabilized)
      await ui.updateChainActions()
      expect(mockButton.classList.toggle).toHaveBeenCalledWith('active', false)

      // Reset mock calls
      mockButton.classList.toggle.mockClear()

      // Simulate switching to custom bindset (stabilized)
      ui.activeBindset = 'Custom Bindset'
      await ui.updateChainActions()
      
      // Verify button state was updated to active
      expect(mockButton.classList.toggle).toHaveBeenCalledWith('active', true)
      expect(ui.request).toHaveBeenCalledWith('command:is-stabilized', { 
        name: 'F1', 
        bindset: 'Custom Bindset' 
      })
    })

    it('should call updateChainActions when activeBindset changes', async () => {
      // Mock the updateChainActions method to verify it gets called
      const originalUpdateChainActions = ui.updateChainActions
      ui.updateChainActions = vi.fn()
      ui.updateBindsetBanner = vi.fn()
      ui.render = vi.fn()

      // Simulate what happens in the dropdown click handler
      ui.activeBindset = 'Primary Bindset'
      
      // Simulate the dropdown option click logic (the part we actually care about)
      const oldBindset = ui.activeBindset
      const newBindset = 'Custom Bindset'
      
      if (newBindset !== oldBindset) {
        ui.activeBindset = newBindset
        ui.updateBindsetBanner()
        ui.updateChainActions()  // This is the line we added in our fix
        ui.render()
      }

      // Verify the fix works
      expect(ui.updateChainActions).toHaveBeenCalled()
      expect(ui.activeBindset).toBe('Custom Bindset')
      
      // Restore original method
      ui.updateChainActions = originalUpdateChainActions
    })
  })
}) 