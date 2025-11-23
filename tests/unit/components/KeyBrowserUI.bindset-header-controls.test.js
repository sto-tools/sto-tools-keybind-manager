import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import KeyBrowserUI from '../../../src/js/components/ui/KeyBrowserUI.js'

describe('KeyBrowserUI Bindset Header Controls Tests', () => {
  let keyBrowserUI
  let mockEventBus
  let mockI18n
  let dom

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><div id="key-browser"></div>')
    global.document = dom.window.document
    global.window = dom.window

    mockEventBus = {
      request: vi.fn(),
      respond: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    }

    mockI18n = {
      t: vi.fn((key) => key)
    }

    keyBrowserUI = new KeyBrowserUI({
      eventBus: mockEventBus,
      container: dom.window.document.getElementById('key-browser'),
      i18n: mockI18n
    })

    // Initialize cache with test data
    keyBrowserUI.cache = {
      selectedKey: 'F1',
      activeBindset: 'Primary Bindset',
      currentEnvironment: 'space',
      profile: {
        bindsets: {
          'Primary Bindset': {
            space: {
              keys: {
                'F1': ['attack'],
                'F2': ['defend']
              }
            }
          },
          'Custom Bindset': {
            space: {
              keys: {
                'F1': ['custom_attack'],
                'F3': ['custom_defend']
              }
            }
          }
        }
      },
      preferences: {
        bindsetsEnabled: true,
        bindToAliasMode: true
      }
    }

    // Mock methods
    keyBrowserUI.emit = vi.fn()
    keyBrowserUI.onDom = vi.fn()
    keyBrowserUI.confirmDeleteBindset = vi.fn()
    keyBrowserUI.request = vi.fn().mockResolvedValue({})
  })

  describe('createBindsetSectionElement', () => {
    it('should create Create + Clone buttons for Primary Bindset (no Delete)', async () => {
      const bindsetData = {
        keys: ['F1', 'F2'],
        keyCount: 2,
        isCollapsed: false
      }

      const element = await keyBrowserUI.createBindsetSectionElement('Primary Bindset', bindsetData)
      const actionsContainer = element.querySelector('.bindset-actions')

      expect(actionsContainer).toBeTruthy()

      const buttons = actionsContainer.querySelectorAll('button.control-btn')
      expect(buttons).toHaveLength(2)

      const createBtn = actionsContainer.querySelector('[data-action="create-bindset"]')
      const cloneBtn = actionsContainer.querySelector('[data-action="clone-bindset"]')
      const deleteBtn = actionsContainer.querySelector('[data-action="delete-bindset"]')

      expect(createBtn).toBeTruthy()
      expect(cloneBtn).toBeTruthy()
      expect(deleteBtn).toBeFalsy() // Should NOT have delete button

      // Verify button content
      expect(createBtn.innerHTML).toContain('fa-plus')
      expect(cloneBtn.innerHTML).toContain('fa-copy')

      // Verify event handlers are attached for primary bindset
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object), 'click', 'bindset-create-btn', expect.any(Function)
      )
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object), 'click', 'bindset-clone-btn', expect.any(Function)
      )
    })

    it('should create Clone + Delete buttons for User-Defined Bindset (no Create)', async () => {
      const bindsetData = {
        keys: ['F1', 'F3'],
        keyCount: 2,
        isCollapsed: false
      }

      const element = await keyBrowserUI.createBindsetSectionElement('Custom Bindset', bindsetData)
      const actionsContainer = element.querySelector('.bindset-actions')

      expect(actionsContainer).toBeTruthy()

      const buttons = actionsContainer.querySelectorAll('button.control-btn')
      expect(buttons).toHaveLength(3) // Clone, Rename, Delete

      const createBtn = actionsContainer.querySelector('[data-action="create-bindset"]')
      const cloneBtn = actionsContainer.querySelector('[data-action="clone-bindset"]')
      const renameBtn = actionsContainer.querySelector('[data-action="rename-bindset"]')
      const deleteBtn = actionsContainer.querySelector('[data-action="delete-bindset"]')

      expect(createBtn).toBeFalsy() // Should NOT have create button
      expect(cloneBtn).toBeTruthy()
      expect(renameBtn).toBeTruthy()
      expect(deleteBtn).toBeTruthy()

      // Verify button content and styling
      expect(cloneBtn.innerHTML).toContain('fa-copy')
      expect(renameBtn.innerHTML).toContain('fa-edit')
      expect(deleteBtn.innerHTML).toContain('fa-trash')
      expect(deleteBtn.className).toContain('control-btn-danger')

      // Verify event handlers are attached for user-defined bindset
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object), 'click', 'bindset-clone-btn', expect.any(Function)
      )
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object), 'click', 'bindset-rename-btn', expect.any(Function)
      )
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object), 'click', 'bindset-delete-btn', expect.any(Function)
      )
    })

    it('should handle empty bindsets correctly', async () => {
      const bindsetData = {
        keys: [],
        keyCount: 0,
        isCollapsed: false
      }

      const element = await keyBrowserUI.createBindsetSectionElement('Empty Bindset', bindsetData)
      const actionsContainer = element.querySelector('.bindset-actions')

      // Should still have controls even for empty bindsets
      expect(actionsContainer).toBeTruthy()

      const buttons = actionsContainer.querySelectorAll('button.control-btn')
      expect(buttons).toHaveLength(3) // Clone + Rename + Delete for user-defined
    })
  })

  describe('regression tests for bindset header controls bug', () => {
    it('should not show Delete button on Primary Bindset (regression: js-bindset-header-controls)', async () => {
      const bindsetData = { keys: ['F1'], keyCount: 1, isCollapsed: false }

      const element = await keyBrowserUI.createBindsetSectionElement('Primary Bindset', bindsetData)
      const deleteBtn = element.querySelector('[data-action="delete-bindset"]')

      expect(deleteBtn).toBeFalsy()
    })

    it('should not show Create button on User-Defined Bindset (regression: js-bindset-header-controls)', async () => {
      const bindsetData = { keys: ['F1'], keyCount: 1, isCollapsed: false }

      const element = await keyBrowserUI.createBindsetSectionElement('Custom Bindset', bindsetData)
      const createBtn = element.querySelector('[data-action="create-bindset"]')

      expect(createBtn).toBeFalsy()
    })

    it('should show Create and Clone buttons on Primary Bindset (regression: js-bindset-header-controls)', async () => {
      const bindsetData = { keys: ['F1'], keyCount: 1, isCollapsed: false }

      // Test createBindsetSectionElement
      const element = await keyBrowserUI.createBindsetSectionElement('Primary Bindset', bindsetData)
      const actionsContainer = element.querySelector('.bindset-actions')

      const createBtn = actionsContainer.querySelector('[data-action="create-bindset"]')
      const cloneBtn = actionsContainer.querySelector('[data-action="clone-bindset"]')

      expect(createBtn).toBeTruthy()
      expect(cloneBtn).toBeTruthy()
    })

    it('should show Clone and Delete buttons on User-Defined Bindset (regression: js-bindset-header-controls)', async () => {
      const bindsetData = { keys: ['F1'], keyCount: 1, isCollapsed: false }

      // Test createBindsetSectionElement
      const element = await keyBrowserUI.createBindsetSectionElement('Custom Bindset', bindsetData)
      const actionsContainer = element.querySelector('.bindset-actions')

      const cloneBtn = actionsContainer.querySelector('[data-action="clone-bindset"]')
      const renameBtn = actionsContainer.querySelector('[data-action="rename-bindset"]')
      const deleteBtn = actionsContainer.querySelector('[data-action="delete-bindset"]')

      expect(cloneBtn).toBeTruthy()
      expect(renameBtn).toBeTruthy()
      expect(deleteBtn).toBeTruthy()
    })
  })

  describe('event handler verification', () => {
    it('should attach correct event handlers for Primary Bindset controls', async () => {
      const bindsetData = { keys: ['F1'], keyCount: 1, isCollapsed: false }

      await keyBrowserUI.createBindsetSectionElement('Primary Bindset', bindsetData)

      // Should have create and clone handlers, but no delete handler
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object), 'click', 'bindset-create-btn', expect.any(Function)
      )
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object), 'click', 'bindset-clone-btn', expect.any(Function)
      )

      // Verify that delete confirmation is not called for primary bindset
      expect(keyBrowserUI.confirmDeleteBindset).not.toHaveBeenCalled()
    })

    it('should attach correct event handlers for User-Defined Bindset controls', async () => {
      const bindsetData = { keys: ['F1'], keyCount: 1, isCollapsed: false }

      await keyBrowserUI.createBindsetSectionElement('Custom Bindset', bindsetData)

      // Should have clone, rename, and delete handlers, but no create handler
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object), 'click', 'bindset-clone-btn', expect.any(Function)
      )
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object), 'click', 'bindset-rename-btn', expect.any(Function)
      )
      expect(keyBrowserUI.onDom).toHaveBeenCalledWith(
        expect.any(Object), 'click', 'bindset-delete-btn', expect.any(Function)
      )
    })
  })
})