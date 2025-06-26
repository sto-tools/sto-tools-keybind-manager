import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import eventBus from '../../src/js/core/eventBus.js'
import { request } from '../../src/js/core/requestResponse.js'
import CommandLibraryService from '../../src/js/components/services/CommandLibraryService.js'
import CommandService from '../../src/js/components/services/CommandService.js'
import CommandChainService from '../../src/js/components/services/CommandChainService.js'
import CommandChainUI from '../../src/js/components/ui/CommandChainUI.js'

// Mock i18n that works properly
const mockI18n = {
  t: vi.fn((key) => {
    const translations = {
      'select_a_key_to_edit': 'Select a key to edit',
      'select_an_alias_to_edit': 'Select an alias to edit',
      'select_a_key_to_see_the_generated_command': 'Select a key to see the generated command',
      'select_an_alias_to_see_the_generated_command': 'Select an alias to see the generated command',
      'no_key_selected': 'No Key Selected',
      'no_alias_selected': 'No Alias Selected',
      'select_key_from_left_panel': 'Select a key from the left panel to view and edit its command chain.',
      'select_alias_from_left_panel': 'Select an alias from the left panel to view and edit its command chain.',
      'click_add_command_to_start_building_your_command_chain': 'Click "Add Command" to start building your command chain for',
      'click_add_command_to_start_building_your_alias_chain': 'Click "Add Command" to start building your alias chain for',
      'no_commands': 'No Commands'
    }
    return translations[key]
  })
}

// Mock storage
const mockStorage = {
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  getAllData: vi.fn()
}

// Mock UI
const mockUI = {
  showToast: vi.fn()
}

