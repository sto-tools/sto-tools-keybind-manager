/**
 * STO Tools Keybind Manager - Profile Management Tests
 * Tests for ProfileService and ProfileUI class functionality (Simplified)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import eventBus from '../../src/js/core/eventBus.js'
import STOStorage from '../../src/js/services/storage.js'
import ProfileService from '../../src/js/components/services/ProfileService.js'
import ProfileUI from '../../src/js/components/ui/ProfileUI.js'

describe('ProfileService and ProfileUI - Core Tests', () => {
  let profileService
  let profileUI
  let mockApp
  let mockStorage
  let mockUI
  let mockI18n

  beforeEach(async () => {
    // Reset localStorage
    localStorage.clear()

    // Set up global environment
    global.window = global.window || {}

    // Import real modules
    const { STO_DATA } = await import('../../src/js/data.js')

    // Setup DOM elements needed for tests
    document.body.innerHTML = `
      <select id="profileSelect"></select>
      <button id="newProfileBtn"></button>
      <button id="cloneProfileBtn"></button>
      <button id="renameProfileBtn"></button>
      <button id="deleteProfileBtn"></button>
      <button id="saveProfileBtn"></button>
      <button id="syncNowBtn"></button>
      <input id="fileInput">
      <div id="profileModal">
        <h3 id="profileModalTitle"></h3>
        <input id="profileName" placeholder="Profile name">
        <textarea id="profileDescription" placeholder="Description"></textarea>
      </div>
    `

    // Create real storage instance
    mockStorage = new STOStorage()

    // Mock i18n object
    mockI18n = {
      t: vi.fn((key, options) => {
        const translations = {
          'new_profile': 'New Profile',
          'clone_profile': 'Clone Profile', 
          'rename_profile': 'Rename Profile',
          'profile_created': 'Profile "{{name}}" created',
          'failed_to_create_profile': 'Failed to create profile',
          'profile_name_required': 'Profile name is required'
        }
        let result = translations[key] || key
        if (options) {
          Object.keys(options).forEach(optKey => {
            result = result.replace(`{{${optKey}}}`, options[optKey])
          })
        }
        return result
      })
    }

    // Mock UI object
    mockUI = {
      showModal: vi.fn(),
      hideModal: vi.fn(),
      showToast: vi.fn(),
      confirm: vi.fn(() => Promise.resolve(true)),
    }

    global.modalManager = {
      show: vi.fn(),
      hide: vi.fn(),
    }

    global.stoSync = {
      setSyncFolder: vi.fn(),
      syncProject: vi.fn(),
    }

    // Setup global objects
    global.stoStorage = mockStorage
    global.stoUI = mockUI

    // Create ProfileService and ProfileUI instances
    profileService = new ProfileService({
      storage: mockStorage,
      eventBus,
      i18n: mockI18n
    })

    profileUI = new ProfileUI({
      service: profileService,
      eventBus,
      ui: mockUI,
      modalManager: global.modalManager,
      document: global.document
    })
    
    profileUI.init()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    delete global.stoStorage
    delete global.stoUI
    delete global.modalManager
    delete global.stoSync
  })

  describe('ProfileService', () => {
    it('should initialize with correct properties', () => {
      expect(profileService.storage).toBe(mockStorage)
      expect(profileService.i18n).toBe(mockI18n)
      expect(profileService.currentProfile).toBeNull()
      expect(profileService.currentEnvironment).toBe('space')
    })

    it('should load data from storage', async () => {
      // Setup test data - create a profile first
      const createResult = profileService.createProfile('Test Profile', 'Test Description', 'ground')
      
      // Switch to the created profile so it becomes current
      profileService.switchProfile(createResult.profileId)
      
      // Now load the data
      const result = await profileService.loadData()

      expect(result.currentProfile).toBe(createResult.profileId)
      expect(result.currentEnvironment).toBe('ground')
      expect(profileService.currentProfile).toBe(createResult.profileId)
      expect(profileService.currentEnvironment).toBe('ground')
    })

    it('should create new profile', () => {
      const result = profileService.createProfile('New Profile', 'Test description', 'space')

      expect(result.success).toBe(true)
      expect(result.profileId).toBe('new_profile')
      expect(result.profile.name).toBe('New Profile')
      expect(result.profile.description).toBe('Test description')
      expect(result.profile.currentEnvironment).toBe('space')
    })

    it('should switch between profiles', () => {
      // Create two profiles
      const profile1 = profileService.createProfile('Profile 1', 'First profile')
      const profile2 = profileService.createProfile('Profile 2', 'Second profile')

      // Switch to first profile
      const result = profileService.switchProfile(profile1.profileId)
      expect(result.success).toBe(true)
      expect(result.switched).toBe(true)
      expect(profileService.currentProfile).toBe(profile1.profileId)
    })

    it('should handle cloning profiles', () => {
      // Create source profile
      const sourceResult = profileService.createProfile('Source Profile', 'Original')
      profileService.switchProfile(sourceResult.profileId)

      // Clone the profile
      const cloneResult = profileService.cloneProfile(sourceResult.profileId, 'Cloned Profile')
      
      expect(cloneResult.success).toBe(true)
      expect(cloneResult.profileId).toBe('cloned_profile')
      expect(cloneResult.profile.name).toBe('Cloned Profile')
    })
  })

  describe('ProfileUI', () => {
    it('should initialize with null currentModal', () => {
      expect(profileUI.currentModal).toBeNull()
    })

    it('should setup event listeners on init', () => {
      const profileSelect = document.getElementById('profileSelect')
      const newProfileBtn = document.getElementById('newProfileBtn')

      expect(profileSelect).toBeTruthy()
      expect(newProfileBtn).toBeTruthy()

      // Test that profile-specific event listeners are attached by triggering events
      newProfileBtn.click()
      expect(global.modalManager.show).toHaveBeenCalledWith('profileModal')

      // Note: Global UI event listeners (like syncNowBtn) are now handled by main app eventHandlers,
      // not by ProfileUI. ProfileUI only handles profile-specific events.
    })

    it('should handle missing DOM elements gracefully', () => {
      document.body.innerHTML = ''
      const newUI = new ProfileUI({
        service: profileService,
        eventBus,
        ui: mockUI,
        modalManager: global.modalManager,
        document: global.document
      })

      expect(() => newUI.init()).not.toThrow()
    })

    it('should show new profile modal with correct setup', () => {
      profileUI.showNewProfileModal()

      expect(global.modalManager.show).toHaveBeenCalledWith('profileModal')
      expect(profileUI.currentModal).toBe('new')

      const title = document.getElementById('profileModalTitle')
      const nameInput = document.getElementById('profileName')

      expect(title.textContent).toBe('New Profile')
      expect(nameInput.value).toBe('')
      expect(nameInput.placeholder).toBe('Enter profile name')
    })

    it('should show clone profile modal with current profile data', () => {
      // Create and switch to a profile for cloning
      const createResult = profileService.createProfile('Test Profile', 'Test Description')
      profileService.switchProfile(createResult.profileId)

      profileUI.showCloneProfileModal()

      expect(global.modalManager.show).toHaveBeenCalledWith('profileModal')
      expect(profileUI.currentModal).toBe('clone')

      const title = document.getElementById('profileModalTitle')
      const nameInput = document.getElementById('profileName')
      const descInput = document.getElementById('profileDescription')

      expect(title.textContent).toBe('Clone Profile')
      expect(nameInput.value).toBe('Test Profile Copy')
      expect(descInput.value).toBe('Copy of Test Profile')
    })

    it('should show rename profile modal with existing data', () => {
      // Create and switch to a profile for renaming
      const createResult = profileService.createProfile('Test Profile', 'Test Description')
      profileService.switchProfile(createResult.profileId)

      profileUI.showRenameProfileModal()

      expect(global.modalManager.show).toHaveBeenCalledWith('profileModal')
      expect(profileUI.currentModal).toBe('rename')

      const title = document.getElementById('profileModalTitle')
      const nameInput = document.getElementById('profileName')

      expect(title.textContent).toBe('Rename Profile')
      expect(nameInput.value).toBe('Test Profile')
    })
  })
}) 