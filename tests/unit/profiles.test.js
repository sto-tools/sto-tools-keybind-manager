/**
 * STO Tools Keybind Manager - Profile Management Tests
 * Tests for STOProfileManager class functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import eventBus from '../../src/js/eventBus.js'
import STOStorage from '../../src/js/storage.js'

describe('STOProfileManager', () => {
  let profileManager
  let mockApp
  let mockStorage
  let mockUI

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
      <div class="dropdown">
        <button id="settingsBtn"></button>
      </div>
      <button id="importKeybindsBtn"></button>
      <button id="resetAppBtn"></button>
      <button id="aboutBtn"></button>
      <input id="fileInput">
      <div id="profileModal">
        <h3 id="profileModalTitle"></h3>
        <input id="profileName" placeholder="Profile name">
        <textarea id="profileDescription" placeholder="Description"></textarea>
      </div>
      <div id="aboutModal"></div>
    `

    // Create real storage instance
    mockStorage = new STOStorage()

    // Mock app object with necessary methods
    mockApp = {
      currentProfile: 'default',
      currentEnvironment: 'space',
      generateProfileId: vi.fn((name) =>
        name.toLowerCase().replace(/[^a-z0-9]/g, '_')
      ),
      generateCommandId: vi.fn(() => 'cmd_' + Date.now()),
      getCurrentProfile: vi.fn(() => ({
        name: 'Test Profile',
        description: 'Test Description',
        mode: 'space',
        keys: { Space: [{ command: 'test', type: 'test' }] },
        aliases: {},
      })),
      switchProfile: vi.fn(),
      renderProfiles: vi.fn(),
      setModified: vi.fn(),
      deleteProfile: vi.fn(() => true),
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

    // Setup global objects
    global.app = mockApp
    global.stoStorage = mockStorage
    global.stoUI = mockUI

    // Load the profiles module as ES module and instantiate
    const { default: STOProfileManager } = await import(
      '../../src/js/profiles.js'
    )
    profileManager = new STOProfileManager()
    profileManager.init()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    delete global.app
    delete global.stoStorage
    delete global.stoUI
    delete global.modalManager
  })

  describe('Initialization and setup', () => {
    it('should initialize with null currentModal', () => {
      expect(profileManager.currentModal).toBeNull()
    })

    it('should setup event listeners on init', () => {
      const profileSelect = document.getElementById('profileSelect')
      const newProfileBtn = document.getElementById('newProfileBtn')

      expect(profileSelect).toBeTruthy()
      expect(newProfileBtn).toBeTruthy()

      // Test that event listeners are attached by triggering events
      newProfileBtn.click()
      expect(modalManager.show).toHaveBeenCalledWith('profileModal')
    })

    it('should handle missing DOM elements gracefully', () => {
      document.body.innerHTML = ''
      const newManager = new (class extends profileManager.constructor {})()

      expect(() => newManager.init()).not.toThrow()
    })
  })

  describe('Profile modal management', () => {
    it('should show new profile modal with correct setup', () => {
      profileManager.showNewProfileModal()

      expect(modalManager.show).toHaveBeenCalledWith('profileModal')
      expect(profileManager.currentModal).toBe('new')

      const title = document.getElementById('profileModalTitle')
      const nameInput = document.getElementById('profileName')

      expect(title.textContent).toBe('New Profile')
      expect(nameInput.value).toBe('')
      expect(nameInput.placeholder).toBe('Enter profile name')
    })

    it('should show clone profile modal with current profile data', () => {
      profileManager.showCloneProfileModal()

      expect(modalManager.show).toHaveBeenCalledWith('profileModal')
      expect(profileManager.currentModal).toBe('clone')

      const title = document.getElementById('profileModalTitle')
      const nameInput = document.getElementById('profileName')
      const descInput = document.getElementById('profileDescription')

      expect(title.textContent).toBe('Clone Profile')
      expect(nameInput.value).toBe('Test Profile Copy')
      expect(descInput.value).toBe('Copy of Test Profile')
    })

    it('should show rename profile modal with existing data', () => {
      profileManager.showRenameProfileModal()

      expect(modalManager.show).toHaveBeenCalledWith('profileModal')
      expect(profileManager.currentModal).toBe('rename')

      const title = document.getElementById('profileModalTitle')
      const nameInput = document.getElementById('profileName')

      expect(title.textContent).toBe('Rename Profile')
      expect(nameInput.value).toBe('Test Profile')
    })

    it('should handle missing current profile for clone', () => {
      mockApp.getCurrentProfile.mockReturnValue(null)

      profileManager.showCloneProfileModal()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'No profile selected to clone',
        'warning'
      )
      expect(modalManager.show).not.toHaveBeenCalled()
    })

    it('should handle missing current profile for rename', () => {
      mockApp.getCurrentProfile.mockReturnValue(null)

      profileManager.showRenameProfileModal()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'No profile selected to rename',
        'warning'
      )
      expect(modalManager.show).not.toHaveBeenCalled()
    })
  })

  describe('Profile save validation', () => {
    beforeEach(() => {
      profileManager.currentModal = 'new'
    })

    it('should validate required profile name', () => {
      const nameInput = document.getElementById('profileName')
      nameInput.value = ''

      profileManager.handleProfileSave()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Profile name is required',
        'error'
      )
      expect(mockUI.hideModal).not.toHaveBeenCalled()
    })

    it('should validate profile name length', () => {
      const nameInput = document.getElementById('profileName')
      nameInput.value = 'a'.repeat(51) // 51 characters

      profileManager.handleProfileSave()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Profile name is too long (max 50 characters)',
        'error'
      )
      expect(mockUI.hideModal).not.toHaveBeenCalled()
    })

    it('should prevent duplicate profile names for new profiles', () => {
      // Setup existing profile in storage
      mockStorage.saveProfile('existing', { name: 'Existing Profile' })

      // Mock getAllData to return the profile we just saved
      vi.spyOn(mockStorage, 'getAllData').mockReturnValue({
        profiles: {
          existing: { name: 'Existing Profile' },
        },
      })

      const nameInput = document.getElementById('profileName')
      nameInput.value = 'Existing Profile'

      profileManager.handleProfileSave()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'A profile with this name already exists',
        'error'
      )
      expect(mockUI.hideModal).not.toHaveBeenCalled()
    })

    it('should allow same name when renaming current profile', () => {
      profileManager.currentModal = 'rename'
      mockApp.getCurrentProfile.mockReturnValue({ name: 'Current Profile' })

      const nameInput = document.getElementById('profileName')
      nameInput.value = 'Current Profile'

      profileManager.handleProfileSave()

      expect(mockUI.showToast).not.toHaveBeenCalledWith(
        expect.stringContaining('already exists'),
        'error'
      )
    })

    it('should handle save errors gracefully', () => {
      const nameInput = document.getElementById('profileName')
      nameInput.value = 'Valid Name'

      // Mock profile creation to throw error
      vi.spyOn(profileManager, 'createNewProfile').mockImplementation(() => {
        throw new Error('Save failed')
      })

      profileManager.handleProfileSave()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Failed to save profile: Save failed',
        'error'
      )
      expect(mockUI.hideModal).not.toHaveBeenCalled()
    })
  })

  describe('Profile creation operations', () => {
    it('should create new profile with default structure', () => {
      const name = 'New Test Profile'
      const description = 'Test description'

      profileManager.createNewProfile(name, description)

      expect(mockApp.generateProfileId).toHaveBeenCalledWith(name)
      expect(mockApp.switchProfile).toHaveBeenCalled()
      expect(mockApp.renderProfiles).toHaveBeenCalled()
      expect(mockUI.showToast).toHaveBeenCalledWith(
        `Profile "${name}" created`,
        'success'
      )
    })

    it('should clone current profile with all data', () => {
      const name = 'Cloned Profile'
      const description = 'Cloned description'

      profileManager.cloneCurrentProfile(name, description)

      expect(mockApp.generateProfileId).toHaveBeenCalledWith(name)
      expect(mockApp.switchProfile).toHaveBeenCalled()
      expect(mockApp.renderProfiles).toHaveBeenCalled()
      expect(mockUI.showToast).toHaveBeenCalledWith(
        `Profile "${name}" created from "Test Profile"`,
        'success'
      )
    })

    it('should rename current profile', () => {
      const name = 'Renamed Profile'
      const description = 'New description'

      profileManager.renameCurrentProfile(name, description)

      expect(mockApp.renderProfiles).toHaveBeenCalled()
      expect(mockApp.setModified).toHaveBeenCalledWith(true)
      expect(mockUI.showToast).toHaveBeenCalledWith(
        `Profile renamed from "Test Profile" to "${name}"`,
        'success'
      )
    })

    it('should handle clone error when no current profile', () => {
      mockApp.getCurrentProfile.mockReturnValue(null)

      expect(() => {
        profileManager.cloneCurrentProfile('Test', 'Test')
      }).toThrow('No profile to clone')
    })

    it('should handle rename error when no current profile', () => {
      mockApp.getCurrentProfile.mockReturnValue(null)

      expect(() => {
        profileManager.renameCurrentProfile('Test', 'Test')
      }).toThrow('No profile to rename')
    })
  })

  describe('Profile deletion', () => {
    it('should confirm before deleting profile', async () => {
      // Mock multiple profiles so deletion is allowed
      mockStorage.getAllData = vi.fn(() => ({
        profiles: {
          profile1: { name: 'Profile 1' },
          profile2: { name: 'Profile 2' },
        },
      }))

      await profileManager.confirmDeleteProfile()

      expect(mockUI.confirm).toHaveBeenCalledWith(
        expect.stringContaining(
          'Are you sure you want to delete the profile "Test Profile"?'
        ),
        'Delete Profile',
        'danger'
      )
    })

    it('should prevent deletion of last profile', async () => {
      // Mock only one profile exists
      mockStorage.getAllData = vi.fn(() => ({
        profiles: { only_profile: { name: 'Only Profile' } },
      }))

      await profileManager.confirmDeleteProfile()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Cannot delete the last profile',
        'warning'
      )
      expect(mockUI.confirm).not.toHaveBeenCalled()
    })

    it('should handle missing current profile for deletion', async () => {
      mockApp.getCurrentProfile.mockReturnValue(null)

      await profileManager.confirmDeleteProfile()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'No profile selected to delete',
        'warning'
      )
      expect(mockUI.confirm).not.toHaveBeenCalled()
    })

    it('should delete current profile when confirmed', async () => {
      // Mock multiple profiles so deletion is allowed
      mockStorage.getAllData = vi.fn(() => ({
        profiles: {
          profile1: { name: 'Profile 1' },
          profile2: { name: 'Profile 2' },
        },
      }))

      mockUI.confirm.mockResolvedValue(true)

      await profileManager.confirmDeleteProfile()

      expect(mockApp.deleteProfile).toHaveBeenCalledWith(mockApp.currentProfile)
      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Profile "Test Profile" deleted',
        'success'
      )
    })

    it('should handle deletion failure', () => {
      mockApp.deleteProfile.mockReturnValue(false)

      profileManager.deleteCurrentProfile()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Failed to delete profile',
        'error'
      )
    })
  })

  describe('Settings menu management', () => {
    it('should toggle settings dropdown menu', () => {
      const settingsBtn = document.getElementById('settingsBtn')
      const dropdown = settingsBtn.closest('.dropdown')

      profileManager.toggleSettingsMenu()
      expect(dropdown.classList.contains('active')).toBe(true)

      profileManager.toggleSettingsMenu()
      expect(dropdown.classList.contains('active')).toBe(false)
    })

    it('should close settings menu', () => {
      const settingsBtn = document.getElementById('settingsBtn')
      const dropdown = settingsBtn.closest('.dropdown')
      dropdown.classList.add('active')

      profileManager.closeSettingsMenu()
      expect(dropdown.classList.contains('active')).toBe(false)
    })

    it('should handle missing settings elements gracefully', () => {
      document.getElementById('settingsBtn').remove()

      // The actual implementation should handle null gracefully, but our test needs to be realistic
      // Since the button is removed, the methods will encounter null - let's test they handle it
      expect(() => profileManager.toggleSettingsMenu()).not.toThrow()
      expect(() => profileManager.closeSettingsMenu()).not.toThrow()
    })
  })

  describe('Import and reset operations', () => {
    it('should trigger keybind file import', () => {
      const fileInput = document.getElementById('fileInput')
      const clickSpy = vi.spyOn(fileInput, 'click')

      profileManager.importKeybinds()

      expect(fileInput.accept).toBe('.txt')
      expect(clickSpy).toHaveBeenCalled()
    })

    it('should confirm before resetting application', async () => {
      await profileManager.confirmResetApp()

      expect(mockUI.confirm).toHaveBeenCalledWith(
        expect.stringContaining(
          'Are you sure you want to reset the application?'
        ),
        'Reset Application',
        'danger'
      )
    })

    it('should reset application when confirmed', async () => {
      mockUI.confirm.mockResolvedValue(true)

      // Mock the resetApplication method instead of window.location.reload
      const resetSpy = vi
        .spyOn(profileManager, 'resetApplication')
        .mockImplementation(() => {
          // Mock the clearAllData call
          mockStorage.clearAllData()
        })

      await profileManager.confirmResetApp()

      expect(resetSpy).toHaveBeenCalled()

      resetSpy.mockRestore()
    })

    it('should handle reset errors', () => {
      mockStorage.clearAllData = vi.fn(() => {
        throw new Error('Clear failed')
      })

      profileManager.resetApplication()

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Failed to reset application: Clear failed',
        'error'
      )
    })
  })

  describe('Profile analysis', () => {
    it('should analyze profile statistics correctly', () => {
      const testProfile = {
        keys: {
          Space: [
            { command: 'FireAll', type: 'combat' },
            { command: 'target_nearest_enemy', type: 'targeting' },
          ],
          F1: [{ command: 'target_self', type: 'targeting' }],
          'Ctrl+A': [{ command: 'test', type: 'power' }],
        },
        aliases: {
          TestAlias: { name: 'TestAlias' },
        },
      }

      const analysis = profileManager.getProfileAnalysis(testProfile)

      expect(analysis.keyCount).toBe(3)
      expect(analysis.commandCount).toBe(4)
      expect(analysis.aliasCount).toBe(1)
      expect(analysis.commandTypes.combat).toBe(1)
      expect(analysis.commandTypes.targeting).toBe(2)
      expect(analysis.commandTypes.power).toBe(1)
    })

    it('should categorize key types correctly', () => {
      const testProfile = {
        keys: {
          F1: [{ command: 'test', type: 'test' }],
          A: [{ command: 'test', type: 'test' }],
          1: [{ command: 'test', type: 'test' }],
          'Ctrl+Space': [{ command: 'test', type: 'test' }],
          Tab: [{ command: 'test', type: 'test' }],
        },
        aliases: {},
      }

      const analysis = profileManager.getProfileAnalysis(testProfile)

      expect(analysis.keyTypes.function).toBe(1) // F1
      expect(analysis.keyTypes.letter).toBe(1) // A
      expect(analysis.keyTypes.number).toBe(1) // 1
      expect(analysis.keyTypes.modifier).toBe(1) // Ctrl+Space
      expect(analysis.keyTypes.special).toBe(1) // Tab
    })

    it('should determine profile complexity correctly', () => {
      const simpleProfile = { keys: {}, aliases: {} }
      const moderateProfile = {
        keys: Object.fromEntries(
          Array(25)
            .fill()
            .map((_, i) => [`Key${i}`, [{ command: 'test', type: 'test' }]])
        ),
        aliases: {},
      }
      const complexProfile = {
        keys: Object.fromEntries(
          Array(60)
            .fill()
            .map((_, i) => [`Key${i}`, [{ command: 'test', type: 'test' }]])
        ),
        aliases: {},
      }

      expect(profileManager.getProfileAnalysis(simpleProfile).complexity).toBe(
        'Simple'
      )
      expect(
        profileManager.getProfileAnalysis(moderateProfile).complexity
      ).toBe('Moderate')
      expect(profileManager.getProfileAnalysis(complexProfile).complexity).toBe(
        'Complex'
      )
    })

    it('should generate helpful recommendations', () => {
      const basicProfile = { keys: {}, aliases: {} }
      const analysis = profileManager.getProfileAnalysis(basicProfile)

      expect(analysis.recommendations).toBeInstanceOf(Array)
      expect(analysis.recommendations.length).toBeGreaterThan(0)

      const combatRec = analysis.recommendations.find((r) => r.type === 'setup')
      expect(combatRec).toBeTruthy()
      expect(combatRec.title).toContain('Combat')
    })
  })

  describe('Profile templates', () => {
    it('should provide predefined profile templates', () => {
      const templates = profileManager.getProfileTemplates()

      expect(templates).toBeInstanceOf(Object)
      expect(templates.basic_space).toBeTruthy()
      expect(templates.advanced_tactical).toBeTruthy()
      expect(templates.ground_combat).toBeTruthy()

      expect(templates.basic_space.name).toBe('Basic Space Combat')
      expect(templates.basic_space.mode).toBe('space')
      expect(templates.basic_space.keys).toBeInstanceOf(Object)
    })

    it('should create profile from template', () => {
      profileManager.createProfileFromTemplate('basic_space')

      expect(mockApp.generateProfileId).toHaveBeenCalledWith(
        'Basic Space Combat'
      )
      expect(mockApp.switchProfile).toHaveBeenCalled()
      expect(mockApp.renderProfiles).toHaveBeenCalled()
      expect(mockUI.showToast).toHaveBeenCalledWith(
        expect.stringContaining('created from template'),
        'success'
      )
    })

    it('should handle duplicate template names', () => {
      // Mock existing profile with same name
      mockStorage.getAllData = vi.fn(() => ({
        profiles: { existing: { name: 'Basic Space Combat' } },
      }))

      profileManager.createProfileFromTemplate('basic_space')

      expect(mockApp.generateProfileId).toHaveBeenCalledWith(
        'Basic Space Combat 1'
      )
    })

    it('should handle invalid template ID', () => {
      profileManager.createProfileFromTemplate('nonexistent_template')

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Template not found',
        'error'
      )
      expect(mockApp.switchProfile).not.toHaveBeenCalled()
    })
  })

  describe('Profile export and import', () => {
    it('should export profile as JSON', () => {
      const testProfile = {
        name: 'Test Profile',
        keys: { Space: [{ command: 'test', type: 'test' }] },
        aliases: {},
      }
      mockStorage.getProfile = vi.fn(() => testProfile)

      // Mock URL and DOM methods
      global.URL.createObjectURL = vi.fn(() => 'blob:test')
      global.URL.revokeObjectURL = vi.fn()
      const mockClick = vi.fn()
      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        download: '',
        click: mockClick,
      })

      profileManager.exportProfile('test_profile')

      expect(mockStorage.getProfile).toHaveBeenCalledWith('test_profile')
      expect(mockClick).toHaveBeenCalled()
      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Profile "Test Profile" exported',
        'success'
      )
    })

    it('should handle export of missing profile', () => {
      mockStorage.getProfile = vi.fn(() => null)

      profileManager.exportProfile('nonexistent')

      expect(mockUI.showToast).toHaveBeenCalledWith(
        'Profile not found',
        'error'
      )
    })

    it('should import valid profile JSON', async () => {
      const validJson = JSON.stringify({
        version: '1.0.0',
        profile: {
          name: 'Imported Profile',
          keys: { Space: [{ command: 'test', type: 'test' }] },
          aliases: {},
        },
      })

      const result = await profileManager.importProfile(validJson)

      expect(result).toBe(true)
      expect(mockApp.renderProfiles).toHaveBeenCalled()
      expect(mockUI.showToast).toHaveBeenCalledWith(
        expect.stringContaining('imported successfully'),
        'success'
      )
    })

    it('should handle duplicate names during import', async () => {
      mockStorage.getAllData = vi.fn(() => ({
        profiles: { existing: { name: 'Imported Profile' } },
      }))

      const validJson = JSON.stringify({
        profile: {
          name: 'Imported Profile',
          keys: {},
          aliases: {},
        },
      })

      await profileManager.importProfile(validJson)

      expect(mockUI.showToast).toHaveBeenCalledWith(
        expect.stringContaining('Imported Profile (1)'),
        'success'
      )
    })

    it('should handle invalid JSON during import', async () => {
      const result = await profileManager.importProfile('invalid json')

      expect(result).toBe(false)
      expect(mockUI.showToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import profile'),
        'error'
      )
    })

    it('should validate imported profile structure', async () => {
      const invalidJson = JSON.stringify({
        version: '1.0.0',
        // Missing profile property
      })

      const result = await profileManager.importProfile(invalidJson)

      expect(result).toBe(false)
      expect(mockUI.showToast).toHaveBeenCalledWith(
        expect.stringContaining('Invalid profile file format'),
        'error'
      )
    })
  })
})