describe('Command Chain Display Debug Tests', () => {
  let dom
  let originalDocument
  let commandLibraryService
  let commandService 
  let commandChainService
  let commandChainUI

  beforeEach(() => {
    // Store original document if it exists
    originalDocument = global.document

    // Create JSDOM environment
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="commandList"></div>
          <div id="chainTitle">Initial Title</div>
          <div id="commandPreview">Initial Preview</div>
          <span id="commandCount">0</span>
          <div id="emptyState"></div>
        </body>
      </html>
    `, { 
      url: 'http://localhost',
      pretendToBeVisual: true,
      resources: 'usable'
    })

    global.window = dom.window
    global.document = dom.window.document

    // Setup test profile data
    const testProfile = {
      name: 'Test Profile',
      description: 'Test profile for command chain display',
      currentEnvironment: 'space',
      builds: {
        space: {
          keys: {
            'F1': [
              { command: 'TestSpaceCommand', text: 'Test Space Command', type: 'space', icon: '🚀' }
            ]
          }
        },
        ground: { keys: {} },
        alias: { keys: {} }
      },
      aliases: {
        'TestAlias': {
          description: 'Test alias for command chain',
          commands: 'TestAliasCommand1 $$ TestAliasCommand2'
        }
      }
    }

    mockStorage.getProfile.mockReturnValue(testProfile)
    mockStorage.getAllData.mockReturnValue({
      currentProfile: 'test-profile'
    })

    // Create services
    commandLibraryService = new CommandLibraryService({
      storage: mockStorage,
      eventBus,
      i18n: mockI18n,
      ui: mockUI
    })

    commandService = new CommandService({
      storage: mockStorage,
      eventBus,
      i18n: mockI18n,
      ui: mockUI
    })

    commandChainService = new CommandChainService({
      i18n: mockI18n,
      commandLibraryService,
      commandService
    })

    commandChainUI = new CommandChainUI({
      eventBus,
      ui: mockUI,
      document: dom.window.document
    })

    // Initialize services
    commandLibraryService.init()
    commandService.init()
    commandChainService.init()
    commandChainUI.init()

    // Set up initial state directly on services
    commandLibraryService.currentProfile = 'test-profile'
    commandLibraryService.currentEnvironment = 'space'
    commandService.currentProfile = 'test-profile'
    commandService.currentEnvironment = 'space'
  })

  afterEach(() => {
    // Cleanup services first
    try {
      commandLibraryService?.destroy()
      commandService?.destroy()
      commandChainService?.destroy()
      commandChainUI?.destroy()
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Restore globals
    if (originalDocument) {
      global.document = originalDocument
    } else {
      delete global.document
    }
    delete global.window
    
    // Close DOM
    try {
      dom?.window?.close()
    } catch (e) {
      // Ignore cleanup errors
    }

    vi.clearAllMocks()
  })

  describe('Debug Empty State vs Selected State', () => {
    it('should debug empty state info when no selection', async () => {
      // Ensure no key is selected
      commandLibraryService.selectedKey = null
      commandLibraryService.selectedAlias = null
      commandService.selectedKey = null
      commandService.selectedAlias = null

      // Debug empty state info
      const emptyStateInfo = await request(eventBus, 'command:get-empty-state-info')
      console.log('Empty State Info (no selection):', emptyStateInfo)

      expect(emptyStateInfo.title).toBe('Select a key to edit')
      expect(emptyStateInfo.preview).toBe('Select a key to see the generated command')
      expect(emptyStateInfo.emptyTitle).toBe('No Key Selected')
      expect(emptyStateInfo.emptyDesc).toBe('Select a key from the left panel to view and edit its command chain.')
    })

    it('should debug empty state info when F1 is selected in space environment', async () => {
      // Select F1 key using proper event flow
      commandLibraryService.currentEnvironment = 'space'
      commandService.currentEnvironment = 'space'
      
      // Emit key-selected event instead of directly setting state
      eventBus.emit('key-selected', { key: 'F1' })

      // Debug empty state info
      const emptyStateInfo = await request(eventBus, 'command:get-empty-state-info')
      console.log('Empty State Info (F1 selected in space):', emptyStateInfo)

      // Debug commands
      const commands = await request(eventBus, 'command:get-for-selected-key')
      console.log('Commands for F1:', commands)

      expect(emptyStateInfo.title).toBe('Command Chain for F1')
      expect(emptyStateInfo.preview).toContain('F1')
      expect(commands.length).toBeGreaterThan(0)
    })

    it('should debug empty state info when TestAlias is selected in alias environment', async () => {
      // Switch to alias environment and select alias using proper event flow
      commandLibraryService.currentEnvironment = 'alias'
      commandService.currentEnvironment = 'alias'
      
      // Emit alias-selected event instead of directly setting state
      eventBus.emit('alias-selected', { name: 'TestAlias' })

      // Debug empty state info
      const emptyStateInfo = await request(eventBus, 'command:get-empty-state-info')
      console.log('Empty State Info (TestAlias selected in alias):', emptyStateInfo)

      // Debug commands
      const commands = await request(eventBus, 'command:get-for-selected-key')
      console.log('Commands for TestAlias:', commands)

      expect(emptyStateInfo.title).toBe('Alias Chain for TestAlias')
      expect(emptyStateInfo.preview).toContain('TestAlias')
    })

    it.skip('should debug UI render process', async () => {
      // Select F1 key using proper event flow
      commandLibraryService.currentEnvironment = 'space'
      eventBus.emit('key-selected', { key: 'F1' })

      // Debug before render
      console.log('Before render - Title element text:', dom.window.document.getElementById('chainTitle').textContent)
      console.log('Before render - Preview element text:', dom.window.document.getElementById('commandPreview').textContent)

      // Trigger render
      await commandChainUI.render()

      // Debug after render
      console.log('After render - Title element text:', dom.window.document.getElementById('chainTitle').textContent)
      console.log('After render - Preview element text:', dom.window.document.getElementById('commandPreview').textContent)
      console.log('After render - Command list HTML:', dom.window.document.getElementById('commandList').innerHTML)

      const titleElement = dom.window.document.getElementById('chainTitle')
      const previewElement = dom.window.document.getElementById('commandPreview')
      
      expect(titleElement.textContent).not.toBe('undefined')
      expect(previewElement.textContent).not.toBe('undefined')
      expect(titleElement.textContent).toBe('Command Chain for F1')
    })
  })
}) 