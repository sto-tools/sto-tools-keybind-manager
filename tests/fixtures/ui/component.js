// UI Component fixture
// Provides a configured component with testing utilities for UI components

import { vi } from 'vitest'
import { createEventBusFixture } from '../core/eventBus.js'
import { registerFixture, unregisterFixture, generateFixtureId } from '../core/cleanup.js'

/**
 * Create a UI Component fixture for testing
 * @param {Object} ComponentClass - The UI component class to test
 * @param {Object} options - Configuration options
 * @param {Object} options.eventBus - Event bus instance (will create one if not provided)
 * @param {Object} options.document - Mock document object
 * @param {Object} options.i18n - Mock i18n object
 * @param {Object} options.constructorArgs - Arguments to pass to component constructor
 * @param {boolean} options.autoInit - Whether to auto-initialize the component
 * @returns {Object} Component fixture with testing utilities
 */
export function createUIComponentFixture(ComponentClass, options = {}) {
  const eventBus = options.eventBus || null

  const document = options.document || {
    getElementById: vi.fn((id) => {
      if (id === 'statusIndicator') {
        return {
          querySelector: vi.fn((selector) => {
            if (selector === 'i') {
              return {
                className: 'fas fa-check-circle'
              }
            }
            if (selector === 'span') {
              return {
                textContent: 'Valid',
                setAttribute: vi.fn()
              }
            }
            return {
              classList: { add: vi.fn(), remove: vi.fn() },
              setAttribute: vi.fn(),
              className: 'fas fa-check-circle',
              textContent: 'Valid'
            }
          }),
          classList: { add: vi.fn(), remove: vi.fn() },
          setAttribute: vi.fn(),
          onclick: null
        }
      }
      return {
        querySelector: vi.fn(() => ({
          classList: { add: vi.fn(), remove: vi.fn() },
          setAttribute: vi.fn(),
          removeAttribute: vi.fn(),
          style: { display: '' }
        })),
        classList: { add: vi.fn(), remove: vi.fn() },
        setAttribute: vi.fn(),
        removeAttribute: vi.fn(),
        style: { display: '' }
      }
    }),
    createElement: vi.fn(() => ({
      value: '',
      textContent: '',
      innerHTML: '',
      className: '',
      id: '',
      style: {},
      classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      click: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
      appendChild: vi.fn(),
      removeChild: vi.fn(),
      querySelector: vi.fn(),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn()
    })),
    body: { 
      appendChild: vi.fn(), 
      removeChild: vi.fn(),
      querySelector: vi.fn(),
      createElement: vi.fn(() => ({
        value: '',
        textContent: '',
        innerHTML: '',
        className: '',
        id: '',
        style: {},
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        click: vi.fn(),
        focus: vi.fn(),
        blur: vi.fn(),
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        querySelector: vi.fn(),
        setAttribute: vi.fn(),
        removeAttribute: vi.fn()
      }))
    }
  }

  const i18n = options.i18n || {
    t: vi.fn((key, params) => key)
  }

  const constructorArgs = options.constructorArgs || {}
  const autoInit = options.autoInit || false

  const fixtureId = generateFixtureId('uiComponent')

  // Create eventBus if not provided
  const eventBusFixture = eventBus || createEventBusFixture()
  const actualEventBus = eventBus || eventBusFixture.eventBus

  // Default constructor arguments for UI components
  const defaultArgs = {
    eventBus: actualEventBus,
    document: document,
    i18n: i18n,
    modalManager: null,
    ui: null
  }

  const finalConstructorArgs = { ...defaultArgs, ...constructorArgs }

  // Create component instance
  const component = new ComponentClass(finalConstructorArgs)

  // Track initialization state
  let isInitialized = false
  let isDestroyed = false

  // Spy on lifecycle methods
  const originalInit = component.init.bind(component)
  const originalDestroy = component.destroy.bind(component)

  component.init = vi.fn((...args) => {
    const result = originalInit(...args)
    isInitialized = true
    isDestroyed = false
    return result
  })

  component.destroy = vi.fn((...args) => {
    const result = originalDestroy(...args)
    isInitialized = false
    isDestroyed = true
    return result
  })

  // Auto-initialize if requested
  if (autoInit) {
    component.init()
  }

  // Register fixture for cleanup
  const cleanupFn = () => {
    if (!isDestroyed && component.destroy) {
      component.destroy()
    }
    if (eventBusFixture) {
      eventBusFixture.destroy()
    }
  }
  registerFixture(fixtureId, cleanupFn)

  // Return fixture with component and utilities
  return {
    component,
    eventBus: actualEventBus,
    document,
    i18n,

    // Convenience methods
    getComponent: () => component,

    // State checks
    isInitialized: () => isInitialized,
    isDestroyed: () => isDestroyed,

    // Event handling utilities
    emit: (event, data) => actualEventBus.emit(event, data),
    on: (event, callback) => actualEventBus.on(event, callback),
    off: (event, callback) => actualEventBus.off(event, callback),
    request: (topic, payload) => actualEventBus.request(topic, payload),

    // Mock response helper
    mockResponse: (topic, handler) => actualEventBus.mockResponse(topic, handler),

    // Manual cleanup
    cleanup: () => {
      unregisterFixture(fixtureId)
      if (eventBusFixture) {
        eventBusFixture.destroy()
      }
    }
  }
}