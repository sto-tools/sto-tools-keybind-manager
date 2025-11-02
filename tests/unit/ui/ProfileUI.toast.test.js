import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import ProfileUI from '../../../src/js/components/ui/ProfileUI.js'
import { createUIComponentFixture } from '../../fixtures/ui/component.js'

describe('ProfileUI Toast Tests', () => {
  let fixture, component, showToastSpy

  beforeEach(() => {
    fixture = createUIComponentFixture(ProfileUI, {
      constructorArgs: {
        ui: null,
        modalManager: null,
        confirmDialog: null
      },
      i18n: {
        t: vi.fn((key) => {
          if (key === 'no_profile_selected_to_clone') return 'No profile selected to clone'
          if (key === 'no_profile_selected_to_rename') return 'No profile selected to rename'
          if (key === 'profile_name_required') return 'Profile name required'
          if (key === 'profile_renamed') return 'Profile renamed'
          if (key === 'no_profile_selected_to_delete') return 'No profile selected to delete'
          return key
        })
      },
      document: {
        getElementById: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
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
          querySelector: vi.fn(() => null),
          setAttribute: vi.fn(),
          removeAttribute: vi.fn(),
          closest: vi.fn(() => null),
          parentNode: null
        })),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
          querySelectorAll: vi.fn(() => []),
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
            querySelector: vi.fn(() => null),
            setAttribute: vi.fn(),
            removeAttribute: vi.fn(),
            closest: vi.fn(() => null),
            parentNode: null
          }))
        }
      },
      autoInit: false // Don't auto-init so we can set up spies
    })

    component = fixture.component

    // Set up spies BEFORE initializing
    showToastSpy = vi.spyOn(component, 'showToast')

    // Mock modal manager
    component.modalManager = {
      show: vi.fn(),
      hide: vi.fn()
    }

    // Mock getFormData method that ProfileUI uses
    component.getFormData = vi.fn(() => ({ name: '' }))

    // Now initialize the component
    component.init()
  })

  afterEach(() => {
    if (component && component.destroy) {
      component.destroy()
    }
    vi.restoreAllMocks()
  })

  describe('profile operations with toast notifications', () => {
    it('should show warning toast when trying to clone without profile selected', () => {
      // Set cache to no profile
      component.cache.profile = null

      // Call showCloneProfileModal method
      component.showCloneProfileModal()

      // Should show warning toast
      expect(showToastSpy).toHaveBeenCalledWith(
        'No profile selected to clone',
        'warning'
      )
    })

    it('should show warning toast when trying to rename without profile selected', () => {
      // Set cache to no profile
      component.cache.profile = null

      // Call showRenameProfileModal method
      component.showRenameProfileModal()

      // Should show warning toast
      expect(showToastSpy).toHaveBeenCalledWith(
        'No profile selected to rename',
        'warning'
      )
    })

    it('should show warning toast when trying to delete without profile selected', () => {
      // Set cache to no profile
      component.cache.profile = null

      // Call confirmDeleteProfile method
      component.confirmDeleteProfile()

      // Should show warning toast
      expect(showToastSpy).toHaveBeenCalledWith(
        'No profile selected to delete',
        'warning'
      )
    })

    it('should show error toast when profile name is required but empty', async () => {
      // Mock DOM element with empty value
      const mockNameInput = { value: '' }
      component.document.getElementById = vi.fn((id) => {
        if (id === 'profileName') return mockNameInput
        return null
      })

      // Mock confirmDialog to always return true
      component.confirmDialog = {
        confirm: vi.fn(() => Promise.resolve(true))
      }

      // Mock successful profile creation
      fixture.mockResponse('profile:create', async () => ({
        success: true,
        message: 'Profile created successfully'
      }))

      // Set currentModal to create and call handleProfileSave
      component.currentModal = 'create'
      await component.handleProfileSave()

      // Should show error toast
      expect(showToastSpy).toHaveBeenCalledWith(
        'Profile name required',
        'error'
      )
    })

    it('should verify toast calls exist in ProfileUI methods', () => {
      // Test that the component has the _t helper method
      expect(typeof component._t).toBe('function')

      // Test that it has showToast method
      expect(typeof component.showToast).toBe('function')

      // Test a translation
      const result = component._t('profile_name_required')
      expect(result).toBe('Profile name required')
    })
  })

  describe('UIComponentBase integration', () => {
    it('should inherit showToast method from UIComponentBase', () => {
      expect(typeof component.showToast).toBe('function')
    })

    it('should have i18n dependency injected', () => {
      expect(component.i18n).toBeDefined()
      expect(typeof component.i18n.t).toBe('function')
    })

    it('should use translation helper method', () => {
      // ProfileUI has a _t helper method that uses this.i18n.t
      expect(typeof component._t).toBe('function')

      // Test the helper method
      const result = component._t('profile_name_required')
      expect(result).toBe('Profile name required')
    })
  })

  describe('toast integration verification', () => {
    it('should have showToast method available from UIComponentBase', () => {
      // Verify that the component has the showToast method
      expect(typeof component.showToast).toBe('function')
    })
  })
})