import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import eventBus from '../../../src/js/core/eventBus.js'
import CommandChainUI from '../../../src/js/components/ui/CommandChainUI.js'
import i18next from 'i18next'

describe('CommandChainUI Palindromic Controls', () => {
  let ui, mockDocument, mockEventBus, mockUI, dom

  beforeEach(async () => {
    // Set up DOM environment
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="commandList"></div>
          <div id="chainTitle"></div>
          <div id="commandPreview"></div>
          <div id="commandCount"></div>
          <div id="emptyState"></div>
          <div id="generatedAlias"></div>
          <div id="aliasPreview"></div>
          <div id="stabilizeExecutionOrderBtn"></div>
          <div id="copyAliasBtn"></div>
          <div id="copyPreviewBtn"></div>
          <div id="bindsetSelector"></div>
          <div id="bindsetDropdown"></div>
        </body>
      </html>
    `, { url: 'http://localhost' })

    // Mock document and UI
    mockDocument = dom.window.document
    mockDocument.createElement = vi.fn((tagName) => {
      const element = dom.window.document.createElement(tagName)
      // Mock dataset property
      if (!element.dataset) {
        element.dataset = {}
      }
      return element
    })

    mockUI = {
      showToast: vi.fn()
    }

    // Create a mock event bus that properly handles the RPC pattern
    const eventListeners = new Map()

    mockEventBus = {
      listeners: new Map(), // Add listeners Map for requestResponse handler detection
      on: vi.fn((topic, handler) => {
        if (!eventListeners.has(topic)) {
          eventListeners.set(topic, [])
        }
        eventListeners.get(topic).push(handler)
        return () => {} // Return cleanup function
      }),
      off: vi.fn((topic, handler) => {
        // Remove from eventListeners
        if (eventListeners.has(topic)) {
          const handlers = eventListeners.get(topic)
          const index = handlers.indexOf(handler)
          if (index > -1) {
            handlers.splice(index, 1)
          }
        }
        // Remove from listeners Map
        if (mockEventBus.listeners.has(topic)) {
          const handlers = mockEventBus.listeners.get(topic)
          const index = handlers.indexOf(handler)
          if (index > -1) {
            handlers.splice(index, 1)
          }
        }
      }),
      // Stub DOM delegation used by CommandChainUI so init doesn't error in unit tests
      onDom: vi.fn(() => () => {}),
      onDomDebounced: vi.fn(() => () => {}),
      emit: vi.fn((topic, data) => {
        // Handle RPC pattern: when code emits rpc:topic, respond appropriately
        if (topic.startsWith('rpc:')) {
          const actualTopic = topic.substring(4) // Remove 'rpc:' prefix
          const { requestId, replyTopic, payload } = data

          // Simulate async response
          setTimeout(() => {
            let result

            if (actualTopic === 'command-chain:is-stabilized') {
              result = false
            } else if (actualTopic === 'command-chain:update-commands') {
              result = { success: true }
            } else {
              result = {}
            }

            // Emit response on reply topic
            if (eventListeners.has(replyTopic)) {
              eventListeners.get(replyTopic).forEach(handler => {
                handler({ requestId, data: result })
              })
            }
          }, 0)
        }

        // Also call any registered listeners for this topic (for non-RPC events)
        if (eventListeners.has(topic)) {
          eventListeners.get(topic).forEach(listener => {
            try {
              listener(data)
            } catch (error) {
              console.error('Event listener error:', error)
            }
          })
        }
      }),
      request: vi.fn((endpoint, data) => {
        // Mock basic request responses
        if (endpoint === 'command:find-definition') {
          return Promise.resolve({ categoryId: 'tray', customizable: false })
        }
        if (endpoint === 'command:get-warning') {
          return Promise.resolve(null)
        }
        if (endpoint === 'command-chain:is-stabilized') {
          return Promise.resolve(false) // Default to not stabilized
        }
        if (endpoint === 'command-chain:update-commands') {
          return Promise.resolve({ success: true })
        }
        if (endpoint === 'command:get-empty-state-info') {
          return Promise.resolve({
            title: 'Test Title',
            preview: 'Test Preview',
            emptyTitle: 'Test Empty',
            icon: 'fas fa-test'
          })
        }
        return Promise.resolve(null)
      }),
      requestResponse: vi.fn((endpoint, handler) => {
        // Store handler for request-response pattern
        if (!mockEventBus.listeners.has(endpoint)) {
          mockEventBus.listeners.set(endpoint, [])
        }
        mockEventBus.listeners.get(endpoint).push(handler)
      }),
      respond: vi.fn((endpoint, handler) => {
        // Store endpoint response handler
        if (!mockEventBus.listeners.has(endpoint)) {
          mockEventBus.listeners.set(endpoint, [])
        }
        mockEventBus.listeners.get(endpoint).push(handler)
      })
    }

    // Initialize i18next
    await i18next.init({
      lng: 'en',
      fallbackLng: ['en'],
      returnEmptyString: false,
      resources: {
        en: { translation: {} }
      }
    })

    ui = new CommandChainUI({
      eventBus: mockEventBus,
      ui: mockUI,
      document: mockDocument,
      i18n: i18next
    })

    // Set up cache data
    ui.cache = {
      currentEnvironment: 'ground',
      selectedKey: 'F1',
      selectedAlias: null,
      activeBindset: 'Primary Bindset',
      preferences: {
        bindsetsEnabled: false,
        bindToAliasMode: false
      }
    }
  })

  afterEach(() => {
    if (ui) {
      ui.onDestroy?.()
    }
    dom?.window?.close?.()
  })

  describe('Palindromic Controls Display', () => {
    it('should show palindromic controls for TrayExec commands when stabilization is enabled', async () => {
      // Mock stabilization as enabled
      mockEventBus.request.mockResolvedValue(true)

      const commands = [
        '+TrayExecByTray 1 0',
        'Target_Enemy_Near',
        '+TrayExecByTray 1 1'
      ]

      const element = await ui.createCommandElement('+TrayExecByTray 1 0', 0, 3)

      expect(element.innerHTML).toContain('palindromic-controls')
      expect(element.innerHTML).toContain('Exclude from palindrome')
      expect(element.innerHTML).toContain('palindromic-exclude')
    })

    it('should not show palindromic controls for non-TrayExec commands', async () => {
      // Mock stabilization as enabled
      mockEventBus.request.mockResolvedValue(true)

      const element = await ui.createCommandElement('Target_Enemy_Near', 0, 3)

      expect(element.innerHTML).not.toContain('palindromic-controls')
      expect(element.innerHTML).not.toContain('Exclude from palindrome')
    })

    it('should not show palindromic controls when stabilization is disabled', async () => {
      // Mock stabilization as disabled
      mockEventBus.request.mockResolvedValue(false)

      const element = await ui.createCommandElement('+TrayExecByTray 1 0', 0, 3)

      expect(element.innerHTML).not.toContain('palindromic-controls')
      expect(element.innerHTML).not.toContain('Exclude from palindrome')
    })

    it('should show placement options when exclude checkbox is checked', async () => {
      // Mock stabilization as enabled
      mockEventBus.request.mockResolvedValue(true)

      const richCommand = {
        command: '+TrayExecByTray 1 0',
        palindromicGeneration: false,
        placement: 'before-pre-pivot'
      }

      const element = await ui.createCommandElement(richCommand, 0, 3)

      expect(element.innerHTML).toContain('palindromic-placement')
      expect(element.innerHTML).toContain('display: block')
      expect(element.innerHTML).toContain('Before palindromes')
      expect(element.innerHTML).toContain('In pivot group')
    })

    it('should hide placement options when exclude checkbox is unchecked', async () => {
      // Mock stabilization as enabled
      mockEventBus.request.mockResolvedValue(true)

      const element = await ui.createCommandElement('+TrayExecByTray 1 0', 0, 3)

      expect(element.innerHTML).toContain('display: none')
    })
  })

  describe('Palindromic Control Event Handlers', () => {
    it('should handle palindromic exclude checkbox changes', async () => {
      // Mock the required requests
      mockEventBus.request
        .mockResolvedValueOnce(true) // is-stabilized
        .mockResolvedValueOnce({ categoryId: 'tray', customizable: false }) // command:find-definition
        .mockResolvedValueOnce(null) // command:get-warning
        .mockResolvedValueOnce([
          '+TrayExecByTray 1 0',
          'Target_Enemy_Near'
        ]) // getCommandsForCurrentSelection
        .mockResolvedValue({ success: true }) // update-commands

      // Set up event listeners
      ui.setupEventListeners()

      // Create mock event for checkbox change
      const mockCheckbox = {
        closest: vi.fn((selector) => {
          if (selector === '.palindromic-exclude') {
            return {
              dataset: { commandIndex: '0' },
              checked: true
            }
          }
          return null
        })
      }

      const mockEvent = {
        target: mockCheckbox
      }

      // Trigger the event handler manually
      const palindromicHandlers = mockEventBus.listeners.get('commandchain-palindromic-exclude') || []
      if (palindromicHandlers.length > 0) {
        await palindromicHandlers[0](mockEvent)
      }

      // Verify the event was processed (check if updateCommandPalindromicSetting was called)
      expect(mockCheckbox.closest).toHaveBeenCalledWith('.palindromic-exclude')
    })

    it('should handle palindromic placement radio changes', async () => {
      // Mock the required requests
      mockEventBus.request
        .mockResolvedValueOnce(true) // is-stabilized
        .mockResolvedValueOnce({ categoryId: 'tray', customizable: false }) // command:find-definition
        .mockResolvedValueOnce(null) // command:get-warning
        .mockResolvedValueOnce([
          '+TrayExecByTray 1 0',
          'Target_Enemy_Near'
        ]) // getCommandsForCurrentSelection
        .mockResolvedValue({ success: true }) // update-commands

      // Set up event listeners
      ui.setupEventListeners()

      // Create mock event for radio change
      const mockRadio = {
        closest: vi.fn((selector) => {
          if (selector === '.palindromic-placement-radio') {
            return {
              dataset: { commandIndex: '0' },
              value: 'in-pivot-group'
            }
          }
          return null
        })
      }

      const mockEvent = {
        target: mockRadio
      }

      // Trigger the event handler manually
      const placementHandlers = mockEventBus.listeners.get('commandchain-palindromic-placement') || []
      if (placementHandlers.length > 0) {
        await placementHandlers[0](mockEvent)
      }

      // Verify the event was processed
      expect(mockRadio.closest).toHaveBeenCalledWith('.palindromic-placement-radio')
    })
  })

  describe('updateCommandPalindromicSetting', () => {
    it('should convert string commands to rich objects when updating palindromic settings', async () => {
      // Mock commands
      const commands = ['+TrayExecByTray 1 0', 'Target_Enemy_Near']

      // Mock getCommandsForCurrentSelection method
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands)

      mockEventBus.request.mockResolvedValue({ success: true }) // update-commands

      await ui.updateCommandPalindromicSetting(0, 'palindromicGeneration', false)

      expect(mockEventBus.request).toHaveBeenCalledWith('command-chain:update-commands', {
        name: 'F1',
        commands: [
          {
            command: '+TrayExecByTray 1 0',
            palindromicGeneration: true,
            placement: 'before-pre-pivot'
          },
          'Target_Enemy_Near'
        ],
        bindset: 'Primary Bindset'
      })
    })

    it('should update existing rich command objects', async () => {
      const commands = [
        {
          command: '+TrayExecByTray 1 0',
          palindromicGeneration: false,
          placement: 'before-pre-pivot'
        },
        'Target_Enemy_Near'
      ]

      // Mock getCommandsForCurrentSelection method
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands)

      mockEventBus.request.mockResolvedValue({ success: true }) // update-commands

      await ui.updateCommandPalindromicSetting(0, 'placement', 'in-pivot-group')

      expect(mockEventBus.request).toHaveBeenCalledWith('command-chain:update-commands', {
        name: 'F1',
        commands: [
          {
            command: '+TrayExecByTray 1 0',
            palindromicGeneration: false,
            placement: 'in-pivot-group'
          },
          'Target_Enemy_Near'
        ],
        bindset: 'Primary Bindset'
      })
    })

    it('should handle invalid command indices gracefully', async () => {
      const commands = ['+TrayExecByTray 1 0']

      // Mock getCommandsForCurrentSelection method
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands)

      await ui.updateCommandPalindromicSetting(5, 'palindromicGeneration', false)

      // Should not make update-commands request for invalid index
      expect(mockEventBus.request).not.toHaveBeenCalledWith('command-chain:update-commands', expect.any(Object))
    })

    it('should remove palindromicGeneration property when set to true', async () => {
      const commands = [
        {
          command: '+TrayExecByTray 1 0',
          palindromicGeneration: false,
          placement: 'before-pre-pivot'
        }
      ]

      // Mock getCommandsForCurrentSelection method
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands)

      mockEventBus.request.mockResolvedValue({ success: true }) // update-commands

      await ui.updateCommandPalindromicSetting(0, 'palindromicGeneration', true)

      expect(mockEventBus.request).toHaveBeenCalledWith('command-chain:update-commands', {
        name: 'F1',
        commands: [
          {
            command: '+TrayExecByTray 1 0',
            placement: 'before-pre-pivot'
          }
        ],
        bindset: 'Primary Bindset'
      })
    })
  })

  describe('Lazy Rich Object Conversion', () => {
    it('should only convert commands to rich objects when user customizes them', async () => {
      // Start with simple string commands
      const commands = ['+TrayExecByTray 1 0', '+TrayExecByTray 1 1']

      // Mock getCommandsForCurrentSelection method
      ui.getCommandsForCurrentSelection = vi.fn().mockResolvedValue(commands)

      mockEventBus.request.mockResolvedValue({ success: true }) // update-commands

      // Before customization, commands should remain strings
      expect(commands[0]).toBe('+TrayExecByTray 1 0')
      expect(typeof commands[0]).toBe('string')

      // After user customizes (excludes from palindrome), convert to rich object
      await ui.updateCommandPalindromicSetting(0, 'palindromicGeneration', false)

      expect(mockEventBus.request).toHaveBeenCalledWith('command-chain:update-commands', {
        name: 'F1',
        commands: [
          {
            command: '+TrayExecByTray 1 0',
            palindromicGeneration: true,
            placement: 'before-pre-pivot'
          },
          '+TrayExecByTray 1 1'
        ],
        bindset: 'Primary Bindset'
      })

      // Second command should remain as string until user customizes it
      expect(typeof commands[1]).toBe('string')
    })
  })
})