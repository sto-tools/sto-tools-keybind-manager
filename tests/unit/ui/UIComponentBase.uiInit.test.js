import { describe, it, expect, beforeEach, vi } from 'vitest'
import UIComponentBase from '../../../src/js/components/UIComponentBase.js'

describe('UIComponentBase uiInit Integration', () => {
  let eventBus
  let uiComponent

  beforeEach(() => {
    // Mock event bus
    eventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    }
  })

  describe('uiInit() Hook Integration', () => {
    it('should call uiInit() automatically during component initialization', () => {
      // Create a test UI component that tracks method calls
      class TestUIComponent extends UIComponentBase {
        constructor(eventBus) {
          super(eventBus)
          this.uiInitCalled = false
          this.onInitCalled = false
        }

        uiInit() {
          this.uiInitCalled = true
          super.uiInit()
        }

        onInit() {
          this.onInitCalled = true
        }
      }

      const component = new TestUIComponent(eventBus)

      // Initialize the component
      component.init()

      // Verify both uiInit() and onInit() were called
      expect(component.uiInitCalled).toBe(true)
      expect(component.onInitCalled).toBe(true)
    })

    it('should call uiInit() before onInit() during initialization', () => {
      // Create a test UI component that tracks call order
      class TestUIComponent extends UIComponentBase {
        constructor(eventBus) {
          super(eventBus)
          this.callOrder = []
        }

        uiInit() {
          this.callOrder.push('uiInit')
          super.uiInit()
        }

        onInit() {
          this.callOrder.push('onInit')
        }
      }

      const component = new TestUIComponent(eventBus)

      // Initialize the component
      component.init()

      // Verify uiInit() was called before onInit()
      expect(component.callOrder).toEqual(['uiInit', 'onInit'])
    })

    it('should perform data dependency checking in uiInit()', () => {
      // Create a test UI component that requires specific data
      class TestUIComponent extends UIComponentBase {
        constructor(eventBus) {
          super(eventBus)
          this.renderCalled = false
          this.dataReady = false
        }

        hasRequiredData() {
          return this.dataReady
        }

        performInitialRender() {
          this.renderCalled = true
        }

        setDataReady(ready) {
          this.dataReady = ready
        }
      }

      const component = new TestUIComponent(eventBus)

      // Initialize with data not ready
      component.setDataReady(false)
      component.init()

      // Should be pending render when data not ready
      expect(component.pendingInitialRender).toBe(true)
      expect(component.renderCalled).toBe(false)

      // Now simulate data becoming available
      component.setDataReady(true)
      // Force render by directly manipulating state and calling performInitialRender
      component.pendingInitialRender = false
      const renderSpy = vi.spyOn(component, 'performInitialRender')
      component.performInitialRender()

      // Should render when data is ready
      expect(component.pendingInitialRender).toBe(false)
      expect(component.renderCalled).toBe(true)
      expect(renderSpy).toHaveBeenCalled()
    })

    it('should render immediately in uiInit() when data is ready', () => {
      // Create a test UI component with ready data
      class TestUIComponent extends UIComponentBase {
        constructor(eventBus) {
          super(eventBus)
          this.renderCalled = false
        }

        performInitialRender() {
          this.renderCalled = true
        }
      }

      const component = new TestUIComponent(eventBus)

      // Initialize with default hasRequiredData() returning true
      component.init()

      // Should render immediately when data is ready
      expect(component.pendingInitialRender).toBe(false)
      expect(component.renderCalled).toBe(true)
    })

    it('should work correctly when uiInit() is not overridden by subclass', () => {
      // Create a basic UI component without overriding uiInit()
      class TestUIComponent extends UIComponentBase {
        constructor(eventBus) {
          super(eventBus)
          this.onInitCalled = false
          this.renderCalled = false
        }

        onInit() {
          this.onInitCalled = true
        }

        performInitialRender() {
          this.renderCalled = true
        }
      }

      const component = new TestUIComponent(eventBus)

      // Initialize the component
      component.init()

      // Should use UIComponentBase's uiInit() method
      expect(component.renderCalled).toBe(true)
      expect(component.pendingInitialRender).toBe(false)
      expect(component.onInitCalled).toBe(true)
    })
  })

  describe('Backward Compatibility', () => {
    it('should maintain backward compatibility with existing onInit() overrides', () => {
      // Create a test component that only overrides onInit() (old pattern)
      class OldStyleComponent extends UIComponentBase {
        constructor(eventBus) {
          super(eventBus)
          this.onInitCalled = false
          this.renderCalled = false
        }

        onInit() {
          this.onInitCalled = true
        }

        performInitialRender() {
          this.renderCalled = true
        }
      }

      const component = new OldStyleComponent(eventBus)

      // Initialize the component
      component.init()

      // Both should work: uiInit() from UIComponentBase and onInit() from subclass
      expect(component.renderCalled).toBe(true) // From uiInit()
      expect(component.onInitCalled).toBe(true)  // From subclass
    })
  })
})