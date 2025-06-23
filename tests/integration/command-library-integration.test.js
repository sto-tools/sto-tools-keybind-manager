import { describe, it, expect, beforeEach, vi } from 'vitest'
import CommandLibraryService from '../../src/js/components/services/CommandLibraryService.js'
import CommandLibraryUI from '../../src/js/components/ui/CommandLibraryUI.js'

// Mock dependencies
const mockStorage = {
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  getAllData: vi.fn()
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

const mockI18n = {
  t: vi.fn((key) => key)
}

// Mock STO_DATA
global.STO_DATA = {
  commands: {
    space: {
      name: 'Space Commands',
      icon: 'fas fa-rocket',
      environments: ['space'],
      commands: {
        tray_exec: {
          name: 'Execute Tray',
          command: '+STOTrayExec 0 0',
          icon: '🎯',
          description: 'Execute tray command',
          customizable: true,
          parameters: {
            tray: { type: 'number', min: 0, max: 9 },
            slot: { type: 'number', min: 0, max: 9 }
          }
        },
        target: {
          name: 'Target Entity',
          command: 'Target "Entity Name"',
          icon: '🎯',
          description: 'Target an entity',
          customizable: true,
          parameters: {
            entityName: { type: 'string' }
          }
        }
      }
    },
    ground: {
      name: 'Ground Commands',
      icon: 'fas fa-mountain',
      environments: ['ground'],
      commands: {
        ground_cmd: {
          name: 'Ground Command',
          command: 'GroundCommand',
          icon: '🏔️',
          description: 'Ground command',
          customizable: false
        }
      }
    }
  }
}

describe('Command Library Integration', () => {
  let service, ui
  let mockContainer, mockTitle, mockPreview, mockCommandCount

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock DOM elements
    mockContainer = {
      innerHTML: '',
      appendChild: vi.fn(),
      style: {}
    }
    mockTitle = { textContent: '' }
    mockPreview = { textContent: '' }
    mockCommandCount = { textContent: '' }

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
        case 'commandCategories':
          return mockContainer
        case 'stabilizeExecutionOrder':
          return { checked: false }
        default:
          return null
      }
    })

    // Create service
    service = new CommandLibraryService({
      storage: mockStorage,
      eventBus: mockEventBus,
      i18n: mockI18n,
      ui: mockUI,
      modalManager: mockModalManager
    })

    // Create UI
    ui = new CommandLibraryUI({
      service,
      eventBus: mockEventBus,
      ui: mockUI,
      modalManager: mockModalManager,
      document: mockDocument
    })

    // Initialize both components
    service.init()
    ui.init()
  })

  describe('Service-UI Communication', () => {
    it('should render command chain when service emits command-added event', () => {
      const renderSpy = vi.spyOn(ui, 'renderCommandChain')
      
      // Emit command added event
      service.emit('command-added', { key: 'test-key', command: { command: 'test' } })
      
      expect(renderSpy).toHaveBeenCalled()
    })

    it('should render command chain when service emits command-deleted event', () => {
      const renderSpy = vi.spyOn(ui, 'renderCommandChain')
      
      // Emit command deleted event
      service.emit('command-deleted', { key: 'test-key', index: 0 })
      
      expect(renderSpy).toHaveBeenCalled()
    })

    it('should render command chain when service emits command-moved event', () => {
      const renderSpy = vi.spyOn(ui, 'renderCommandChain')
      
      // Emit command moved event
      service.emit('command-moved', { key: 'test-key', fromIndex: 0, toIndex: 1 })
      
      expect(renderSpy).toHaveBeenCalled()
    })

    it('should show parameter modal when service emits show-parameter-modal event', () => {
      const modalSpy = vi.spyOn(ui, 'showParameterModal')
      
      // Emit show parameter modal event
      service.emit('show-parameter-modal', {
        categoryId: 'space',
        commandId: 'tray_exec',
        commandDef: STO_DATA.commands.space.commands.tray_exec
      })
      
      expect(modalSpy).toHaveBeenCalledWith('space', 'tray_exec', STO_DATA.commands.space.commands.tray_exec)
    })
  })

  describe('Command Chain Rendering Integration', () => {
    beforeEach(() => {
      service.setCurrentProfile('profile-1')
      service.setSelectedKey('test-key')
    })

    it('should render empty state when no commands exist', () => {
      service.setCurrentEnvironment('space')
      const mockProfile = {
        builds: {
          space: {
            keys: {
              'test-key': []
            }
          }
        }
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      ui.renderCommandChain()

      expect(mockContainer.innerHTML).toContain('empty-state')
      expect(mockTitle.textContent).toBe('Command Chain for test-key')
    })

    it('should render command list when commands exist', () => {
      service.setCurrentEnvironment('space')
      const mockProfile = {
        builds: {
          space: {
            keys: {
              'test-key': [
                { command: 'cmd1', type: 'space', icon: '🎯', text: 'Command 1' },
                { command: 'cmd2', type: 'space', icon: '🎯', text: 'Command 2' }
              ]
            }
          }
        }
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const mockElement = { innerHTML: '' }
      mockDocument.createElement.mockReturnValue(mockElement)

      ui.renderCommandChain()

      expect(mockContainer.innerHTML).toBe('')
      expect(mockDocument.createElement).toHaveBeenCalledWith('div')
      expect(mockContainer.appendChild).toHaveBeenCalledTimes(2)
    })

    it('should handle alias environment commands', () => {
      service.setCurrentEnvironment('alias')
      const mockProfile = {
        aliases: {
          'test-key': {
            commands: 'cmd1 $$ cmd2'
          }
        }
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const mockElement = { innerHTML: '' }
      mockDocument.createElement.mockReturnValue(mockElement)

      ui.renderCommandChain()

      expect(mockContainer.innerHTML).toBe('')
      expect(mockDocument.createElement).toHaveBeenCalledWith('div')
      expect(mockContainer.appendChild).toHaveBeenCalledTimes(2)
    })
  })

  describe('Command Library Setup Integration', () => {
    it('should setup command library with categories from service', () => {
      const categories = service.getCommandCategories()
      expect(categories).toBe(STO_DATA.commands)

      const mockCategoryElement = { innerHTML: '' }
      mockDocument.createElement.mockReturnValue(mockCategoryElement)

      ui.setupCommandLibrary()

      expect(mockContainer.innerHTML).toBe('')
      expect(mockDocument.createElement).toHaveBeenCalledWith('div')
      expect(mockContainer.appendChild).toHaveBeenCalledWith(mockCategoryElement)
    })
  })

  describe('Command Operations Integration', () => {
    beforeEach(() => {
      service.setCurrentProfile('profile-1')
      service.setSelectedKey('test-key')
    })

    it('should add command from library and update UI', () => {
      service.setCurrentEnvironment('space')
      const mockProfile = {
        builds: {
          space: {
            keys: {
              'test-key': []
            }
          }
        }
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const renderSpy = vi.spyOn(ui, 'renderCommandChain')

      // Add command from library
      const result = service.addCommandFromLibrary('ground', 'ground_cmd')
      expect(result).toBe(true)

      // UI should be updated via event
      expect(renderSpy).toHaveBeenCalled()
    })

    it('should delete command and update UI', () => {
      service.setCurrentEnvironment('space')
      const mockProfile = {
        builds: {
          space: {
            keys: {
              'test-key': [
                { command: 'cmd1' },
                { command: 'cmd2' }
              ]
            }
          }
        }
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const renderSpy = vi.spyOn(ui, 'renderCommandChain')

      // Delete command
      const result = service.deleteCommand('test-key', 0)
      expect(result).toBe(true)

      // UI should be updated via event
      expect(renderSpy).toHaveBeenCalled()
    })

    it('should move command and update UI', () => {
      service.setCurrentEnvironment('space')
      const mockProfile = {
        builds: {
          space: {
            keys: {
              'test-key': [
                { command: 'cmd1' },
                { command: 'cmd2' }
              ]
            }
          }
        }
      }
      mockStorage.getProfile.mockReturnValue(mockProfile)

      const renderSpy = vi.spyOn(ui, 'renderCommandChain')

      // Move command
      const result = service.moveCommand('test-key', 0, 1)
      expect(result).toBe(true)

      // UI should be updated via event
      expect(renderSpy).toHaveBeenCalled()
    })
  })

  describe('Environment Changes Integration', () => {
    it('should filter command library when environment changes', () => {
      const filterSpy = vi.spyOn(ui, 'filterCommandLibrary')

      // Change environment
      service.setCurrentEnvironment('ground')

      // UI should filter library via event
      expect(filterSpy).toHaveBeenCalled()
    })
  })

  describe('Drag and Drop Integration', () => {
    it('should setup drag and drop and handle drops', () => {
      const moveSpy = vi.spyOn(service, 'moveCommand')

      ui.setupDragAndDrop()

      expect(mockUI.initDragAndDrop).toHaveBeenCalledWith(mockContainer, {
        dragSelector: '.command-item-row',
        dropZoneSelector: '.command-item-row',
        onDrop: expect.any(Function)
      })

      // Simulate drop
      const onDrop = mockUI.initDragAndDrop.mock.calls[0][1].onDrop
      const mockDragState = {
        dragElement: { dataset: { index: '0' } }
      }
      const mockDropZone = { dataset: { index: '1' } }

      service.setSelectedKey('test-key')
      onDrop(null, mockDragState, mockDropZone)

      expect(moveSpy).toHaveBeenCalledWith('test-key', 0, 1)
    })
  })

  describe('Parameter Modal Integration', () => {
    it('should show parameter modal for customizable commands', () => {
      const modalSpy = vi.spyOn(ui, 'showParameterModal')

      // Add customizable command from library
      service.addCommandFromLibrary('space', 'tray_exec')

      expect(service.emit).toHaveBeenCalledWith('show-parameter-modal', {
        categoryId: 'space',
        commandId: 'tray_exec',
        commandDef: STO_DATA.commands.space.commands.tray_exec
      })

      // UI should handle the event
      service.emit('show-parameter-modal', {
        categoryId: 'space',
        commandId: 'tray_exec',
        commandDef: STO_DATA.commands.space.commands.tray_exec
      })

      expect(modalSpy).toHaveBeenCalledWith('space', 'tray_exec', STO_DATA.commands.space.commands.tray_exec)
    })
  })

  describe('Chain Actions Integration', () => {
    it('should update chain actions based on environment and key selection', () => {
      const actionsSpy = vi.spyOn(ui, 'updateChainActions')

      // Set up mock buttons
      const mockButtons = { disabled: false }
      mockDocument.getElementById.mockReturnValue(mockButtons)

      // Test space environment
      service.setCurrentEnvironment('space')
      service.setSelectedKey('test-key')
      ui.updateChainActions()

      expect(mockDocument.getElementById).toHaveBeenCalledWith('addCommandBtn')
      expect(mockDocument.getElementById).toHaveBeenCalledWith('importFromKeyBtn')
      expect(mockDocument.getElementById).toHaveBeenCalledWith('deleteKeyBtn')
      expect(mockDocument.getElementById).toHaveBeenCalledWith('duplicateKeyBtn')

      // Test alias environment
      service.setCurrentEnvironment('alias')
      ui.updateChainActions()

      expect(mockDocument.getElementById).toHaveBeenCalledWith('deleteAliasChainBtn')
      expect(mockDocument.getElementById).toHaveBeenCalledWith('duplicateAliasChainBtn')
    })
  })
}) 