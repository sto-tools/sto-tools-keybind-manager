import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'

import eventBus from '../../src/js/core/eventBus.js'
import CommandLibraryService from '../../src/js/components/services/CommandLibraryService.js'
import CommandService from '../../src/js/components/services/CommandService.js'
import CommandChainService from '../../src/js/components/services/CommandChainService.js'
import CommandChainUI from '../../src/js/components/ui/CommandChainUI.js'
import CommandLibraryUI from '../../src/js/components/ui/CommandLibraryUI.js'

describe('Command Chain Duplicate Bug Tests', () => {
  let dom, document, window
  let commandLibraryService, commandService, commandChainService, commandChainUI, commandLibraryUI

  beforeEach(async () => {
    // Setup DOM
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="commandList"></div>
          <div id="chainTitle">Initial Title</div>
          <div id="commandPreview">Initial Preview</div>
          <div id="commandCount">0</div>
          <div id="emptyState"></div>
        </body>
      </html>
    `)
    
    document = dom.window.document
    window = dom.window
    global.window = window
    global.document = document

    // Create services
    commandLibraryService = new CommandLibraryService({ eventBus })
    commandService = new CommandService({ eventBus })
    commandChainService = new CommandChainService({ eventBus })
    
    // Create UI components
    commandChainUI = new CommandChainUI({ eventBus, document })
    commandLibraryUI = new CommandLibraryUI({ 
      service: commandLibraryService, 
      eventBus, 
      document,
      modalManager: { showModal: () => {} },
      ui: { initDragAndDrop: () => {} }
    })

    // Make CommandChainUI available globally like in real app
    window.commandChainUI = commandChainUI

    // Initialize components
    await commandLibraryService.onInit()
    await commandService.onInit()
    await commandChainService.onInit()
    await commandChainUI.onInit()
    await commandLibraryUI.onInit()
  })

  afterEach(() => {
    // Clean up
    commandLibraryService?.destroy?.()
    commandService?.destroy?.()
    commandChainService?.destroy?.()
    commandChainUI?.destroy?.()
    commandLibraryUI?.destroy?.()
    
    delete global.window
    delete global.document
  })

  describe('Command Addition Duplication', () => {
    it('should not duplicate commands when adding via command:add event', async () => {
      // Select a key first
      eventBus.emit('key-selected', { key: 'Space' })
      
      // Wait for initial render
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Check initial state - should be empty
      const container = document.getElementById('commandList')
      expect(container.children.length).toBe(0)
      
      // Add a command
      eventBus.emit('command:add', {
        commandDef: {
          command: 'TestCommand',
          text: 'Test Command',
          type: 'space',
          icon: '🚀'
        }
      })
      
      // Wait for renders to complete
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Check that command appears only once
      const commandElements = container.querySelectorAll('.command-item-row')
      console.log('Command elements found:', commandElements.length)
      console.log('Container HTML:', container.innerHTML)
      
      expect(commandElements.length).toBe(1)
      
      // Verify the command content is correct
      const commandElement = commandElements[0]
      expect(commandElement.querySelector('.command-text').textContent).toBe('Test Command')
      expect(commandElement.querySelector('.command-number').textContent).toBe('1')
    })

    it('should not duplicate commands when multiple events trigger renders', async () => {
      // Select a key first
      eventBus.emit('key-selected', { key: 'F1' })
      
      // Wait for initial render
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Add a command which triggers multiple events
      eventBus.emit('command:add', {
        commandDef: {
          command: 'TestCommand1',
          text: 'Test Command 1',
          type: 'space',
          icon: '🚀'
        }
      })
      
      // Manually trigger additional render events that might cause duplication
      eventBus.emit('command-added', { key: 'F1', command: { command: 'TestCommand1', text: 'Test Command 1', type: 'space', icon: '🚀' } })
      eventBus.emit('chain-data-changed', { commands: [{ command: 'TestCommand1', text: 'Test Command 1', type: 'space', icon: '🚀' }] })
      
      // Wait for all renders to complete
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Check that command appears only once despite multiple events
      const container = document.getElementById('commandList')
      const commandElements = container.querySelectorAll('.command-item-row')
      
      console.log('Command elements after multiple events:', commandElements.length)
      console.log('Container HTML:', container.innerHTML)
      
      expect(commandElements.length).toBe(1)
    })
  })
}) 