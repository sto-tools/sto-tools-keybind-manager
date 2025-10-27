/**
 * Test for command actions styling revamp
 * Verifies that command-actions container and buttons use toolbar-group styling
 */

import { describe, it, expect, beforeAll, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import eventBus from '../../../src/js/core/eventBus.js'
import { respond } from '../../../src/js/core/requestResponse.js'
import CommandChainUI from '../../../src/js/components/ui/CommandChainUI.js'

describe('CommandChainUI Command Actions Styling', () => {
  let document
  let commandChainUI

  beforeAll(async () => {
    // Mock request handlers used inside createCommandElement
    respond(eventBus, 'command:find-definition', ({ command }) => {
      const isCustomizable = /Custom/i.test(command)
      return {
        name: 'Test Command',
        icon: '⚡',
        categoryId: 'test',
        commandId: 'test_command',
        customizable: isCustomizable
      }
    })

    respond(eventBus, 'command:get-warning', () => null)

    // Stub parser response to avoid request timeouts in enrichForDisplay
    respond(eventBus, 'parser:parse-command-string', ({ commandString }) => {
      return {
        commands: [
          {
            displayText: commandString,
            icon: '⚡',
            category: 'test',
            parameters: {},
            signature: '',
            baseCommand: commandString,
            id: 'test'
          }
        ]
      }
    })

    // Mock empty state info response
    respond(eventBus, 'command:get-empty-state-info', () => {
      return {
        title: 'No Key Selected',
        preview: 'Select a key to see the generated command',
        icon: 'fas fa-keyboard',
        emptyTitle: 'No Key Selected',
        emptyDesc: 'Select a key from the left panel to view and edit its command chain.',
        commandCount: '0'
      }
    })

    // Mock preferences setting response
    respond(eventBus, 'preferences:get-setting', () => {
      return false
    })

    // Mock command chain stabilization check
    respond(eventBus, 'command-chain:is-stabilized', () => {
      return true
    })

    // Mock file operations for mirrored commands
    respond(eventBus, 'fileops:generate-mirrored-commands', ({ commands }) => {
      return commands || []
    })

    // Setup DOM
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div class="command-chain-container">
            <div class="chain-header">
              <div class="chain-header-left">
                <h3 id="chainTitle">Test Chain</h3>
              </div>
              <div class="header-toolbar">
                <div class="toolbar-group">
                  <button class="toolbar-btn toolbar-btn-primary"><i class="fas fa-plus"></i></button>
                  <button class="toolbar-btn"><i class="fas fa-copy"></i></button>
                  <button class="toolbar-btn toolbar-btn-danger"><i class="fas fa-trash"></i></button>
                </div>
              </div>
            </div>
            <div class="command-list-container">
              <div class="command-list" id="commandList"></div>
            </div>
            <div class="command-preview-header">
              <label>Generated Keybind:</label>
              <span class="command-count-display" id="commandCountDisplay">0</span>
            </div>
            <div class="command-preview" id="commandPreview"></div>
          </div>
        </body>
      </html>
    `)

    document = dom.window.document

    commandChainUI = new CommandChainUI({
      eventBus,
      document,
      ui: { initDragAndDrop: () => {} }
    })

    await commandChainUI.init()

    // Set up cache with a selected key so render will show command elements instead of empty state
    commandChainUI.cache.selectedKey = 'F1'
    commandChainUI.cache.currentEnvironment = 'space'
  })

  describe('Command Actions Container Styling', () => {
    it('should apply toolbar-group-like styling to command-actions', async () => {
      // Non-customizable command – should NOT include edit button
      const element = await commandChainUI.createCommandElement('StaticCommand', 0, 1)

      const commandActions = element.querySelector('.command-actions')
      expect(commandActions).toBeTruthy()

      // Get computed styles (we'll check the CSS classes since we can't get computed styles in tests)
      const expectedClasses = ['command-actions']
      expectedClasses.forEach(className => {
        expect(commandActions.classList.contains(className)).toBe(true)
      })

      // Verify structure matches toolbar-group pattern
      expect(commandActions.tagName).toBe('DIV')
      // Static command: should still allocate space for 4 buttons (edit placeholder invisible)
      expect(commandActions.children.length).toBe(4)
      
      const actionButtons = element.querySelectorAll('.command-action-btn')
      expect(actionButtons.length).toBe(4) // edit placeholder, delete, up, down

      // Verify edit placeholder is hidden
      const editBtn = element.querySelector('.btn-edit')
      expect(editBtn).toBeTruthy()
      expect(editBtn.getAttribute('style')).toContain('visibility:hidden')
    })

    it('should have buttons with command-action-btn styling', async () => {
      const element = await commandChainUI.createCommandElement('CustomCommand', 0, 1)

      const actionButtons = element.querySelectorAll('.command-action-btn')
      expect(actionButtons.length).toBe(4) // edit, delete, up, down

      actionButtons.forEach(button => {
        expect(button.classList.contains('command-action-btn')).toBe(true)
        expect(button.tagName).toBe('BUTTON')
        
        // Check for icons
        const icon = button.querySelector('i')
        expect(icon).toBeTruthy()
        expect(icon.classList.contains('fas')).toBe(true)
      })
    })

    it('should apply danger styling to delete button', async () => {
      const element = await commandChainUI.createCommandElement('CustomCommand', 0, 1)

      const deleteButton = element.querySelector('.btn-delete')
      expect(deleteButton).toBeTruthy()
      expect(deleteButton.classList.contains('command-action-btn')).toBe(true)
      expect(deleteButton.classList.contains('command-action-btn-danger')).toBe(true)
    })

    it('should disable up/down buttons appropriately', async () => {
      // Test first command (up button should be disabled)
      const firstElement = await commandChainUI.createCommandElement('FirstCommand', 0, 2)
      const firstUpButton = firstElement.querySelector('.btn-up')
      const firstDownButton = firstElement.querySelector('.btn-down')

      expect(firstUpButton.disabled).toBe(true)
      expect(firstDownButton.disabled).toBe(false)

      // Test last command (down button should be disabled)
      const lastElement = await commandChainUI.createCommandElement('LastCommand', 1, 2)
      const lastUpButton = lastElement.querySelector('.btn-up')
      const lastDownButton = lastElement.querySelector('.btn-down')

      expect(lastUpButton.disabled).toBe(false)
      expect(lastDownButton.disabled).toBe(true)
    })
  })

  describe('Command Actions Functionality', () => {
    it('should emit edit event when edit button is clicked', async () => {
      const mockCommands = [
        {
          command: 'CustomCommand',
          displayText: 'Custom Command',
          icon: 'fas fa-test'
        }
      ]

      await commandChainUI.render(mockCommands)

      const editButton = document.querySelector('.btn-edit')
      expect(editButton).toBeTruthy()

      // Mock the emit method
      const emitSpy = vi.spyOn(commandChainUI, 'emit')

      editButton.click()

      expect(emitSpy).toHaveBeenCalledWith('commandchain:edit', { index: 0 })
    })

    it('should emit delete event when delete button is clicked', async () => {
      const mockCommands = [
        {
          command: 'CustomCommand',
          displayText: 'Custom Command',
          icon: 'fas fa-test'
        }
      ]

      await commandChainUI.render(mockCommands)

      const deleteButton = document.querySelector('.btn-delete')
      expect(deleteButton).toBeTruthy()

      const emitSpy = vi.spyOn(commandChainUI, 'emit')

      deleteButton.click()

      expect(emitSpy).toHaveBeenCalledWith('commandchain:delete', { index: 0 })
    })

    it('should emit move events when up/down buttons are clicked', async () => {
      const mockCommands = [
        {
          command: 'FirstCommand',
          displayText: 'First Command',
          icon: 'fas fa-test'
        },
        {
          command: 'SecondCommand',
          displayText: 'Second Command',
          icon: 'fas fa-test'
        }
      ]

      await commandChainUI.render(mockCommands)

      const emitSpy = vi.spyOn(commandChainUI, 'emit')

      // Test down button on first command
      const firstDownButton = document.querySelectorAll('.btn-down')[0]
      firstDownButton.click()

      expect(emitSpy).toHaveBeenCalledWith('commandchain:move', {
        fromIndex: 0,
        toIndex: 1
      })

      // Test up button on second command
      const secondUpButton = document.querySelectorAll('.btn-up')[1]
      secondUpButton.click()

      expect(emitSpy).toHaveBeenCalledWith('commandchain:move', {
        fromIndex: 1,
        toIndex: 0
      })
    })
  })

  describe('Responsive Behavior', () => {
    it('should maintain horizontal layout on mobile', async () => {
      const mockCommands = [
        {
          command: 'CustomCommand',
          displayText: 'Custom Command',
          icon: 'fas fa-test'
        }
      ]

      await commandChainUI.render(mockCommands)

      const commandActions = document.querySelector('.command-actions')
      expect(commandActions).toBeTruthy()

      // Verify that command-actions maintains horizontal layout like toolbar-group
      // In a real browser, this would be flex with row direction
      // We're testing that the structure is correct for CSS to apply
      expect(commandActions.children.length).toBe(4)
      
      // All buttons should be direct children (horizontal layout)
      Array.from(commandActions.children).forEach(child => {
        expect(child.tagName).toBe('BUTTON')
        expect(child.classList.contains('command-action-btn')).toBe(true)
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper titles on action buttons', async () => {
      const mockCommands = [
        {
          command: 'CustomCommand',
          displayText: 'Custom Command',
          icon: 'fas fa-test'
        }
      ]

      await commandChainUI.render(mockCommands)

      const editButton = document.querySelector('.btn-edit')
      const deleteButton = document.querySelector('.btn-delete')
      const upButton = document.querySelector('.btn-up')
      const downButton = document.querySelector('.btn-down')

      expect(editButton.getAttribute('title')).toBe('Edit Command')
      expect(deleteButton.getAttribute('title')).toBe('Delete Command')
      expect(upButton.getAttribute('title')).toBe('Move Up')
      expect(downButton.getAttribute('title')).toBe('Move Down')
    })

    it('should have proper disabled states with titles', async () => {
      const mockCommands = [
        {
          command: 'OnlyCommand',
          displayText: 'Only Command',
          icon: 'fas fa-test'
        }
      ]

      await commandChainUI.render(mockCommands)

      const upButton = document.querySelector('.btn-up')
      const downButton = document.querySelector('.btn-down')

      // Single command should have both up and down disabled
      expect(upButton.disabled).toBe(true)
      expect(downButton.disabled).toBe(true)

      // Titles should still be present for accessibility
      expect(upButton.getAttribute('title')).toBe('Move Up')
      expect(downButton.getAttribute('title')).toBe('Move Down')
    })
  })
}) 