import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock writeFile from SyncService (used by export.js)
vi.mock('../../src/js/components/services/SyncService.js', () => ({
  writeFile: vi.fn()
}))

import '../../src/js/data.js'
import { StorageService } from '../../src/js/components/services/index.js'
import STOKeybindFileManager from '../../src/js/features/keybinds.js'
import STOExportManager from '../../src/js/features/export.js'
import store, { resetStore } from '../../src/js/core/store.js'
import { writeFile } from '../../src/js/components/services/SyncService.js'

describe('Export Mirroring Integration', () => {
  let app, storageService, stoKeybinds, stoExport, stoUI

  beforeEach(() => {
    resetStore()
    // Clear localStorage
    localStorage.clear()

    // Mock UI methods that show actual modals/alerts
    const originalAlert = window.alert
    const originalConfirm = window.confirm
    const originalPrompt = window.prompt

    window.alert = vi.fn()
    window.confirm = vi.fn(() => true)
    window.prompt = vi.fn((message, defaultValue) => {
      if (message.includes('profile name')) return 'Export Test Profile'
      return defaultValue || 'test'
    })

    // Store originals for cleanup
    window._originalAlert = originalAlert
    window._originalConfirm = originalConfirm
    window._originalPrompt = originalPrompt

    // Mock file download functionality
    global.URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:test-url'),
      revokeObjectURL: vi.fn(),
    }
    global.Blob = vi.fn()
    const mockAnchor = {
      click: vi.fn(),
      href: '',
      download: '',
    }
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') return mockAnchor
      return document.createElement.wrappedMethod
        ? document.createElement.wrappedMethod(tagName)
        : {}
    })

    storageService = new StorageService()
    stoKeybinds = new STOKeybindFileManager()
    stoExport = new STOExportManager()
    stoUI = { showToast: vi.fn() }
    Object.assign(global, { storageService, stoKeybinds, stoExport, stoUI })

    // Create minimal app-like object for testing
    app = {
      currentProfile: 'test-profile',
      currentEnvironment: 'space',

      createProfile(name) {
        const profileId = `profile_${Date.now()}`
        const profile = {
          id: profileId,
          name: name,
          builds: {
            space: { keys: {} },
            ground: { keys: {} },
          },
          aliases: {},
          keybindMetadata: {},
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          currentEnvironment: 'space',
        }
        storageService.saveProfile(profileId, profile)
        this.currentProfile = profileId
        store.currentProfile = profileId
        store.currentEnvironment = 'space'
        return profileId
      },

      switchProfile(profileId) {
        this.currentProfile = profileId
        store.currentProfile = profileId
        const profile = storageService.getProfile(profileId)
        if (profile) {
          this.currentEnvironment = profile.currentEnvironment || 'space'
        }
        store.currentEnvironment = this.currentEnvironment
      },

      getCurrentProfile() {
        const profile = storageService.getProfile(this.currentProfile)
        if (!profile) return null

        // Return a profile-like object with current build data
        return {
          ...profile,
          keys: profile.builds[this.currentEnvironment].keys,
          aliases: profile.aliases || {},
          mode: this.currentEnvironment === 'space' ? 'Space' : 'Ground',
        }
      },

      saveCurrentProfile() {
        // For testing, just save the profile as-is
        const profile = storageService.getProfile(this.currentProfile)
        if (profile) {
          profile.lastModified = new Date().toISOString()
          storageService.saveProfile(this.currentProfile, profile)
        }
      },

      exportKeybinds() {
        const profile = this.getCurrentProfile()
        if (!profile) return

        // Check if stabilization is enabled
        const stabilizeCheckbox = document.getElementById(
          'stabilizeExecutionOrder'
        )
        const stabilizeExecutionOrder =
          stabilizeCheckbox && stabilizeCheckbox.checked

        // Use the export manager with stabilization options
        const options = { stabilizeExecutionOrder }
        const content = stoExport.generateSTOKeybindFile(profile, options)

        // Download the file
        const blob = new Blob([content], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        // Include environment in filename
        const safeName = profile.name.replace(/[^a-zA-Z0-9]/g, '_')
        const stabilizeFlag = stabilizeExecutionOrder ? '_stabilized' : ''
        a.download = `${safeName}_${this.currentEnvironment}${stabilizeFlag}_keybinds.txt`
        a.click()
        URL.revokeObjectURL(url)
      },

      setModified(modified) {
        // Mock method for import functionality
        this.modified = modified
      },

      renderKeyGrid() {
        // Mock method for import functionality
      },
    }

    // Set initial store state and global app reference
    store.currentProfile = app.currentProfile
    store.currentEnvironment = app.currentEnvironment
    global.app = app
  })

  afterEach(() => {
    // Restore original functions
    if (window._originalAlert) window.alert = window._originalAlert
    if (window._originalConfirm) window.confirm = window._originalConfirm
    if (window._originalPrompt) window.prompt = window._originalPrompt

    // Clean up mocks
    delete global.URL
    delete global.Blob
    vi.restoreAllMocks()

    // Clean up storage
    localStorage.clear()
    resetStore()
  })

  describe('mirrored command sequence export', () => {
    let testProfileId

    beforeEach(() => {
      // Create a test profile with mirrored commands
      testProfileId = app.createProfile('Mirroring Export Test')
      app.switchProfile(testProfileId)

      // Get the actual profile from storage to modify it
      const actualProfile = storageService.getProfile(testProfileId)

      // Add mirrored tray sequence
      actualProfile.builds.space.keys['F1'] = [
        { command: '+TrayExecByTray 9 0', type: 'tray' },
        { command: '+TrayExecByTray 9 1', type: 'tray' },
        { command: '+TrayExecByTray 9 2', type: 'tray' },
      ]

      // Add single command (should not be mirrored)
      actualProfile.builds.space.keys['F2'] = [
        { command: 'FirePhasers', type: 'ability' },
      ]

      // Add mixed command sequence
      actualProfile.builds.space.keys['F3'] = [
        { command: 'FirePhasers', type: 'ability' },
        { command: 'target_nearest_enemy', type: 'targeting' },
        { command: '+power_exec Distribute_Shields', type: 'power' },
      ]

      // Add complex tray sequence (like the documentation example)
      actualProfile.builds.space.keys['numpad0'] = []
      for (let i = 0; i <= 4; i++) {
        actualProfile.builds.space.keys['numpad0'].push({
          command: `+TrayExecByTray 9 ${i}`,
          type: 'tray',
        })
      }

      // Set up keybind metadata for stabilization (environment-scoped)
      actualProfile.keybindMetadata = {
        space: {
          F1: { stabilizeExecutionOrder: true },
          F3: { stabilizeExecutionOrder: true },
          numpad0: { stabilizeExecutionOrder: true },
          // F2 intentionally left without stabilization metadata
        }
      }

      // Save the modified profile back to storage
      storageService.saveProfile(testProfileId, actualProfile)
    })

    it('should export with global stabilization disabled but respect per-key metadata', () => {
      // Get the current profile
      const profile = app.getCurrentProfile()

      // Generate export content without global stabilization
      const exportContent = stoExport.generateSTOKeybindFile(profile, {
        stabilizeExecutionOrder: false,
        profile: profile,
        environment: 'space'
      })

      // Verify export content
      expect(exportContent).toBeDefined()
      expect(typeof exportContent).toBe('string')

      // Should not contain global stabilization header (since global option is false)
      expect(exportContent).not.toContain('EXECUTION ORDER STABILIZATION: ON')
      expect(exportContent).not.toContain(
        'Commands are mirrored to ensure consistent execution order'
      )

      // But keys with per-key metadata should still be mirrored
      expect(exportContent).toContain(
        'F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"'
      )
      expect(exportContent).toContain(
        'F3 "FirePhasers $$ target_nearest_enemy $$ +power_exec Distribute_Shields $$ target_nearest_enemy $$ FirePhasers"'
      )
      expect(exportContent).toContain(
        'numpad0 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 3 $$ +TrayExecByTray 9 4 $$ +TrayExecByTray 9 3 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"'
      )

      // Keys without per-key metadata should not be mirrored
      expect(exportContent).toContain('F2 "FirePhasers"')
      expect(exportContent).not.toContain('F2 "FirePhasers $$ FirePhasers"')
    })

    it('should export with stabilization enabled when option is set', () => {
      // Get the current profile
      const profile = app.getCurrentProfile()

      // Generate export content with stabilization
      const exportContent = stoExport.generateSTOKeybindFile(profile, {
        stabilizeExecutionOrder: true,
        profile: profile,
        environment: 'space'
      })

      // Verify export content
      expect(exportContent).toBeDefined()
      expect(typeof exportContent).toBe('string')

      // Should contain stabilization header
      expect(exportContent).toContain('EXECUTION ORDER STABILIZATION: ON')
      expect(exportContent).toContain(
        'Commands are mirrored to ensure consistent execution order'
      )
      expect(exportContent).toContain(
        'Phase 1: left-to-right, Phase 2: right-to-left'
      )

      // Should contain mirrored multi-command sequences
      expect(exportContent).toContain(
        'F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"'
      )
      expect(exportContent).toContain(
        'F3 "FirePhasers $$ target_nearest_enemy $$ +power_exec Distribute_Shields $$ target_nearest_enemy $$ FirePhasers"'
      )

      // Single commands should not be mirrored
      expect(exportContent).toContain('F2 "FirePhasers"')
      expect(exportContent).not.toContain('F2 "FirePhasers $$ FirePhasers"')

      // Complex sequence should be properly mirrored
      expect(exportContent).toContain(
        'numpad0 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 3 $$ +TrayExecByTray 9 4 $$ +TrayExecByTray 9 3 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"'
      )
    })

    it('should use app.exportKeybinds method with real file download', () => {
      // Mock the profile to have the test data
      const profile = app.getCurrentProfile()
      expect(profile).toBeDefined()
      expect(profile.builds.space.keys.F1).toBeDefined()

      // Mock document.getElementById to return a checked checkbox
      const originalGetElementById = document.getElementById
      document.getElementById = vi.fn((id) => {
        if (id === 'stabilizeExecutionOrder') {
          return { checked: true }
        }
        return originalGetElementById.call(document, id)
      })

      // Call the real app export method
      app.exportKeybinds()

      // Verify that Blob was created with content
      expect(global.Blob).toHaveBeenCalled()
      const blobCall = global.Blob.mock.calls[0]
      expect(blobCall).toBeDefined()
      expect(blobCall[0]).toBeDefined() // Content array
      expect(blobCall[1]).toEqual({ type: 'text/plain' }) // Options

      // Verify the content contains mirrored sequences
      const exportedContent = blobCall[0][0]
      expect(exportedContent).toContain('EXECUTION ORDER STABILIZATION: ON')
      expect(exportedContent).toContain(
        'F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"'
      )

      // Verify file download was triggered
      expect(global.URL.createObjectURL).toHaveBeenCalled()
      expect(document.createElement).toHaveBeenCalledWith('a')

      // Restore original function
      document.getElementById = originalGetElementById
    })

    it('should handle round-trip import/export of mirrored commands', () => {
      // Export with stabilization
      const profile = app.getCurrentProfile()
      const exportContent = stoExport.generateSTOKeybindFile(profile, {
        stabilizeExecutionOrder: true,
        profile: profile,
        environment: 'space'
      })

      // Create a new profile for import test
      const importProfileId = app.createProfile('Import Test Profile')
      app.switchProfile(importProfileId)

      // Mock document.getElementById to return mock UI elements
      const originalGetElementById = document.getElementById
      document.getElementById = vi.fn((id) => {
        if (id === 'importKeybinds') {
          return { value: exportContent }
        }
        if (id === 'importMode') {
          return { value: 'space' }
        }
        return originalGetElementById.call(document, id)
      })

      // Import the exported content
      const importResult = stoKeybinds.importKeybindFile(exportContent)

      expect(importResult.success).toBe(true)
      expect(importResult.imported.keys).toBeGreaterThan(0)

      // Verify that mirrored commands were detected and un-mirrored during import
      const importedProfile = app.getCurrentProfile()

      // Restore original function
      document.getElementById = originalGetElementById

      // F1 should have been detected as mirrored and stored as original commands
      expect(importedProfile.builds.space.keys.F1).toHaveLength(3)
      expect(importedProfile.builds.space.keys.F1[0].command).toBe(
        '+TrayExecByTray 9 0'
      )
      expect(importedProfile.builds.space.keys.F1[1].command).toBe(
        '+TrayExecByTray 9 1'
      )
      expect(importedProfile.builds.space.keys.F1[2].command).toBe(
        '+TrayExecByTray 9 2'
      )

      // Stabilization metadata should be set
      const actualProfile = storageService.getProfile(importProfileId)
      expect(
        actualProfile.keybindMetadata.space.F1.stabilizeExecutionOrder
      ).toBe(true)

      // Single commands should remain unchanged
      expect(importedProfile.builds.space.keys.F2).toHaveLength(1)
      expect(importedProfile.builds.space.keys.F2[0].command).toBe(
        'FirePhasers'
      )
    })
  })

  describe('syncToFolder Bug Fix Integration', () => {
    let testProfile

    beforeEach(() => {
      // Reset the mocked writeFile function
      vi.mocked(writeFile).mockClear()

      // Create a test profile with the correct data structure
      testProfile = {
        name: 'Bug Test Profile',
        currentEnvironment: 'space',
        builds: {
          space: {
            keys: {
              F1: [{ command: 'FireAll', delay: 0 }],
              F2: [{ command: 'FirePhasers', delay: 0 }]
            }
          },
          ground: {
            keys: {
              F3: [{ command: 'Walk', delay: 0 }]
            }
          }
        },
        aliases: {
          attack: { commands: ['FireAll'], description: 'Attack command' }
        },
        keybindMetadata: {
          space: {
            F1: { stabilizeExecutionOrder: true }
          },
          ground: {
            F3: { stabilizeExecutionOrder: false }
          }
        }
      }

      // Save the test profile
      storageService.saveProfile('bug-test-profile', testProfile)
      
      // Mock storageService.getAllData to return our test profile
      vi.spyOn(storageService, 'getAllData').mockReturnValue({
        profiles: {
          'bug-test-profile': testProfile
        },
        settings: {}
      })
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    it('should correctly export keybinds from profile.builds structure', async () => {
      const mockDirHandle = createMockDirectoryHandle()
      
      await stoExport.syncToFolder(mockDirHandle)
      
      // Find the space keybind file write call
      const spaceKeybindCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Bug_Test_Profile_space.txt')
      )
      
      expect(spaceKeybindCall).toBeDefined()
      const spaceContent = spaceKeybindCall[2]
      
      // Should contain keybinds from profile.builds.space.keys
      expect(spaceContent).toMatch(/F1 "FireAll"/)
      expect(spaceContent).toMatch(/F2 "FirePhasers"/)
      
      // Find the ground keybind file write call
      const groundKeybindCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Bug_Test_Profile_ground.txt')
      )
      
      expect(groundKeybindCall).toBeDefined()
      const groundContent = groundKeybindCall[2]
      
      // Should contain keybinds from profile.builds.ground.keys
      expect(groundContent).toMatch(/F3 "Walk"/)
    })

    it('should use profile.currentEnvironment for alias file mode', async () => {
      const mockDirHandle = createMockDirectoryHandle()
      
      await stoExport.syncToFolder(mockDirHandle)
      
      // Find the alias file write call
      const aliasCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Bug_Test_Profile_aliases.txt')
      )
      
      expect(aliasCall).toBeDefined()
      const aliasContent = aliasCall[2]
      
      // Should use currentEnvironment (space) in header
      expect(aliasContent).toMatch(/Mode: SPACE/)
    })

    it('should generate non-timestamped filenames for sync operations', async () => {
      const mockDirHandle = createMockDirectoryHandle()
      
      await stoExport.syncToFolder(mockDirHandle)
      
      // Check that written filenames don't have timestamps
      const writtenFiles = vi.mocked(writeFile).mock.calls.map(call => call[1])
      
      expect(writtenFiles).toContain('Bug_Test_Profile/Bug_Test_Profile_space.txt')
      expect(writtenFiles).toContain('Bug_Test_Profile/Bug_Test_Profile_ground.txt')
      expect(writtenFiles).toContain('Bug_Test_Profile/Bug_Test_Profile_aliases.txt')
      
      // Verify no timestamp patterns in filenames
      writtenFiles.forEach(filename => {
        if (filename.endsWith('.txt') && !filename.endsWith('project.json')) {
          expect(filename).not.toMatch(/_\d{4}-\d{2}-\d{2}\.txt$/)
        }
      })
    })

    it('should include keybindMetadata in exported keybind files', async () => {
      const mockDirHandle = createMockDirectoryHandle()
      
      // Spy on generateSTOKeybindFile to check metadata inclusion
      const generateSpy = vi.spyOn(stoExport, 'generateSTOKeybindFile')
      
      await stoExport.syncToFolder(mockDirHandle)
      
      // Check space keybind generation call
      const spaceCall = generateSpy.mock.calls.find(call => 
        call[1]?.environment === 'space'
      )
      expect(spaceCall).toBeDefined()
      expect(spaceCall[0]).toHaveProperty('keybindMetadata')
      expect(spaceCall[0].keybindMetadata).toEqual(testProfile.keybindMetadata)
      
      // Check ground keybind generation call
      const groundCall = generateSpy.mock.calls.find(call => 
        call[1]?.environment === 'ground'
      )
      expect(groundCall).toBeDefined()
      expect(groundCall[0]).toHaveProperty('keybindMetadata')
      expect(groundCall[0].keybindMetadata).toEqual(testProfile.keybindMetadata)
      
      generateSpy.mockRestore()
    })

    it('should generate correct bind_load_file commands without timestamps', async () => {
      const mockDirHandle = createMockDirectoryHandle()
      
      await stoExport.syncToFolder(mockDirHandle)
      
      // Find the space keybind file content
      const spaceKeybindCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Bug_Test_Profile_space.txt')
      )
      
      const spaceContent = spaceKeybindCall[2]
      
      // Header should reference the actual filename without timestamp
      expect(spaceContent).toMatch(/bind_load_file Bug_Test_Profile_space\.txt/)
      
      // Find the ground keybind file content
      const groundKeybindCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Bug_Test_Profile_ground.txt')
      )
      
      const groundContent = groundKeybindCall[2]
      
      // Header should reference the actual filename without timestamp
      expect(groundContent).toMatch(/bind_load_file Bug_Test_Profile_ground\.txt/)
    })
  })
})
