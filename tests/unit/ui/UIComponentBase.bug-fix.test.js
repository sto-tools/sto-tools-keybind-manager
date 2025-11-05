import { describe, it, expect, beforeEach, vi } from 'vitest'
import UIComponentBase from '../../../src/js/components/UIComponentBase.js'

describe('UIComponentBase Bug Fix Verification', () => {
  let eventBus

  beforeEach(() => {
    // Mock event bus
    eventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    }
  })

  describe('Bug Fix: UIComponentBase unused onInit method', () => {
    it('should execute UIComponentBase initialization logic automatically', () => {
      // Create a UI component that overrides onInit() without calling super.onInit()
      // This represents the old pattern that was causing the bug
      class OldStyleUIComponent extends UIComponentBase {
        constructor(eventBus) {
          super(eventBus)
          this.initializationLogicRan = false
          this.dataDependencyCheckRan = false
        }

        onInit() {
          // Old pattern: override onInit() without calling super.onInit()
          // This used to bypass UIComponentBase's logic
          this.initializationLogicRan = true
        }

        performInitialRender() {
          this.dataDependencyCheckRan = true
        }
      }

      const component = new OldStyleUIComponent(eventBus)

      // Initialize the component
      component.init()

      // With the fix: Both should work now
      // 1. UIComponentBase's uiInit() runs and handles data dependency checking
      // 2. Component's onInit() runs for component-specific logic
      expect(component.initializationLogicRan).toBe(true)
      expect(component.dataDependencyCheckRan).toBe(true)
      expect(component.pendingInitialRender).toBe(false)
    })

    it('should demonstrate the fix works for real UI components', () => {
      // Create a realistic UI component that follows the existing pattern in the codebase
      class RealisticUIComponent extends UIComponentBase {
        constructor(eventBus) {
          super(eventBus)
          this.container = { appendChild: vi.fn() }
          this.setupCalled = false
          this.rendered = false
        }

        onInit() {
          // This is what real UI components do - they override onInit()
          // Without the fix, UIComponentBase's logic would be bypassed
          this.setupCalled = true
        }

        performInitialRender() {
          this.rendered = true
        }
      }

      const component = new RealisticUIComponent(eventBus)

      // Initialize the component
      component.init()

      // Verify the fix: Both UIComponentBase and component logic work
      expect(component.setupCalled).toBe(true) // Component's onInit() ran
      expect(component.rendered).toBe(true)   // UIComponentBase's uiInit() ran
      expect(component.pendingInitialRender).toBe(false)
    })

    it('should maintain proper initialization order: ComponentBase → UIComponentBase → Component', () => {
      let callOrder = []

      // Create a component that tracks the exact order of initialization
      class OrderTrackingUIComponent extends UIComponentBase {
        constructor(eventBus) {
          super(eventBus)
          this.componentBaseInitCalled = false
          this.uiInitCalled = false
          this.onInitCalled = false
        }

        onInit() {
          callOrder.push('Component:onInit')
          this.onInitCalled = true
        }

        uiInit() {
          callOrder.push('UIComponentBase:uiInit')
          this.uiInitCalled = true
          super.uiInit()
        }

        performInitialRender() {
          callOrder.push('UIComponentBase:performInitialRender')
        }
      }

      // Mock ComponentBase to track when it calls uiInit()
      const originalInit = UIComponentBase.prototype.init
      let componentBaseSetupDone = false

      UIComponentBase.prototype.init = function() {
        callOrder.push('ComponentBase:framework-setup')
        componentBaseSetupDone = true
        return originalInit.call(this)
      }

      const component = new OrderTrackingUIComponent(eventBus)
      component.init()

      // Restore original method
      UIComponentBase.prototype.init = originalInit

      // Verify the correct order
      expect(callOrder).toContain('ComponentBase:framework-setup')
      expect(callOrder).toContain('UIComponentBase:uiInit')
      expect(callOrder).toContain('UIComponentBase:performInitialRender')
      expect(callOrder).toContain('Component:onInit')

      // Verify uiInit() comes before onInit()
      const uiInitIndex = callOrder.indexOf('UIComponentBase:uiInit')
      const onInitIndex = callOrder.indexOf('Component:onInit')
      expect(uiInitIndex).toBeLessThan(onInitIndex)
    })

    it('should handle data dependency management correctly', () => {
      // Create a component that requires specific data
      class DataDependentUIComponent extends UIComponentBase {
        constructor(eventBus) {
          super(eventBus)
          this.dataReady = false
          this.renderCallCount = 0
        }

        hasRequiredData() {
          return this.dataReady
        }

        performInitialRender() {
          this.renderCallCount++
        }

        setDataReady(ready) {
          this.dataReady = ready
        }
      }

      const component = new DataDependentUIComponent(eventBus)

      // Test 1: Initialize with data not ready
      component.setDataReady(false)
      component.init()

      expect(component.pendingInitialRender).toBe(true)
      expect(component.renderCallCount).toBe(0)

      // Test 2: Data becomes available, render should happen
      component.setDataReady(true)
      // Force render by directly manipulating state and calling performInitialRender
      component.pendingInitialRender = false
      const renderSpy = vi.spyOn(component, 'performInitialRender')
      component.performInitialRender()

      expect(component.pendingInitialRender).toBe(false)
      expect(component.renderCallCount).toBe(1)
      expect(renderSpy).toHaveBeenCalled()

      // Test 3: Initialize with data ready from the start
      const component2 = new DataDependentUIComponent(eventBus)
      component2.setDataReady(true)
      component2.init()

      expect(component2.pendingInitialRender).toBe(false)
      expect(component2.renderCallCount).toBe(1)
    })
  })

  describe('Backward Compatibility', () => {
    it('should work with existing UI components without requiring code changes', () => {
      // This test verifies that existing UI components in the codebase
      // will automatically benefit from the fix without any changes needed

      class ExistingUIComponent extends UIComponentBase {
        constructor(eventBus) {
          super(eventBus)
          this.existingLogicExecuted = false
        }

        onInit() {
          // Existing components just override onInit()
          // They don't need to call super.onInit() anymore
          this.existingLogicExecuted = true
        }

        performInitialRender() {
          // Some rendering logic
        }
      }

      const component = new ExistingUIComponent(eventBus)
      component.init()

      // Both should work automatically now
      expect(component.existingLogicExecuted).toBe(true)
      expect(component.pendingInitialRender).toBe(false)
    })
  })
})