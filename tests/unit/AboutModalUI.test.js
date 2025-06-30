import { describe, it, expect, beforeEach, vi } from 'vitest'
import AboutModalUI from '../../src/js/components/ui/AboutModalUI.js'
import eventBus from '../../src/js/core/eventBus.js'

describe('AboutModalUI', () => {
  let aboutModalUI
  let mockDocument

  beforeEach(() => {
    // Create mock document with aboutVersion element
    mockDocument = {
      getElementById: vi.fn((id) => {
        if (id === 'aboutVersion') {
          return { textContent: '' }
        }
        return null
      })
    }

    aboutModalUI = new AboutModalUI({ 
      eventBus, 
      document: mockDocument 
    })
  })

  describe('initialization', () => {
    it('should initialize with correct component name', () => {
      expect(aboutModalUI.componentName).toBe('AboutModalUI')
    })

    it('should populate about content on init', () => {
      aboutModalUI.onInit()
      
      expect(mockDocument.getElementById).toHaveBeenCalledWith('aboutVersion')
    })
  })

  describe('event handling', () => {
    it('should listen for about:show event', () => {
      const spy = vi.spyOn(aboutModalUI, 'showAboutModal')
      aboutModalUI.onInit()
      
      eventBus.emit('about:show')
      
      expect(spy).toHaveBeenCalled()
    })

    it('should listen for modal:regenerated event for aboutModal', () => {
      const spy = vi.spyOn(aboutModalUI, 'populateAboutContent')
      aboutModalUI.onInit()
      
      eventBus.emit('modal:regenerated', { modalId: 'aboutModal' })
      
      expect(spy).toHaveBeenCalled()
    })

    it('should not respond to modal:regenerated for other modals', () => {
      aboutModalUI.onInit()
      const spy = vi.spyOn(aboutModalUI, 'populateAboutContent')
      
      eventBus.emit('modal:regenerated', { modalId: 'otherModal' })
      
      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('modal display', () => {
    it('should emit modal:show event when showing about modal', () => {
      const spy = vi.spyOn(eventBus, 'emit')
      aboutModalUI.onInit()
      
      aboutModalUI.showAboutModal()
      
      expect(spy).toHaveBeenCalledWith('modal:show', { modalId: 'aboutModal' })
    })

    it('should populate content before showing modal', () => {
      const spy = vi.spyOn(aboutModalUI, 'populateAboutContent')
      aboutModalUI.onInit()
      
      aboutModalUI.showAboutModal()
      
      expect(spy).toHaveBeenCalled()
    })
  })

  describe('content population', () => {
    it('should set version text when aboutVersion element exists', () => {
      const versionElement = { textContent: '' }
      mockDocument.getElementById.mockReturnValue(versionElement)
      
      aboutModalUI.populateAboutContent()
      
      expect(versionElement.textContent).toMatch(/v\d+\.\d+\.\d+/)
    })

    it('should handle missing aboutVersion element gracefully', () => {
      mockDocument.getElementById.mockReturnValue(null)
      
      expect(() => aboutModalUI.populateAboutContent()).not.toThrow()
    })
  })
}) 