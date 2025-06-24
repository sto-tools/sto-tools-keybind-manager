import { describe, it, expect, beforeEach, vi } from 'vitest'

import CommandLibraryUI from '../../src/js/components/ui/CommandLibraryUI.js'

// Mock dependencies
const mockService = {
  selectedKey: null,
  currentEnvironment: 'space',
  getCommandsForSelectedKey: vi.fn().mockReturnValue([]),
  getEmptyStateInfo: vi.fn(),
  findCommandDefinition: vi.fn(),
  getCommandWarning: vi.fn(),
  addCommandFromLibrary: vi.fn(),
  filterCommandLibrary: vi.fn(),
  moveCommand: vi.fn(),
  getCommandCategories: vi.fn(),
  emit: vi.fn(),
  i18n: {
    t: vi.fn((key) => key)
  }
}

const mockEventBus = {
  on: vi.fn(),
  emit: vi.fn(),
  off: vi.fn(),
  onDom: vi.fn()
}

const mockUI = {
  showToast: vi.fn(),
  initDragAndDrop: vi.fn()
}

const mockModalManager = {
  show: vi.fn(),
  hide: vi.fn()
}

const mockDocument = {
  getElementById: vi.fn(),
  createElement: vi.fn(),
  querySelector: vi.fn(),
  querySelectorAll: vi.fn()
}

// Mock DOM elements
const mockContainer = {
  innerHTML: '',
  appendChild: vi.fn(),
  style: {}
}

const mockTitle = {
  textContent: ''
}

const mockPreview = {
  textContent: ''
}

const mockCommandCount = {
  textContent: ''
}

const mockEmptyState = {
  style: { display: 'none' }
}

