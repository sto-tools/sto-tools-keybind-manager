import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import STOExportManager from '../../src/js/export.js'
import '../../src/js/data.js'
import { mock } from 'fsa-mock'

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

// Mock stoStorage
const mockStorage = {
  getAllData: vi.fn(),
  getProfile: vi.fn(),
  saveProfile: vi.fn()
}
global.stoStorage = mockStorage

describe('Export Operations Integration Tests', () => {
  let exportManager
  let testProfiles
  let mockDirHandle

  beforeEach(async () => {
    exportManager = new STOExportManager()
    
    // Reset mocks
    vi.clearAllMocks()
    
    // Install fsa-mock
    mock.install()
    
    // Create a mock directory handle using fsa-mock
    mock.makeDir('test-sync-folder')
    
    // Create a mock FileSystemDirectoryHandle
    mockDirHandle = {
      async getDirectoryHandle(name, options) {
        if (options?.create) {
          mock.makeDir(`test-sync-folder/${name}`)
        }
        return {
          async getDirectoryHandle(subName, subOptions) {
            if (subOptions?.create) {
              mock.makeDir(`test-sync-folder/${name}/${subName}`)
            }
            return {
              async getFileHandle(fileName, fileOptions) {
                const fullPath = `test-sync-folder/${name}/${subName}/${fileName}`
                if (fileOptions?.create) {
                  mock.createFile(fullPath, '')
                }
                return {
                  async text() {
                    return new TextDecoder().decode(mock.contents(fullPath))
                  }
                }
              },
              async *entries() {
                // Mock entries iterator - for testing filename patterns
                const basePath = `test-sync-folder/${name}/${subName}`
                const files = ['file1.txt', 'file2.txt'] // Mock files
                for (const file of files) {
                  yield [file, { kind: 'file' }]
                }
              }
            }
          },
          async getFileHandle(fileName, fileOptions) {
            const fullPath = `test-sync-folder/${name}/${fileName}`
            if (fileOptions?.create) {
              mock.createFile(fullPath, '')
            }
            return {
              async text() {
                return new TextDecoder().decode(mock.contents(fullPath))
              }
            }
          },
          async *entries() {
            // Mock entries iterator
            const files = ['file1.txt', 'file2.txt'] // Mock files  
            for (const file of files) {
              yield [file, { kind: 'file' }]
            }
          }
        }
      },
      async getFileHandle(fileName, fileOptions) {
        const fullPath = `test-sync-folder/${fileName}`
        if (fileOptions?.create) {
          mock.createFile(fullPath, '')
        }
        return {
          async text() {
            return new TextDecoder().decode(mock.contents(fullPath))
          }
        }
      }
    }
    
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

    // Mock stoStorage.getAllData
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
      
      // Read the space keybind file for profile-1
      const profileDir = await mockDirHandle.getDirectoryHandle('Test_Profile_One')
      const spaceFile = await profileDir.getFileHandle('Test_Profile_One_space.txt')
      const spaceContent = await spaceFile.text()
      
      // Should contain keybinds from profile.builds.space.keys
      expect(spaceContent).toMatch(/F1 "FireAll"/)
      expect(spaceContent).toMatch(/F2 "FirePhasers"/)
      
      // Should NOT contain ground keybinds in space file
      expect(spaceContent).not.toMatch(/F3 "Walk"/)
      expect(spaceContent).not.toMatch(/F4 "Run"/)
    })

    it('should access keybinds from correct profile.builds.ground.keys structure', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Read the ground keybind file for profile-1
      const profileDir = await mockDirHandle.getDirectoryHandle('Test_Profile_One')
      const groundFile = await profileDir.getFileHandle('Test_Profile_One_ground.txt')
      const groundContent = await groundFile.text()
      
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
      const profile1Dir = await mockDirHandle.getDirectoryHandle('Test_Profile_One')
      const profile1AliasFile = await profile1Dir.getFileHandle('Test_Profile_One_aliases.txt')
      const profile1AliasContent = await profile1AliasFile.text()
      expect(profile1AliasContent).toMatch(/Mode: SPACE/)
      
      // Check profile-2 aliases (currentEnvironment: 'ground')
      const profile2Dir = await mockDirHandle.getDirectoryHandle('Special_Characters_Profile___')
      const profile2AliasFile = await profile2Dir.getFileHandle('Special_Characters_Profile____aliases.txt')
      const profile2AliasContent = await profile2AliasFile.text()
      expect(profile2AliasContent).toMatch(/Mode: GROUND/)
    })

    it('should generate non-timestamped filenames for sync operations', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Check that expected directories and files exist
      const profile1Dir = await mockDirHandle.getDirectoryHandle('Test_Profile_One')
      const profile2Dir = await mockDirHandle.getDirectoryHandle('Special_Characters_Profile___')
      
      // Check profile-1 files
      await expect(profile1Dir.getFileHandle('Test_Profile_One_space.txt')).resolves.toBeDefined()
      await expect(profile1Dir.getFileHandle('Test_Profile_One_ground.txt')).resolves.toBeDefined()
      await expect(profile1Dir.getFileHandle('Test_Profile_One_aliases.txt')).resolves.toBeDefined()
      
      // Check profile-2 files
      await expect(profile2Dir.getFileHandle('Special_Characters_Profile____space.txt')).resolves.toBeDefined()
      await expect(profile2Dir.getFileHandle('Special_Characters_Profile____ground.txt')).resolves.toBeDefined()
      await expect(profile2Dir.getFileHandle('Special_Characters_Profile____aliases.txt')).resolves.toBeDefined()
      
      // Check project.json
      await expect(mockDirHandle.getFileHandle('project.json')).resolves.toBeDefined()
      
      // Verify NO timestamp patterns in filenames by checking they don't exist
      const profile1Files = []
      for await (const [name] of profile1Dir.entries()) {
        profile1Files.push(name)
      }
      
      profile1Files.forEach(filename => {
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
      
      // Check space keybind file header
      const profile1Dir = await mockDirHandle.getDirectoryHandle('Test_Profile_One')
      const spaceFile = await profile1Dir.getFileHandle('Test_Profile_One_space.txt')
      const spaceContent = await spaceFile.text()
      
      expect(spaceContent).toMatch(/bind_load_file Test_Profile_One_space\.txt/)
      expect(spaceContent).not.toMatch(/bind_load_file.*\d{4}-\d{2}-\d{2}\.txt/)
      
      // Check ground keybind file header
      const groundFile = await profile1Dir.getFileHandle('Test_Profile_One_ground.txt')
      const groundContent = await groundFile.text()
      
      expect(groundContent).toMatch(/bind_load_file Test_Profile_One_ground\.txt/)
      expect(groundContent).not.toMatch(/bind_load_file.*\d{4}-\d{2}-\d{2}\.txt/)
    })

    it('should properly sanitize profile names in filenames', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Check that special characters are properly sanitized in directory name
      const specialCharDir = await mockDirHandle.getDirectoryHandle('Special_Characters_Profile___')
      expect(specialCharDir).toBeDefined()
      
      // Check files within the sanitized directory
      const files = []
      for await (const [name] of specialCharDir.entries()) {
        files.push(name)
      }
      
      files.forEach(filename => {
        // Should not contain special characters
        expect(filename).not.toMatch(/[!@#$%^&*()+=\[\]{}|\\:";'<>?,./]/)
        // Should contain sanitized underscores
        expect(filename).toMatch(/Special_Characters_Profile____/)
      })
    })

    it('should aggregate aliases from profile level (not builds)', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Read alias file for profile-1
      const profile1Dir = await mockDirHandle.getDirectoryHandle('Test_Profile_One')
      const aliasFile = await profile1Dir.getFileHandle('Test_Profile_One_aliases.txt')
      const aliasContent = await aliasFile.text()
      
      // Should contain profile-level aliases
      expect(aliasContent).toMatch(/alias attack/)
      expect(aliasContent).toMatch(/alias move/)
      
      // Should include alias descriptions
      expect(aliasContent).toMatch(/Attack command/)
      expect(aliasContent).toMatch(/Movement command/)
    })

    it('should handle profiles without builds structure gracefully', async () => {
      // Create old format profile without builds
      const oldFormatProfiles = {
        'old-profile': {
          name: 'Old Format Profile',
          mode: 'space',
          currentEnvironment: 'space',
          keys: {
            F1: [{ command: 'OldCommand' }]
          },
          aliases: {
            oldAlias: { commands: ['OldCommand'] }
          }
        }
      }

      mockStorage.getAllData.mockReturnValue({
        profiles: oldFormatProfiles,
        currentProfile: 'old-profile',
        settings: { theme: 'dark' }
      })
      
      // Should not throw error
      await expect(exportManager.syncToFolder(mockDirHandle)).resolves.not.toThrow()
      
      // Should write project.json
      await expect(mockDirHandle.getFileHandle('project.json')).resolves.toBeDefined()
      
      // Should write aliases file
      const profileDir = await mockDirHandle.getDirectoryHandle('Old_Format_Profile')
      await expect(profileDir.getFileHandle('Old_Format_Profile_aliases.txt')).resolves.toBeDefined()
      
      // Should NOT write keybind files (no builds structure)
      await expect(profileDir.getFileHandle('Old_Format_Profile_space.txt')).rejects.toThrow()
      await expect(profileDir.getFileHandle('Old_Format_Profile_ground.txt')).rejects.toThrow()
    })

    it('should write project.json with correct structure', async () => {
      await exportManager.syncToFolder(mockDirHandle)
      
      // Read project.json
      const projectFile = await mockDirHandle.getFileHandle('project.json')
      const projectContent = await projectFile.text()
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
    it('should maintain backward compatibility with existing export methods', async () => {
      // Test that regular export methods still work
      const profile = testProfiles['profile-1']
      
      // Test generateSTOKeybindFile
      const keybindContent = exportManager.generateSTOKeybindFile(profile, {
        environment: 'space',
        profile: profile
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