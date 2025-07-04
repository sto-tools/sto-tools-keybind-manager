import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import KeyService from '../../src/js/components/services/KeyService.js'
import KeyBrowserService from '../../src/js/components/services/KeyBrowserService.js'
import CommandUI from '../../src/js/components/ui/CommandUI.js'
import KeyBrowserUI from '../../src/js/components/ui/KeyBrowserUI.js'
import eventBus from '../../src/js/core/eventBus.js'
import { request } from '../../src/js/core/requestResponse.js'

let getElementByIdSpy
let keyService, keyBrowserService, commandUI, keyBrowserUI

function setupWindowMocks() {
  // Only mock getElementById, do not overwrite document
  getElementByIdSpy = vi.spyOn(document, 'getElementById').mockImplementation((id) => {
    if (id === 'stabilizeExecutionOrder') {
      return { checked: false }
    }
    return null
  })

  // Mock the window app instance
  window.app = {
    currentProfile: 'test-profile',
    currentEnvironment: 'space',
    selectedKey: 'F1',
    getCurrentProfile: () => ({
      keys: { F1: [] },
      keybindMetadata: {
        space: {
          F1: { stabilizeExecutionOrder: false }
        }
      }
    }),
    setModified: vi.fn(),
    renderKeyGrid: vi.fn(),
    renderCommandChain: vi.fn(),
    updateChainActions: vi.fn(),
    generateCommandId: () => 'test-id',
    saveCurrentBuild: vi.fn(),
    renderAliasGrid: vi.fn(),
    isValidKeyName: (name) => name.length > 0,
    deleteKey: vi.fn()
  }

  // Mock window dependencies
  window.storageService = {
    getProfile: vi.fn(() => ({
      builds: {
        space: { keys: { F1: [] } },
        ground: { keys: {} }
      }
    })),
    saveProfile: vi.fn(() => true)
  }

  window.stoUI = {
    showToast: vi.fn(),
    confirm: vi.fn(() => Promise.resolve(true))
  }

  window.i18next = {
    t: (key, opts) => key // ignore opts for now
  }

  window.STO_DATA = {
    validation: {
      keyNamePattern: /^[A-Za-z0-9_]+$/
    }
  }

  window.stoKeybinds = {
    validateKeybind: vi.fn(() => ({ valid: true, errors: [] }))
  }

  window.eventBus = eventBus

  // Create service instances
  keyService = new KeyService({
    storage: window.storageService,
    eventBus,
    i18n: window.i18next,
    ui: window.stoUI
  })
  keyService.currentProfile = 'test-profile'
  keyService.currentEnvironment = 'space'
  keyService.onInit() // Initialize event listeners

  keyBrowserService = new KeyBrowserService({
    storage: window.storageService,
    ui: window.stoUI
  })
  keyBrowserService.currentProfileId = 'test-profile'
  keyBrowserService.currentEnvironment = 'space'
  keyBrowserService.onInit() // Initialize event listeners

  commandUI = new CommandUI({
    eventBus,
    ui: window.stoUI,
    commandService: keyService
  })

  keyBrowserUI = new KeyBrowserUI({
    eventBus,
    document,
    ui: window.stoUI,
    i18n: window.i18next
  })
}

function restoreWindowMocks() {
  // Remove window mocks
  delete window.app
  delete window.storageService
  delete window.stoUI
  delete window.i18next
  delete window.STO_DATA
  delete window.stoKeybinds
  delete window.eventBus
  if (getElementByIdSpy) {
    getElementByIdSpy.mockRestore()
    getElementByIdSpy = undefined
  }
  keyService = null
  keyBrowserService = null
  commandUI = null
  keyBrowserUI = null
}

describe('Key Management Services Integration (formerly keyHandling)', () => {
  beforeEach(() => {
    setupWindowMocks()
  })

  afterEach(() => {
    restoreWindowMocks()
  })

  it('Key selection works via request/response pattern', async () => {
    // Proper architecture: use request to KeyBrowserService
    const result = await request(eventBus, 'key:select', { key: 'F2' })
    expect(result).toBe('F2')
    
    // KeyService should have synced its state via the key-selected event
    expect(keyService.selectedKey).toBe('F2')
    
    // KeyBrowserService should have updated its state
    expect(keyBrowserService.selectedKeyName).toBe('F2')
    
    // UI updates should have been triggered by KeyBrowserService
    expect(window.app.renderKeyGrid).toHaveBeenCalled()
    expect(window.app.updateChainActions).toHaveBeenCalled()
  })

  it('KeyService.addKey works when called directly', () => {
    const result = keyService.addKey('F3')
    expect(result).toBe(true)
    expect(window.storageService.saveProfile).toHaveBeenCalled()
    expect(keyService.selectedKey).toBe('F3')
    // The showToast call signature is ('key_added', 'success') in this mock context
    try {
      expect(window.stoUI.showToast).toHaveBeenCalledWith('key_added', 'success')
    } catch (e) {
      // Print all calls for debugging
      // eslint-disable-next-line no-console
      console.error('showToast calls:', window.stoUI.showToast.mock.calls)
      throw e
    }
  })

  it('KeyService.generateCommandId works when called directly', () => {
    const id = keyService.generateCommandId()
    expect(typeof id).toBe('string')
    expect(id.startsWith('cmd_')).toBe(true)
  })

  it('CommandUI.validateCurrentChain works when called directly', () => {
    expect(() => commandUI.validateCurrentChain('F1')).not.toThrow()
    expect(window.stoUI.showToast).toHaveBeenCalledWith('command_chain_is_valid', 'success')
  })

  it('service methods are available and functional', () => {
    // KeyService no longer has selectKey - that's handled by KeyBrowserService
    expect(typeof keyService.addKey).toBe('function')
    expect(typeof keyService.generateCommandId).toBe('function')
    expect(typeof keyBrowserService.selectKey).toBe('function')
    expect(typeof commandUI.validateCurrentChain).toBe('function')
    expect(typeof keyBrowserUI.confirmDeleteKey).toBe('function')
  })

  it('KeyBrowserUI.confirmDeleteKey works when context has deleteKey method', async () => {
    // Mock confirm to return true
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    
    // Spy on eventBus.emit to verify the key:delete event is emitted
    const emitSpy = vi.spyOn(eventBus, 'emit')
    
    const result = await keyBrowserUI.confirmDeleteKey('F1')
    
    expect(window.confirm).toHaveBeenCalled()
    expect(emitSpy).toHaveBeenCalledWith('key:delete', { key: 'F1' })
    expect(result).toBe(true)
    
    emitSpy.mockRestore()
    window.confirm.mockRestore()
  })

  it('KeyBrowserUI.confirmDeleteKey returns false when user cancels', async () => {
    // Mock confirm to return false
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    
    const result = await keyBrowserUI.confirmDeleteKey('F1')
    
    expect(window.confirm).toHaveBeenCalled()
    expect(result).toBe(false)
    
    window.confirm.mockRestore()
  })
}) 