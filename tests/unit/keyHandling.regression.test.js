import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { keyHandling } from '../../src/js/keyHandling.js'

let getElementByIdSpy

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
    isValidKeyName: (name) => name.length > 0
  }

  // Mock window dependencies
  window.stoStorage = {
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

  window.eventBus = {
    emit: vi.fn()
  }
}

function restoreWindowMocks() {
  // Remove window mocks
  delete window.app
  delete window.stoStorage
  delete window.stoUI
  delete window.i18next
  delete window.STO_DATA
  delete window.stoKeybinds
  delete window.eventBus
  if (getElementByIdSpy) {
    getElementByIdSpy.mockRestore()
    getElementByIdSpy = undefined
  }
}

describe('keyHandling direct-call regression (context binding)', () => {
  beforeEach(() => {
    setupWindowMocks()
  })

  afterEach(() => {
    restoreWindowMocks()
  })

  it('selectKey works when called directly', () => {
    expect(() => keyHandling.selectKey('F2')).not.toThrow()
    expect(window.app.selectedKey).toBe('F2')
    expect(window.app.renderKeyGrid).toHaveBeenCalled()
    expect(window.app.renderCommandChain).toHaveBeenCalled()
    expect(window.app.updateChainActions).toHaveBeenCalled()
  })

  it('addKey works when called directly', () => {
    const result = keyHandling.addKey('F3')
    expect(result).toBe(true)
    expect(window.stoStorage.saveProfile).toHaveBeenCalled()
    expect(window.app.renderKeyGrid).toHaveBeenCalled()
    expect(window.app.selectedKey).toBe('F3')
    expect(window.app.setModified).toHaveBeenCalled()
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

  it('generateCommandId works when called directly', () => {
    const id = keyHandling.generateCommandId()
    expect(typeof id).toBe('string')
    expect(id.startsWith('cmd_')).toBe(true)
  })

  it('validateCurrentChain works when called directly', () => {
    expect(() => keyHandling.validateCurrentChain()).not.toThrow()
    expect(window.stoUI.showToast).toHaveBeenCalled()
  })

  it('context detection works and methods are available', () => {
    expect(typeof keyHandling.selectKey).toBe('function')
    expect(typeof keyHandling.addKey).toBe('function')
    expect(typeof keyHandling.generateCommandId).toBe('function')
    expect(typeof keyHandling.validateCurrentChain).toBe('function')
  })
}) 