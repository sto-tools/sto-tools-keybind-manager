import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Hoisted mock for writeFile from SyncService (used by export.js)
vi.mock('../../src/js/components/services/SyncService.js', () => ({
  writeFile: vi.fn()
}))

import STOExportManager from '../../src/js/features/export.js'
import '../../src/js/data.js'
import { mock } from 'fsa-mock'
import { writeFile } from '../../src/js/components/services/SyncService.js'

// Mock STO_DATA for tests
global.STO_DATA = {
  settings: { version: '1.0.0' },
  defaultProfiles: {
    default_space: {
      name: 'Default Space',
      builds: { space: { keys: {} }, ground: { keys: {} } },
      aliases: {}
    }
  }
}

// Mock storageService
const mockStorage = {
  getAllData: vi.fn(),
  getProfile: vi.fn(),
  saveProfile: vi.fn()
}
global.storageService = mockStorage

describe('Export Operations Integration Tests', () => {
  let exportManager
  let testProfiles
  let mockDirHandle

  beforeEach(async () => {
    exportManager = new STOExportManager()
    
    // Reset mocks
    vi.clearAllMocks()
    vi.mocked(writeFile).mockClear()
    
    // Install fsa-mock
    mock.install()
    
    // Create a mock directory handle using helper
    mockDirHandle = createMockDirectoryHandle()
    
    // Create test profiles with correct data structure
    testProfiles = {
      'profile-1': {
        name: 'Test Profile One',
        mode: 'space',
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
              F3: [{ command: 'Walk', delay: 0 }],
              F4: [{ command: 'Run', delay: 0 }]
            }
          }
        },
        aliases: {
          attack: { commands: ['FireAll'], description: 'Attack command' },
          move: { commands: ['Walk'], description: 'Movement command' }
        },
        keybindMetadata: {
          space: {
            F1: { stabilizeExecutionOrder: true },
            F2: { stabilizeExecutionOrder: false }
          },
          ground: {
            F3: { stabilizeExecutionOrder: true },
            F4: { stabilizeExecutionOrder: false }
          }
        }
      },
      'profile-2': {
        name: 'Special Characters Profile!@#',
        mode: 'ground',
        currentEnvironment: 'ground',
        builds: {
          space: {
            keys: {
              G: [{ command: 'TargetNearest', delay: 0 }]
            }
          },
          ground: {
            keys: {
              H: [{ command: 'Crouch', delay: 0 }]
            }
          }
        },
        aliases: {
          target: { commands: ['TargetNearest'], description: 'Target command' }
        },
        keybindMetadata: {
          space: {
            G: { stabilizeExecutionOrder: false }
          },
          ground: {
            H: { stabilizeExecutionOrder: true }
          }
        }
      }
    }

    // Mock storageService.getAllData
    mockStorage.getAllData.mockReturnValue({
      profiles: testProfiles,
      currentProfile: 'profile-1',
      settings: { theme: 'dark' }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    mock.uninstall()
  })

  describe('syncToFolder Bug Fixes', () => {
    it('should access keybinds from correct profile.builds.space.keys structure', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Find the space keybind file for profile-1
      const spaceKeybindCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Test_Profile_One/Test_Profile_One_space.txt')
      )
      
      expect(spaceKeybindCall).toBeDefined()
      const spaceContent = spaceKeybindCall[2]
      
      // Should contain keybinds from profile.builds.space.keys
      expect(spaceContent).toMatch(/F1 "FireAll"/)
      expect(spaceContent).toMatch(/F2 "FirePhasers"/)
      
      // Should NOT contain ground keybinds in space file
      expect(spaceContent).not.toMatch(/F3 "Walk"/)
      expect(spaceContent).not.toMatch(/F4 "Run"/)
    })

    it('should access keybinds from correct profile.builds.ground.keys structure', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Find the ground keybind file for profile-1
      const groundKeybindCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Test_Profile_One/Test_Profile_One_ground.txt')
      )
      
      expect(groundKeybindCall).toBeDefined()
      const groundContent = groundKeybindCall[2]
      
      // Should contain keybinds from profile.builds.ground.keys
      expect(groundContent).toMatch(/F3 "Walk"/)
      expect(groundContent).toMatch(/F4 "Run"/)
      
      // Should NOT contain space keybinds in ground file
      expect(groundContent).not.toMatch(/F1 "FireAll"/)
      expect(groundContent).not.toMatch(/F2 "FirePhasers"/)
    })

    it('should use profile.currentEnvironment for alias file mode', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Check profile-1 aliases (currentEnvironment: 'space')
      const profile1AliasCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Test_Profile_One/Test_Profile_One_aliases.txt')
      )
      
      expect(profile1AliasCall).toBeDefined()
      const profile1AliasContent = profile1AliasCall[2]
      expect(profile1AliasContent).toMatch(/Mode: SPACE/)
      
      // Check profile-2 aliases (currentEnvironment: 'ground')
      const profile2AliasCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Special_Characters_Profile___/Special_Characters_Profile____aliases.txt')
      )
      
      expect(profile2AliasCall).toBeDefined()
      const profile2AliasContent = profile2AliasCall[2]
      expect(profile2AliasContent).toMatch(/Mode: GROUND/)
    })

    it('should generate non-timestamped filenames for sync operations', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Get all written filenames
      const writtenFiles = vi.mocked(writeFile).mock.calls.map(call => call[1])
      
      // Should contain expected non-timestamped filenames
      expect(writtenFiles).toContain('Test_Profile_One/Test_Profile_One_space.txt')
      expect(writtenFiles).toContain('Test_Profile_One/Test_Profile_One_ground.txt')
      expect(writtenFiles).toContain('Test_Profile_One/Test_Profile_One_aliases.txt')
      expect(writtenFiles).toContain('Special_Characters_Profile___/Special_Characters_Profile____space.txt')
      expect(writtenFiles).toContain('Special_Characters_Profile___/Special_Characters_Profile____ground.txt')
      expect(writtenFiles).toContain('Special_Characters_Profile___/Special_Characters_Profile____aliases.txt')
      expect(writtenFiles).toContain('project.json')
      
      // Verify NO timestamp patterns in keybind/alias filenames
      const keybindFiles = writtenFiles.filter(filename => 
        filename.endsWith('.txt') && !filename.endsWith('project.json')
      )
      
      keybindFiles.forEach(filename => {
        expect(filename).not.toMatch(/_\d{4}-\d{2}-\d{2}\.txt$/)
      })
    })

    it('should include keybindMetadata in temporary profile objects for stabilization', async () => {
      // Spy on generateSTOKeybindFile to verify metadata is passed
      const generateSpy = vi.spyOn(exportManager, 'generateSTOKeybindFile')
      
      await exportManager.syncToFolder(mockDirHandle)
      
      // Check that all keybind generation calls include keybindMetadata
      const keybindCalls = generateSpy.mock.calls.filter(call => 
        call[1]?.environment === 'space' || call[1]?.environment === 'ground'
      )
      
      expect(keybindCalls.length).toBeGreaterThan(0)
      
      keybindCalls.forEach(call => {
        const tempProfile = call[0]
        expect(tempProfile).toHaveProperty('keybindMetadata')
        expect(tempProfile.keybindMetadata).toBeDefined()
        expect(typeof tempProfile.keybindMetadata).toBe('object')
      })
      
      generateSpy.mockRestore()
    })

    it('should generate correct bind_load_file commands without timestamps', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Find the space keybind file for profile-1
      const spaceKeybindCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Test_Profile_One/Test_Profile_One_space.txt')
      )
      
      expect(spaceKeybindCall).toBeDefined()
      const spaceContent = spaceKeybindCall[2]
      
      expect(spaceContent).toMatch(/bind_load_file Test_Profile_One_space\.txt/)
      expect(spaceContent).not.toMatch(/bind_load_file.*\d{4}-\d{2}-\d{2}\.txt/)
      
      // Find the ground keybind file for profile-1
      const groundKeybindCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Test_Profile_One/Test_Profile_One_ground.txt')
      )
      
      expect(groundKeybindCall).toBeDefined()
      const groundContent = groundKeybindCall[2]
      
      expect(groundContent).toMatch(/bind_load_file Test_Profile_One_ground\.txt/)
      expect(groundContent).not.toMatch(/bind_load_file.*\d{4}-\d{2}-\d{2}\.txt/)
    })

    it('should properly sanitize profile names in filenames', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Get all written filenames
      const writtenFiles = vi.mocked(writeFile).mock.calls.map(call => call[1])
      
      // Check that special characters are properly sanitized in directory/file names
      const specialCharFiles = writtenFiles.filter(filename => 
        filename.includes('Special_Characters_Profile___')
      )
      
      expect(specialCharFiles.length).toBeGreaterThan(0)
      
             specialCharFiles.forEach(filename => {
         // Should not contain special characters in the filename portion
         const filenameOnly = filename.split('/').pop()
         expect(filenameOnly).not.toMatch(/[!@#$%^&*()+=\[\]{}|\\:";'<>?,/]/)
         // Should contain sanitized underscores
         expect(filename).toMatch(/Special_Characters_Profile____/)
       })
    })

    it('should aggregate aliases from profile level (not builds)', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Find the alias file for profile-1
      const aliasCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1].includes('Test_Profile_One/Test_Profile_One_aliases.txt')
      )
      
      expect(aliasCall).toBeDefined()
      const aliasContent = aliasCall[2]
      
      // Should contain profile-level aliases
      expect(aliasContent).toMatch(/alias attack/)
      expect(aliasContent).toMatch(/alias move/)
      
      // Should include alias descriptions
      expect(aliasContent).toMatch(/Attack command/)
      expect(aliasContent).toMatch(/Movement command/)
    })



    it('should write project.json with correct structure', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Find the project.json file
      const projectCall = vi.mocked(writeFile).mock.calls.find(call => 
        call[1] === 'project.json'
      )
      
      expect(projectCall).toBeDefined()
      const projectContent = projectCall[2]
      const projectData = JSON.parse(projectContent)
      
      expect(projectData).toHaveProperty('version', '1.0.0')
      expect(projectData).toHaveProperty('exported')
      expect(projectData).toHaveProperty('type', 'project')
      expect(projectData).toHaveProperty('data')
      expect(projectData.data).toHaveProperty('profiles')
      expect(projectData.data.profiles).toEqual(testProfiles)
    })
  })

  describe('Regression Tests', () => {
    it('should work with existing export methods', async () => {
      // Test that regular export methods still work
      const profile = testProfiles['profile-1']
      
      // Create a temporary profile with flat structure for direct generateSTOKeybindFile call
      // (This simulates how the function is typically called with extracted keybinds)
      const tempProfile = {
        ...profile,
        keys: profile.builds.space.keys, // Extract space keybinds for this test
        mode: 'space'
      }
      
      // Test generateSTOKeybindFile
      const keybindContent = exportManager.generateSTOKeybindFile(tempProfile, {
        environment: 'space',
        profile: tempProfile
      })
      
      expect(keybindContent).toContain('F1 "FireAll"')
      expect(keybindContent).toContain('F2 "FirePhasers"')
      
      // Test generateAliasFile
      const aliasContent = exportManager.generateAliasFile(profile)
      
      expect(aliasContent).toMatch(/Mode: SPACE/)
      expect(aliasContent).toContain('alias attack')
      expect(aliasContent).toContain('alias move')
    })

    it('should generate timestamped filenames for non-sync operations', async () => {
      const profile = testProfiles['profile-1']
      
      // Test regular filename generation (should include timestamp)
      const filename = exportManager.generateFileName(profile, 'txt', 'space')
      
      expect(filename).toMatch(/Test_Profile_One_space_\d{4}-\d{2}-\d{2}\.txt/)
    })
  })
}) 