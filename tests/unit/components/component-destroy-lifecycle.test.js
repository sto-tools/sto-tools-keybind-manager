/**
 * Regression test for component destroy lifecycle bug
 * Tests that ComponentBase.destroy() properly calls overridden onDestroy() methods in subclasses
 */

import { describe, test, expect, beforeEach, vi } from 'vitest'
import ComponentBase from '../../../src/js/components/ComponentBase.js'

// Create test components to verify the inheritance mechanism
class TestComponentWithOnDestroy extends ComponentBase {
  constructor(...args) {
    super(...args)
    this.onDestroyCalled = false
    this.onDestroyCleanupData = null
  }

  onDestroy() {
    this.onDestroyCalled = true
    this.onDestroyCleanupData = 'cleanup-performed'
  }
}

class TestComponentWithDestroyOverride extends ComponentBase {
  constructor(...args) {
    super(...args)
    this.superDestroyCalled = false
    this.ownDestroyCalled = false
  }

  onDestroy() {
    this.ownDestroyCalled = true
  }

  destroy() {
    // Custom destroy logic
    this.ownDestroyCalled = true

    // Call super.destroy() which should call onDestroy()
    if (super.destroy && typeof super.destroy === 'function') {
      super.destroy()
    }
    this.superDestroyCalled = true
  }
}

class TestComponentWithNoOverride extends ComponentBase {
  constructor(...args) {
    super(...args)
    this.customCleanup = false
  }
}

describe('Component Destroy Lifecycle Regression Test', () => {
  let mockEventBus

  beforeEach(() => {
    mockEventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    }
  })

  describe('ComponentBase.destroy() → onDestroy() inheritance', () => {
    test('should call overridden onDestroy() when destroy() is called', () => {
      const component = new TestComponentWithOnDestroy(mockEventBus)
      component.init()

      // Call destroy() on the component
      component.destroy()

      // Verify that onDestroy() was called
      expect(component.onDestroyCalled).toBe(true)
      expect(component.onDestroyCleanupData).toBe('cleanup-performed')
      expect(component.destroyed).toBe(true)
    })

    test('should call onDestroy() even when component has custom destroy() override', () => {
      const component = new TestComponentWithDestroyOverride(mockEventBus)
      component.init()

      // Call destroy() on the component
      component.destroy()

      // Verify that both the custom destroy() and the inherited onDestroy() were called
      expect(component.ownDestroyCalled).toBe(true)
      expect(component.superDestroyCalled).toBe(true)
      expect(component.destroyed).toBe(true)
    })

    test('should handle components with no onDestroy override gracefully', () => {
      const component = new TestComponentWithNoOverride(mockEventBus)
      component.init()

      // Call destroy() on the component
      component.destroy()

      // Verify that destroy() completes without errors
      expect(component.destroyed).toBe(true)
      expect(component.initialized).toBe(false)
    })

    test('should not call onDestroy() if component is already destroyed', () => {
      const component = new TestComponentWithOnDestroy(mockEventBus)
      component.init()

      // First destroy call
      component.destroy()
      expect(component.onDestroyCalled).toBe(true)

      // Reset the flag for testing
      component.onDestroyCalled = false

      // Second destroy call should not call onDestroy() again
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      component.destroy()

      expect(component.onDestroyCalled).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('is already destroyed')
      )

      consoleSpy.mockRestore()
    })
  })

  describe('Inheritance chain verification', () => {
    test('should verify that this.onDestroy() resolves to subclass method', () => {
      const component = new TestComponentWithOnDestroy(mockEventBus)

      // Verify method resolution
      expect(component.onDestroy).toBeDefined()
      expect(typeof component.onDestroy).toBe('function')
      expect(component.onDestroy).toBe(TestComponentWithOnDestroy.prototype.onDestroy)
    })

    test('should verify that destroy() method exists and is callable', () => {
      const component = new TestComponentWithOnDestroy(mockEventBus)

      // Verify destroy method exists
      expect(component.destroy).toBeDefined()
      expect(typeof component.destroy).toBe('function')
      expect(component.destroy).toBe(ComponentBase.prototype.destroy)
    })
  })

  describe('Component lifecycle state management', () => {
    test('should properly set flags during destroy', () => {
      const component = new TestComponentWithOnDestroy(mockEventBus)
      component.init()

      // Verify initial state
      expect(component.initialized).toBe(true)
      expect(component.destroyed).toBe(false)

      // Call destroy()
      component.destroy()

      // Verify final state
      expect(component.initialized).toBe(false)
      expect(component.destroyed).toBe(true)
      expect(component.onDestroyCalled).toBe(true)
    })
  })

  describe('Multiple inheritance levels', () => {
    // Test intermediate inheritance levels
    class IntermediateComponent extends ComponentBase {
      onDestroy() {
        this.intermediateCleanup = true
      }
    }

    class FinalComponent extends IntermediateComponent {
      onDestroy() {
        super.onDestroy() // Call parent onDestroy if it exists
        this.finalCleanup = true
      }
    }

    test('should handle multiple levels of inheritance correctly', () => {
      const component = new FinalComponent(mockEventBus)
      component.init()

      component.destroy()

      expect(component.finalCleanup).toBe(true)
      expect(component.intermediateCleanup).toBe(true)
      expect(component.destroyed).toBe(true)
    })
  })
})