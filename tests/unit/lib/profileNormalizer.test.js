import { describe, it, beforeEach, expect } from 'vitest'
import { 
  normalizeProfile, 
  needsNormalization, 
  getMigrationReport 
} from '../../../src/js/lib/profileNormalizer.js'

describe('Profile Normalizer', () => {
  
  describe('normalizeProfile', () => {
    it('should normalize profile with rich object keybind commands', () => {
      const profile = {
        id: 'test-profile',
        name: 'Test Profile',
        builds: {
          'space': {
            keys: {
              'F1': [
                { command: 'FireAll', name: 'Fire All Weapons' },
                { command: '+TrayExecByTray 0 0', name: 'Tray Exec' }
              ]
            }
          }
        },
        aliases: {}
      }

      const result = normalizeProfile(profile)

      expect(result.builds.space.keys.F1).toEqual(['FireAll', '+TrayExecByTray 0 0'])
      expect(result.lastModified).toBeDefined()
      expect(result.migrationVersion).toBe('2.1.0')
    })

    it('should normalize profile with legacy string alias commands', () => {
      const profile = {
        id: 'test-profile',
        name: 'Test Profile',
        builds: {},
        aliases: {
          'myAlias': {
            commands: 'FireAll$$+TrayExecByTray 0 0$$FireTorps'
          }
        }
      }

      const result = normalizeProfile(profile)

      expect(result.aliases.myAlias.commands).toEqual(['FireAll', '+TrayExecByTray 0 0', 'FireTorps'])
      expect(result.lastModified).toBeDefined()
      expect(result.migrationVersion).toBe('2.1.0')
    })

    it('should normalize profile with rich object alias commands', () => {
      const profile = {
        id: 'test-profile',
        name: 'Test Profile',
        builds: {},
        aliases: {
          'myAlias': {
            commands: [
              { command: 'FireAll', name: 'Fire All' },
              { command: 'FireTorps', name: 'Fire Torpedoes' }
            ]
          }
        }
      }

      const result = normalizeProfile(profile)

      expect(result.aliases.myAlias.commands).toEqual(['FireAll', 'FireTorps'])
      expect(result.lastModified).toBeDefined()
      expect(result.migrationVersion).toBe('2.1.0')
    })

    it('should handle mixed format complex profile', () => {
      const profile = {
        id: 'mixed-profile',
        name: 'Mixed Format Profile',
        builds: {
          'space': {
            keys: {
              'F1': ['FireAll'], // already canonical
              'F2': [{ command: 'FireTorps', name: 'Fire Torpedoes' }], // rich object
              'F3': 'SingleCommand' // legacy single string
            }
          },
          'ground': {
            keys: {
              'G': [
                'CanonicalCommand',
                { command: 'RichCommand', name: 'Rich Command' }
              ]
            }
          }
        },
        aliases: {
          'alias1': {
            commands: 'Command1$$Command2' // legacy string format
          },
          'alias2': {
            commands: ['Command3', 'Command4'] // canonical array
          },
          'alias3': {
            commands: [
              { command: 'Command5', name: 'Command Five' },
              'Command6'
            ] // mixed array
          }
        }
      }

      const result = normalizeProfile(profile)

      // Check keybinds normalization
      expect(result.builds.space.keys.F1).toEqual(['FireAll'])
      expect(result.builds.space.keys.F2).toEqual(['FireTorps'])
      expect(result.builds.space.keys.F3).toEqual(['SingleCommand'])
      expect(result.builds.ground.keys.G).toEqual(['CanonicalCommand', 'RichCommand'])

      // Check aliases normalization
      expect(result.aliases.alias1.commands).toEqual(['Command1', 'Command2'])
      expect(result.aliases.alias2.commands).toEqual(['Command3', 'Command4'])
      expect(result.aliases.alias3.commands).toEqual(['Command5', 'Command6'])

      // Check metadata
      expect(result.lastModified).toBeDefined()
      expect(result.migrationVersion).toBe('2.1.0')
    })

    it('should preserve already normalized profiles', () => {
      const profile = {
        id: 'normalized-profile',
        name: 'Already Normalized',
        builds: {
          'space': {
            keys: {
              'F1': ['FireAll', 'FireTorps']
            }
          }
        },
        aliases: {
          'myAlias': {
            commands: ['Command1', 'Command2']
          }
        },
        migrationVersion: '2.0.0',
        lastModified: '2025-10-27T10:30:56.651Z'
      }

      const originalLastModified = profile.lastModified
      const result = normalizeProfile(profile)

      expect(result.builds.space.keys.F1).toEqual(['FireAll', 'FireTorps'])
      expect(result.aliases.myAlias.commands).toEqual(['Command1', 'Command2'])
      expect(result.lastModified).not.toBe(originalLastModified) // Should update during normalization
      expect(result.migrationVersion).toBe('2.1.0')
    })

    it('should handle empty or missing sections', () => {
      const profile = {
        id: 'minimal-profile',
        name: 'Minimal Profile'
      }

      const result = normalizeProfile(profile)

      expect(result.id).toBe('minimal-profile')
      expect(result.name).toBe('Minimal Profile')
      // Should not crash or create empty structures
    })

    it('should filter out empty commands', () => {
      const profile = {
        id: 'empty-commands-profile',
        name: 'Profile with Empty Commands',
        builds: {
          'space': {
            keys: {
              'F1': ['FireAll', '', null, undefined, 'FireTorps']
            }
          }
        },
        aliases: {
          'myAlias': {
            commands: 'FireAll$$$$FireTorps$$' // empty segments
          }
        }
      }

      const result = normalizeProfile(profile)

      expect(result.builds.space.keys.F1).toEqual(['FireAll', 'FireTorps'])
      expect(result.aliases.myAlias.commands).toEqual(['FireAll', 'FireTorps'])
    })

    it('should preserve existing metadata while adding normalization info', () => {
      const profile = {
        id: 'with-metadata',
        name: 'Profile With Metadata',
        builds: {
          'space': {
            keys: {
              'F1': [{ command: 'FireAll', name: 'Fire All' }]
            }
          }
        },
        aliases: {},
        existingField: 'existing value',
        version: '1.0'
      }

      const result = normalizeProfile(profile)

      expect(result.existingField).toBe('existing value')
      expect(result.version).toBe('1.0')
      expect(result.lastModified).toBeDefined()
      expect(result.migrationVersion).toBe('2.1.0')
    })
  })

  describe('needsNormalization', () => {
    it('should detect profiles with rich object keybind commands', () => {
      const profile = {
        builds: {
          'space': {
            keys: {
              'F1': [{ command: 'FireAll', name: 'Fire All' }]
            }
          }
        },
        aliases: {}
      }

      expect(needsNormalization(profile)).toBe(true)
    })

    it('should detect profiles with legacy string alias commands', () => {
      const profile = {
        builds: {},
        aliases: {
          'myAlias': {
            commands: 'FireAll$$FireTorps'
          }
        }
      }

      expect(needsNormalization(profile)).toBe(true)
    })

    it('should detect profiles with legacy single string keybinds', () => {
      const profile = {
        builds: {
          'space': {
            keys: {
              'F1': 'SingleCommand'
            }
          }
        },
        aliases: {}
      }

      expect(needsNormalization(profile)).toBe(true)
    })

    it('should return false for already normalized profiles', () => {
      const profile = {
        builds: {
          'space': {
            keys: {
              'F1': ['FireAll', 'FireTorps']
            }
          }
        },
        aliases: {
          'myAlias': {
            commands: ['Command1', 'Command2']
          }
        },
        migrationVersion: '2.0.0'
      }

      expect(needsNormalization(profile)).toBe(true)
    })

    it('should return false for empty profiles', () => {
      const profile = {
        builds: {},
        aliases: {}
      }

      expect(needsNormalization(profile)).toBe(true)
    })

    it('should return false for profiles with no builds or aliases', () => {
      const profile = {
        id: 'minimal',
        name: 'Minimal Profile'
      }

      expect(needsNormalization(profile)).toBe(true)
    })

    it('should handle mixed environments in keybinds', () => {
      const profile = {
        builds: {
          'space': {
            keys: {
              'F1': ['NormalizedCommand'] // already normalized
            }
          },
          'ground': {
            keys: {
              'G1': [{ command: 'RichCommand', name: 'Rich' }] // needs normalization
            }
          }
        },
        aliases: {}
      }

      expect(needsNormalization(profile)).toBe(true)
    })
  })

  describe('getMigrationReport', () => {
    it('should generate detailed migration report', () => {
      const profile = {
        id: 'test-profile',
        name: 'Test Profile',
        builds: {
          'space': {
            keys: {
              'F1': [{ command: 'FireAll', name: 'Fire All' }, 'AlreadyNormalized'],
              'F2': 'SingleCommand'
            }
          },
          'ground': {
            keys: {
              'G1': ['AlreadyNormalized']
            }
          }
        },
        aliases: {
          'alias1': {
            commands: 'Command1$$Command2$$Command3'
          },
          'alias2': {
            commands: [{ command: 'RichCommand', name: 'Rich' }, 'NormalCommand']
          },
          'alias3': {
            commands: ['AlreadyNormalized']
          }
        }
      }

      // Create a copy for normalization
      const original = JSON.parse(JSON.stringify(profile))
      normalizeProfile(profile)
      const report = getMigrationReport(original, profile)

      expect(report.hasChanges).toBe(true)
      expect(report.keybindsMigrated).toBeGreaterThan(0)
      expect(report.aliasesMigrated).toBeGreaterThan(0)
      expect(report.richObjectsRemoved).toBeGreaterThan(0)
      expect(report.stringsSplit).toBeGreaterThan(0)
      expect(report.migrationVersion).toBe('2.1.0')
    })

    it('should handle already normalized profile', () => {
      const profile = {
        id: 'normalized-profile',
        name: 'Normalized Profile',
        builds: {
          'space': {
            keys: {
              'F1': ['Command1', 'Command2']
            }
          }
        },
        aliases: {
          'alias1': {
            commands: ['Command3', 'Command4']
          }
        },
        migrationVersion: '2.0.0'
      }

      const original = JSON.parse(JSON.stringify(profile))
      normalizeProfile(profile)
      const report = getMigrationReport(original, profile)

      expect(report.hasChanges).toBe(false)
      expect(report.keybindsMigrated).toBe(0)
      expect(report.aliasesMigrated).toBe(0)
    })

    it('should handle empty profile', () => {
      const profile = {
        id: 'empty-profile',
        name: 'Empty Profile'
      }

      const original = JSON.parse(JSON.stringify(profile))
      normalizeProfile(profile)
      const report = getMigrationReport(original, profile)

      expect(report.hasChanges).toBe(false)
      expect(report.keybindsMigrated).toBe(0)
      expect(report.aliasesMigrated).toBe(0)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle null or undefined profiles gracefully', () => {
      expect(needsNormalization(null)).toBe(false)
      expect(needsNormalization(undefined)).toBe(false)
      
      expect(() => normalizeProfile(null)).not.toThrow()
      expect(() => normalizeProfile(undefined)).not.toThrow()
      
      expect(() => getMigrationReport(null, null)).not.toThrow()
      expect(() => getMigrationReport(undefined, undefined)).not.toThrow()
    })

    it('should handle malformed keybinds structure', () => {
      const profile = {
        builds: {
          'space': {
            keys: {
              'F1': null, // malformed
              'F2': undefined, // malformed
              'F3': 'ValidCommand'
            }
          }
        },
        aliases: {}
      }

      const result = normalizeProfile(profile)
      expect(result.builds.space.keys.F1).toEqual([])
      expect(result.builds.space.keys.F2).toEqual([])
      expect(result.builds.space.keys.F3).toEqual(['ValidCommand'])
    })

    it('should handle malformed alias structure', () => {
      const profile = {
        builds: {},
        aliases: {
          'alias1': null, // malformed
          'alias2': {
            commands: null // malformed
          },
          'alias3': {
            commands: 'ValidCommand'
          }
        }
      }

      const result = normalizeProfile(profile)
      expect(result.aliases.alias1).toBe(null) // preserves original structure
      expect(result.aliases.alias2.commands).toEqual([])
      expect(result.aliases.alias3.commands).toEqual(['ValidCommand'])
    })

    it('should preserve other profile properties', () => {
      const profile = {
        id: 'test-profile',
        name: 'Test Profile',
        description: 'A test profile',
        created: '2024-01-01',
        settings: {
          autoSync: true
        },
        builds: {
          'space': {
            keys: {
              'F1': 'Command'
            }
          }
        },
        aliases: {}
      }

      const result = normalizeProfile(profile)

      expect(result.id).toBe('test-profile')
      expect(result.name).toBe('Test Profile')
      expect(result.description).toBe('A test profile')
      expect(result.created).toBe('2024-01-01')
      expect(result.settings.autoSync).toBe(true)
    })
  })
}) 