import { describe, it, expect, beforeEach, vi } from 'vitest'
import InterfaceModeService from '../../src/js/components/services/InterfaceModeService.js'
import InterfaceModeUI from '../../src/js/components/ui/InterfaceModeUI.js'

describe('Interface Mode Event Listener Cleanup Integration', () => {
  let realEventBus
  let mockStorage
  let mockProfileService
  let mockApp
  let mockDocument
  let mockUI
  let mockProfileUI
  let mockSpaceBtn
  let mockGroundBtn
  let mockAliasBtn

  beforeEach(() => {
    // Create a real event bus to test actual behavior
    realEventBus = {
      listeners: new Map(),
      on(event, callback) {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, new Set())
        }
        this.listeners.get(event).add(callback)
      },
      off(event, callback) {
        const eventListeners = this.listeners.get(event)
        if (eventListeners) {
          if (callback) {
            eventListeners.delete(callback)
          } else {
            // This simulates the bug - removing all listeners when no callback provided
            eventListeners.clear()
          }
        }
      },
      emit(event, data) {
        const eventListeners = this.listeners.get(event)
        if (eventListeners) {
          eventListeners.forEach(callback => {
            try {
              callback(data)
            } catch (error) {
              console.error(`Error in event listener for ${event}:`, error)
            }
          })
        }
      }
    }

    mockStorage = {
      getProfile: vi.fn(() => ({ currentEnvironment: 'space' })),
      saveProfile: vi.fn()
    }
    
    mockProfileService = {
      setCurrentEnvironment: vi.fn()
    }
    
    mockApp = {
      currentProfile: 'test-profile'
    }

    mockUI = {
      showToast: vi.fn()
    }
    
    mockProfileUI = {
      renderKeyGrid: vi.fn(),
      renderCommandChain: vi.fn()
    }

    // Mock DOM elements
    mockSpaceBtn = { addEventListener: vi.fn(), classList: { toggle: vi.fn() }, removeEventListener: vi.fn() }
    mockGroundBtn = { addEventListener: vi.fn(), classList: { toggle: vi.fn() }, removeEventListener: vi.fn() }
    mockAliasBtn = { addEventListener: vi.fn(), classList: { toggle: vi.fn() }, removeEventListener: vi.fn() }

    mockDocument = {
      querySelector: vi.fn((selector) => {
        if (selector === '[data-mode="space"]') return mockSpaceBtn
        if (selector === '[data-mode="ground"]') return mockGroundBtn
        if (selector === '[data-mode="alias"]') return mockAliasBtn
        if (selector === '.key-selector-container') return { style: { display: '' } }
        return null
      }),
      getElementById: vi.fn((id) => {
        if (id === 'aliasSelectorContainer') return { style: { display: 'none' } }
        return null
      })
    }
  })

  it('should properly clean up event listeners without affecting other components', () => {
    // Create service and UI components
    const service = new InterfaceModeService({
      eventBus: realEventBus,
      storage: mockStorage,
      profileService: mockProfileService,
      app: mockApp
    })

    const ui = new InterfaceModeUI({
      service: service,
      eventBus: realEventBus,
      ui: mockUI,
      profileUI: mockProfileUI,
      document: mockDocument
    })

    // Create external handlers that simulate other components
    const externalModeChangedHandler = vi.fn()
    const externalEnvironmentChangedHandler = vi.fn()
    const externalModeSwitchedHandler = vi.fn()
    const externalProfileSwitchedHandler = vi.fn()

    // Register external handlers
    realEventBus.on('mode-changed', externalModeChangedHandler)
    realEventBus.on('environment:changed', externalEnvironmentChangedHandler)
    realEventBus.on('mode-switched', externalModeSwitchedHandler)
    realEventBus.on('profile:switched', externalProfileSwitchedHandler)

    // Initialize both components
    service.init()
    ui.init()

    // Verify all handlers are registered
    expect(realEventBus.listeners.get('mode-changed').size).toBe(2) // UI + external
    expect(realEventBus.listeners.get('environment:changed').size).toBe(2) // UI + external
    expect(realEventBus.listeners.get('mode-switched').size).toBe(2) // Service + external
    expect(realEventBus.listeners.get('profile:switched').size).toBe(2) // Service + external

    // Test that the system works end-to-end
    realEventBus.emit('mode-switched', { mode: 'ground' })
    
    // Service should have processed the event
    expect(service.currentMode).toBe('ground')
    // External handler should have been called
    expect(externalModeSwitchedHandler).toHaveBeenCalledWith({ mode: 'ground' })
    // UI should have been updated via the mode-changed event
    expect(mockProfileUI.renderKeyGrid).toHaveBeenCalled()

    // Reset mocks
    externalModeChangedHandler.mockClear()
    externalEnvironmentChangedHandler.mockClear()
    externalModeSwitchedHandler.mockClear()
    externalProfileSwitchedHandler.mockClear()

    // Destroy the service component
    service.destroy()

    // Verify only service handlers were removed
    expect(realEventBus.listeners.get('mode-switched').size).toBe(1) // Only external remains
    expect(realEventBus.listeners.get('profile:switched').size).toBe(1) // Only external remains
    expect(realEventBus.listeners.get('mode-changed').size).toBe(2) // UI + external still there
    expect(realEventBus.listeners.get('environment:changed').size).toBe(2) // UI + external still there

    // Destroy the UI component
    ui.destroy()

    // Verify only UI handlers were removed
    expect(realEventBus.listeners.get('mode-changed').size).toBe(1) // Only external remains
    expect(realEventBus.listeners.get('environment:changed').size).toBe(1) // Only external remains
    expect(realEventBus.listeners.get('mode-switched').size).toBe(1) // Only external remains
    expect(realEventBus.listeners.get('profile:switched').size).toBe(1) // Only external remains

    // Verify external handlers still work
    realEventBus.emit('mode-changed', { newMode: 'alias' })
    realEventBus.emit('environment:changed', { environment: 'alias' })
    realEventBus.emit('mode-switched', { mode: 'space' })
    realEventBus.emit('profile:switched', { environment: 'space' })

    expect(externalModeChangedHandler).toHaveBeenCalledWith({ newMode: 'alias' })
    expect(externalEnvironmentChangedHandler).toHaveBeenCalledWith({ environment: 'alias' })
    expect(externalModeSwitchedHandler).toHaveBeenCalledWith({ mode: 'space' })
    expect(externalProfileSwitchedHandler).toHaveBeenCalledWith({ environment: 'space' })
  })

  it('should handle component destruction in any order', () => {
    // Create multiple instances of each component
    const service1 = new InterfaceModeService({
      eventBus: realEventBus,
      storage: mockStorage,
      profileService: mockProfileService,
      app: mockApp
    })

    const service2 = new InterfaceModeService({
      eventBus: realEventBus,
      storage: mockStorage,
      profileService: mockProfileService,
      app: mockApp
    })

    const ui1 = new InterfaceModeUI({
      service: service1,
      eventBus: realEventBus,
      ui: mockUI,
      profileUI: mockProfileUI,
      document: mockDocument
    })

    const ui2 = new InterfaceModeUI({
      service: service2,
      eventBus: realEventBus,
      ui: mockUI,
      profileUI: mockProfileUI,
      document: mockDocument
    })

    // Initialize all components
    service1.init()
    service2.init()
    ui1.init()
    ui2.init()

    // Verify all handlers are registered
    expect(realEventBus.listeners.get('mode-switched').size).toBe(2) // 2 services
    expect(realEventBus.listeners.get('profile:switched').size).toBe(2) // 2 services
    expect(realEventBus.listeners.get('mode-changed').size).toBe(2) // 2 UIs
    expect(realEventBus.listeners.get('environment:changed').size).toBe(2) // 2 UIs

    // Destroy components in mixed order
    service1.destroy()
    expect(realEventBus.listeners.get('mode-switched').size).toBe(1) // 1 service remains
    expect(realEventBus.listeners.get('profile:switched').size).toBe(1) // 1 service remains

    ui2.destroy()
    expect(realEventBus.listeners.get('mode-changed').size).toBe(1) // 1 UI remains
    expect(realEventBus.listeners.get('environment:changed').size).toBe(1) // 1 UI remains

    ui1.destroy()
    expect(realEventBus.listeners.get('mode-changed').size).toBe(0) // No UIs remain
    expect(realEventBus.listeners.get('environment:changed').size).toBe(0) // No UIs remain

    service2.destroy()
    expect(realEventBus.listeners.get('mode-switched').size).toBe(0) // No services remain
    expect(realEventBus.listeners.get('profile:switched').size).toBe(0) // No services remain
  })

  it('should not fail when destroying components that were never initialized', () => {
    const service = new InterfaceModeService({
      eventBus: realEventBus,
      storage: mockStorage,
      profileService: mockProfileService,
      app: mockApp
    })

    const ui = new InterfaceModeUI({
      service: service,
      eventBus: realEventBus,
      ui: mockUI,
      profileUI: mockProfileUI,
      document: mockDocument
    })

    // The service registers a request/response handler in its constructor
    // so we expect 1 listener (for 'state:current-environment')
    expect(realEventBus.listeners.size).toBe(1)
    expect(realEventBus.listeners.has('state:current-environment')).toBe(true)

    // Destroy without initializing - should not throw or affect other listeners
    expect(() => service.destroy()).not.toThrow()
    expect(() => ui.destroy()).not.toThrow()

    // Event bus should have no active listeners after cleanup
    // Check if all event listener sets are empty
    let totalListeners = 0
    for (const [event, listenerSet] of realEventBus.listeners) {
      totalListeners += listenerSet.size
    }
    expect(totalListeners).toBe(0)
  })
}) 