describe('CommandLibraryUI', () => {
  let ui

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup mock DOM elements
    mockDocument.getElementById.mockImplementation((id) => {
      switch (id) {
        case 'commandList':
          return mockContainer
        case 'chainTitle':
          return mockTitle
        case 'commandPreview':
          return mockPreview
        case 'commandCount':
          return mockCommandCount
        case 'emptyState':
          return mockEmptyState
        case 'commandCategories':
          return mockContainer
        case 'stabilizeExecutionOrder':
          return { checked: false }
        default:
          return null
      }
    })

    ui = new CommandLibraryUI({
      service: mockService,
      eventBus: mockEventBus,
      ui: mockUI,
      modalManager: mockModalManager,
      document: mockDocument
    })
  })

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(ui.service).toBe(mockService)
      expect(ui.ui).toBe(mockUI)
      expect(ui.modalManager).toBe(mockModalManager)
      expect(ui.document).toBe(mockDocument)
      expect(ui.eventListenersSetup).toBe(false)
    })
  })

  describe('onInit', () => {
    it('should setup event listeners', () => {
      const setupSpy = vi.spyOn(ui, 'setupEventListeners')
      ui.onInit()
      expect(setupSpy).toHaveBeenCalled()
    })
  })

  describe('setupEventListeners', () => {
    it('should setup event listeners only once', () => {
      ui.setupEventListeners()
      expect(ui.eventListenersSetup).toBe(true)
      
      // Call again to ensure it doesn't setup twice
      ui.setupEventListeners()
      expect(mockEventBus.onDom).toHaveBeenCalledTimes(1)
    })

    it('should listen for service events', () => {
      const addEventListenerSpy = vi.spyOn(ui, 'addEventListener')
      ui.setupEventListeners()
      expect(addEventListenerSpy).toHaveBeenCalledWith('command-added', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('command-deleted', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('command-moved', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('show-parameter-modal', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('environment-changed', expect.any(Function))
    })

    it('should listen for stabilize execution order changes', () => {
      ui.setupEventListeners()
      expect(mockEventBus.onDom).toHaveBeenCalledWith('stabilizeExecutionOrder', 'change', 'stabilize-order-change', expect.any(Function))
    })
  })

  describe('renderCommandChain', () => {
    beforeEach(() => {
      mockService.getEmptyStateInfo.mockReturnValue({
        title: 'Test Title',
        preview: 'Test Preview',
        commandCount: '0',
        icon: 'fas fa-test',
        emptyTitle: 'No Commands',
        emptyDesc: 'No commands description'
      })
    })

    it('should return early if required elements are missing', () => {
      mockDocument.getElementById.mockReturnValue(null)
      ui.renderCommandChain()
      expect(mockService.getEmptyStateInfo).not.toHaveBeenCalled()
    })

    it('should render empty state when no key is selected', () => {
      mockService.selectedKey = null
      ui.renderCommandChain()
      
      expect(mockTitle.textContent).toBe('Test Title')
      expect(mockPreview.textContent).toBe('Test Preview')
      expect(mockCommandCount.textContent).toBe('0')
      expect(mockContainer.innerHTML).toContain('empty-state')
      expect(mockContainer.innerHTML).toContain('fas fa-test')
    })

    it('should render empty state when no commands exist', () => {
      mockService.selectedKey = 'test-key'
      mockService.getCommandsForSelectedKey.mockReturnValue([])
      
      ui.renderCommandChain()
      
      expect(mockContainer.innerHTML).toContain('empty-state')
      expect(mockContainer.innerHTML).toContain('No Commands')
    })

    it('should render command list when commands exist', () => {
      mockService.selectedKey = 'test-key'
      const mockCommands = [
        { command: 'cmd1', type: 'space', icon: '🎯', text: 'Command 1' },
        { command: 'cmd2', type: 'space', icon: '🎯', text: 'Command 2' }
      ]
      mockService.getCommandsForSelectedKey.mockReturnValue(mockCommands)
      
      const mockElement = { 
        innerHTML: '',
        dataset: {},
        classList: { add: vi.fn() },
        querySelector: vi.fn().mockReturnValue({
          addEventListener: vi.fn()
        }),
        addEventListener: vi.fn()
      }
      mockDocument.createElement.mockReturnValue(mockElement)
      
      ui.renderCommandChain()
      
      expect(mockContainer.innerHTML).toBe('')
      expect(mockDocument.createElement).toHaveBeenCalledWith('div')
      expect(mockContainer.appendChild).toHaveBeenCalledTimes(2)
    })
  })

  describe('createCommandElement', () => {
    let mockElement

    beforeEach(() => {
      mockElement = {
        className: '',
        dataset: {},
        draggable: false,
        innerHTML: '',
        classList: {
          add: vi.fn()
        },
        querySelector: vi.fn().mockReturnValue({
          addEventListener: vi.fn()
        }),
        addEventListener: vi.fn()
      }
      mockDocument.createElement.mockReturnValue(mockElement)
    })

    it('should create command element with basic properties', () => {
      const command = { command: 'test', type: 'space', icon: '🎯', text: 'Test Command' }
      const result = ui.createCommandElement(command, 0, 1)
      
      expect(result).toBe(mockElement)
      expect(mockElement.className).toBe('command-item-row')
      expect(mockElement.dataset.index).toBe(0)
      expect(mockElement.draggable).toBe(true)
      expect(mockElement.innerHTML).toContain('Test Command')
      expect(mockElement.innerHTML).toContain('🎯')
    })

    it('should handle parameterized commands', () => {
      const command = { command: '+STOTrayExec 0 0', type: 'space', icon: '🎯', text: 'Execute Tray' }
      mockService.findCommandDefinition.mockReturnValue({
        name: 'Execute Tray',
        icon: '🎯',
        customizable: true,
        commandId: 'tray_exec'
      })
      
      const result = ui.createCommandElement(command, 0, 1)
      
      expect(result.dataset.parameters).toBe('true')
      expect(result.classList.add).toHaveBeenCalledWith('customizable')
      expect(result.innerHTML).toContain('param-indicator')
    })

    it('should handle commands with warnings', () => {
      const command = { command: 'test', type: 'space', icon: '🎯', text: 'Test Command' }
      mockService.getCommandWarning.mockReturnValue('Test warning')
      
      const result = ui.createCommandElement(command, 0, 1)
      
      expect(result.innerHTML).toContain('command-warning-icon')
      expect(result.innerHTML).toContain('Test warning')
    })

    it('should disable move buttons appropriately', () => {
      const command = { command: 'test', type: 'space', icon: '🎯', text: 'Test Command' }
      
      // First command (index 0) - up button should be disabled
      const result1 = ui.createCommandElement(command, 0, 2)
      expect(result1.innerHTML).toContain('disabled')
      
      // Last command (index 1 of 2) - down button should be disabled
      const result2 = ui.createCommandElement(command, 1, 2)
      expect(result2.innerHTML).toContain('disabled')
    })
  })

  describe('setupCommandLibrary', () => {
    it('should return early if container is missing', () => {
      mockDocument.getElementById.mockReturnValue(null)
      ui.setupCommandLibrary()
      expect(mockService.getCommandCategories).not.toHaveBeenCalled()
    })

    it('should setup command library with categories', () => {
      const mockCategories = {
        space: {
          name: 'Space Commands',
          icon: 'fas fa-rocket',
          commands: {
            cmd1: { name: 'Command 1', icon: '🎯', description: 'Test', customizable: false }
          }
        }
      }
      mockService.getCommandCategories.mockReturnValue(mockCategories)
      
      const mockCategoryElement = { 
        innerHTML: '',
        dataset: {},
        querySelector: vi.fn().mockReturnValue({
          addEventListener: vi.fn()
        }),
        addEventListener: vi.fn()
      }
      mockDocument.createElement.mockReturnValue(mockCategoryElement)
      
      ui.setupCommandLibrary()
      
      expect(mockContainer.innerHTML).toBe('')
      expect(mockDocument.createElement).toHaveBeenCalledWith('div')
      expect(mockContainer.appendChild).toHaveBeenCalledWith(mockCategoryElement)
      expect(mockService.filterCommandLibrary).toHaveBeenCalled()
    })
  })

  describe('createCategoryElement', () => {
    let mockElement

    beforeEach(() => {
      mockElement = {
        className: '',
        dataset: {},
        innerHTML: '',
        addEventListener: vi.fn(),
        querySelector: vi.fn().mockReturnValue({
          addEventListener: vi.fn()
        }),
        querySelectorAll: vi.fn()
      }
      mockDocument.createElement.mockReturnValue(mockElement)
      
      // Mock localStorage
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: vi.fn().mockReturnValue('false')
        },
        writable: true
      })
    })

    it('should create category element with correct structure', () => {
      const category = {
        name: 'Test Category',
        icon: 'fas fa-test',
        commands: {
          cmd1: { name: 'Command 1', icon: '🎯', description: 'Test', customizable: false }
        }
      }
      
      const result = ui.createCategoryElement('test-category', category)
      
      expect(result).toBe(mockElement)
      expect(mockElement.className).toBe('category')
      expect(mockElement.dataset.category).toBe('test-category')
      expect(mockElement.innerHTML).toContain('Test Category')
      expect(mockElement.innerHTML).toContain('fas fa-test')
      expect(mockElement.innerHTML).toContain('Command 1')
    })

    it('should handle customizable commands', () => {
      const category = {
        name: 'Test Category',
        icon: 'fas fa-test',
        commands: {
          cmd1: { name: 'Command 1', icon: '🎯', description: 'Test', customizable: true }
        }
      }
      
      const result = ui.createCategoryElement('test-category', category)
      
      expect(result.innerHTML).toContain('customizable')
      expect(result.innerHTML).toContain('param-indicator')
    })

    it('should add event listeners', () => {
      const category = {
        name: 'Test Category',
        icon: 'fas fa-test',
        commands: {
          cmd1: { name: 'Command 1', icon: '🎯', description: 'Test', customizable: false }
        }
      }
      
      const mockHeader = { addEventListener: vi.fn() }
      const mockCommands = { addEventListener: vi.fn() }
      mockElement.querySelector.mockImplementation((selector) => {
        if (selector === 'h4') return mockHeader
        if (selector === '.category-commands') return mockCommands
        return null
      })
      
      ui.createCategoryElement('test-category', category)
      
      expect(mockHeader.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
      expect(mockElement.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
    })
  })

  describe('toggleCommandCategory', () => {
    let mockElement, mockHeader, mockCommands, mockChevron

    beforeEach(() => {
      mockHeader = {
        classList: { remove: vi.fn(), add: vi.fn() },
        querySelector: vi.fn()
      }
      mockCommands = {
        classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn().mockReturnValue(false) }
      }
      mockChevron = {
        style: { transform: '' }
      }
      mockElement = {
        querySelector: vi.fn()
      }
      
      mockHeader.querySelector.mockReturnValue(mockChevron)
      mockElement.querySelector.mockImplementation((selector) => {
        if (selector === 'h4') return mockHeader
        if (selector === '.category-commands') return mockCommands
        if (selector === '.category-chevron') return mockChevron
        return null
      })
      
      // Mock localStorage
      Object.defineProperty(window, 'localStorage', {
        value: {
          setItem: vi.fn()
        },
        writable: true
      })
    })

    it('should expand collapsed category', () => {
      mockCommands.classList.contains.mockReturnValue(true)
      
      ui.toggleCommandCategory('test-category', mockElement)
      
      expect(mockCommands.classList.remove).toHaveBeenCalledWith('collapsed')
      expect(mockHeader.classList.remove).toHaveBeenCalledWith('collapsed')
      expect(mockChevron.style.transform).toBe('rotate(90deg)')
      expect(window.localStorage.setItem).toHaveBeenCalledWith('commandCategory_test-category_collapsed', 'false')
    })

    it('should collapse expanded category', () => {
      mockCommands.classList.contains.mockReturnValue(false)
      
      ui.toggleCommandCategory('test-category', mockElement)
      
      expect(mockCommands.classList.add).toHaveBeenCalledWith('collapsed')
      expect(mockHeader.classList.add).toHaveBeenCalledWith('collapsed')
      expect(mockChevron.style.transform).toBe('rotate(0deg)')
      expect(window.localStorage.setItem).toHaveBeenCalledWith('commandCategory_test-category_collapsed', 'true')
    })
  })

  describe('filterCommandLibrary', () => {
    it('should call service filter method', () => {
      ui.filterCommandLibrary()
      expect(mockService.filterCommandLibrary).toHaveBeenCalled()
    })
  })

  describe('setupDragAndDrop', () => {
    it('should return early if command list is missing', () => {
      mockDocument.getElementById.mockReturnValue(null)
      ui.setupDragAndDrop()
      expect(mockUI.initDragAndDrop).not.toHaveBeenCalled()
    })

    it('should setup drag and drop', () => {
      ui.setupDragAndDrop()
      expect(mockUI.initDragAndDrop).toHaveBeenCalledWith(mockContainer, {
        dragSelector: '.command-item-row',
        dropZoneSelector: '.command-item-row',
        onDrop: expect.any(Function)
      })
    })
  })

  describe('updateChainActions', () => {
    let mockButtons

    beforeEach(() => {
      mockButtons = {
        disabled: false
      }
      mockDocument.getElementById.mockReturnValue(mockButtons)
    })

    it('should handle alias environment buttons', () => {
      mockService.currentEnvironment = 'alias'
      mockService.selectedKey = 'test-key'
      
      ui.updateChainActions()
      
      expect(mockDocument.getElementById).toHaveBeenCalledWith('deleteAliasChainBtn')
      expect(mockDocument.getElementById).toHaveBeenCalledWith('duplicateAliasChainBtn')
      expect(mockDocument.getElementById).toHaveBeenCalledWith('addCommandBtn')
    })

    it('should handle keybind environment buttons', () => {
      mockService.currentEnvironment = 'space'
      mockService.selectedKey = 'test-key'
      
      ui.updateChainActions()
      
      expect(mockDocument.getElementById).toHaveBeenCalledWith('addCommandBtn')
      expect(mockDocument.getElementById).toHaveBeenCalledWith('importFromKeyBtn')
      expect(mockDocument.getElementById).toHaveBeenCalledWith('deleteKeyBtn')
      expect(mockDocument.getElementById).toHaveBeenCalledWith('duplicateKeyBtn')
    })

    it('should disable buttons when no key is selected', () => {
      mockService.currentEnvironment = 'space'
      mockService.selectedKey = null
      
      ui.updateChainActions()
      
      expect(mockButtons.disabled).toBe(true)
    })
  })

  describe('toggleLibrary', () => {
    let mockContent, mockBtn, mockIcon

    beforeEach(() => {
      mockContent = { style: { display: 'block' } }
      mockIcon = { className: 'fas fa-chevron-down' }
      mockBtn = { querySelector: vi.fn().mockReturnValue(mockIcon) }
      
      mockDocument.getElementById.mockImplementation((id) => {
        if (id === 'libraryContent') return mockContent
        if (id === 'toggleLibraryBtn') return mockBtn
        return null
      })
    })

    it('should expand collapsed library', () => {
      mockContent.style.display = 'none'
      
      ui.toggleLibrary()
      
      expect(mockContent.style.display).toBe('block')
      expect(mockIcon.className).toBe('fas fa-chevron-up')
    })

    it('should collapse expanded library', () => {
      mockContent.style.display = 'block'
      
      ui.toggleLibrary()
      
      expect(mockContent.style.display).toBe('none')
      expect(mockIcon.className).toBe('fas fa-chevron-down')
    })
  })

  describe('showParameterModal', () => {
    it('should call parameterCommands.showParameterModal if available', async () => {
      // Import the actual parameterCommands module
      const { parameterCommands } = await import('../../src/js/features/parameterCommands.js')
      
      // Create a mock implementation that just returns without doing anything
      const originalShowParameterModal = parameterCommands.showParameterModal
      parameterCommands.showParameterModal = vi.fn()
      
      // Provide a valid commandDef with parameters to avoid the error
      const commandDef = {
        name: 'Test Command',
        parameters: {
          testParam: { type: 'text', default: 'test' }
        }
      }
      
      ui.showParameterModal('space', 'tray_exec', commandDef)
      
      expect(parameterCommands.showParameterModal).toHaveBeenCalledWith('space', 'tray_exec', commandDef)
      
      // Restore the original method
      parameterCommands.showParameterModal = originalShowParameterModal
    })

    it('should handle case when parameterCommands is not available', () => {
      // Test that it doesn't throw when parameterCommands is undefined
      // Provide a valid commandDef with parameters to avoid the error
      const commandDef = {
        name: 'Test Command',
        parameters: {
          testParam: { type: 'text', default: 'test' }
        }
      }
      
      expect(() => {
        ui.showParameterModal('space', 'tray_exec', commandDef)
      }).not.toThrow()
    })
  })

  describe('showTemplateModal', () => {
    it('should show template coming soon toast', () => {
      ui.showTemplateModal()
      expect(mockUI.showToast).toHaveBeenCalledWith('template_system_coming_soon')
    })
  })

  describe('event-driven rendering', () => {
    beforeEach(() => {
      ui.setupEventListeners()
    })

    it('should re-render command chain on key-selected event', () => {
      const renderSpy = vi.spyOn(ui, 'renderCommandChain')
      // Emit the key-selected event through the component instance – this
      // will invoke the fallback listener path used in tests when the mock
      // eventBus does not propagate events.
      ui.emit('key-selected', { key: 'test-key' })
      expect(renderSpy).toHaveBeenCalled()
    })

    it('should re-render command chain on environment-changed event', () => {
      const renderSpy = vi.spyOn(ui, 'renderCommandChain')
      ui.emit('environment-changed', { environment: 'alias' })
      expect(renderSpy).toHaveBeenCalled()
    })
  })
}) 