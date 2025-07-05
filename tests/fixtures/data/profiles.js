// Profile data fixtures
// Provides pre-configured profile data for testing

import { registerFixture, unregisterFixture, generateFixtureId } from '../core/cleanup.js'

/**
 * Basic profile with minimal data
 */
export const BASIC_PROFILE = {
  name: 'Basic Test Profile',
  description: 'A basic profile for testing',
  currentEnvironment: 'space',
  builds: {
    space: {
      keys: {
        F1: ['FireAll'],
        F2: ['FirePhasers']
      }
    },
    ground: {
      keys: {}
    }
  },
  aliases: {},
  created: '2024-01-01T00:00:00.000Z',
  lastModified: '2024-01-01T00:00:00.000Z'
}

/**
 * Complex profile with multiple commands, chains, and aliases
 */
export const COMPLEX_PROFILE = {
  name: 'Complex Test Profile',
  description: 'A complex profile with multiple features',
  currentEnvironment: 'space',
  builds: {
    space: {
      keys: {
        Space: [
          'FireAll',
          '+TrayExecByTray 0 0',
          'FireTorps'
        ],
        Tab: ['Target_Enemy_Near'],
        'Ctrl+1': ['say "Hello World"'],
        'Shift+Space': ['FireSequence']
      }
    },
    ground: {
      keys: {
        Space: ['Jump'],
        'Ctrl+1': ['say "Ground Mode"']
      }
    }
  },
  aliases: {
    FireSequence: {
      commands: ['+TrayExecByTray 0 0','+TrayExecByTray 0 1','+TrayExecByTray 0 2'],
      description: 'Execute a sequence of tray commands'
    },
    AttackPattern: {
      commands: ['FireAll','+TrayExecByTray 0 0','FireTorps'],
      description: 'Standard attack pattern'
    },
    EmergencyPower: {
      commands: ['+TrayExecByTray 1 0','+TrayExecByTray 1 1'],
      description: 'Emergency power activation'
    }
  },
  created: '2024-01-01T00:00:00.000Z',
  lastModified: '2024-01-01T12:00:00.000Z'
}

/**
 * Empty profile with no keybinds
 */
export const EMPTY_PROFILE = {
  name: 'Empty Test Profile',
  description: 'An empty profile for testing',
  currentEnvironment: 'space',
  builds: {
    space: {
      keys: {}
    },
    ground: {
      keys: {}
    }
  },
  aliases: {},
  created: '2024-01-01T00:00:00.000Z',
  lastModified: '2024-01-01T00:00:00.000Z'
}

/**
 * Profile with only ground keybinds
 */
export const GROUND_PROFILE = {
  name: 'Ground Test Profile',
  description: 'A profile focused on ground combat',
  currentEnvironment: 'ground',
  builds: {
    space: {
      keys: {}
    },
    ground: {
      keys: {
        '1': ['+TrayExecByTray 0 0'],
        '2': ['+TrayExecByTray 0 1'],
        '3': ['+TrayExecByTray 0 2'],
        Tab: ['Target_Enemy_Near'],
        'Ctrl+Tab': ['Target_Friend_Near']
      }
    }
  },
  aliases: {
    QuickHeal: {
      commands: ['+TrayExecByTray 1 0'],
      description: 'Quick heal ability'
    },
    QuickAttack: {
      commands: ['+TrayExecByTray 0 0','+TrayExecByTray 0 1'],
      description: 'Quick attack combo'
    }
  },
  created: '2024-01-01T00:00:00.000Z',
  lastModified: '2024-01-01T00:00:00.000Z'
}

/**
 * Profile with problematic data for testing edge cases
 */
export const PROBLEMATIC_PROFILE = {
  name: 'Problematic Test Profile',
  description: 'A profile with edge cases and potential issues',
  currentEnvironment: 'space',
  builds: {
    space: {
      keys: {
        // Long command chain
        'F10': Array.from({ length: 20 }, (_, i) => `+TrayExecByTray 0 ${i}`),
        // Special characters in key name
        'Ctrl+Shift+Alt+F12': ['FireAll'],
        // Unicode characters
        '§': ['say "Special char"']
      }
    },
    ground: {
      keys: {}
    }
  },
  aliases: {
    // Very long alias
    LongAlias: {
      commands: Array.from({ length: 50 }, (_, i) => `say "Command ${i}"`),
      description: 'Very long alias for testing'
    },
    // Special characters in alias
    'Special-Alias_123': {
      commands: ['say "Special alias"'],
      description: 'Alias with special characters'
    },
    // Empty alias (edge case)
    EmptyAlias: {
      commands: [],
      description: 'Empty alias for testing'
    }
  },
  created: '2024-01-01T00:00:00.000Z',
  lastModified: '2024-01-01T00:00:00.000Z'
}

/**
 * Create a profile data fixture
 * @param {string} type - Type of profile ('basic', 'complex', 'empty', 'ground', 'problematic')
 * @param {Object} overrides - Properties to override in the profile
 * @returns {Object} Profile data fixture
 */
export function createProfileDataFixture(type = 'basic', overrides = {}) {
  const fixtureId = generateFixtureId('profileData')
  
  let baseProfile
  switch (type) {
    case 'complex':
      baseProfile = COMPLEX_PROFILE
      break
    case 'empty':
      baseProfile = EMPTY_PROFILE
      break
    case 'ground':
      baseProfile = GROUND_PROFILE
      break
    case 'problematic':
      baseProfile = PROBLEMATIC_PROFILE
      break
    case 'basic':
    default:
      baseProfile = BASIC_PROFILE
      break
  }
  
  // Deep clone to avoid mutations
  const profile = JSON.parse(JSON.stringify(baseProfile))
  
  // Apply overrides
  Object.assign(profile, overrides)
  
  const fixture = {
    profile,
    type,
    
    // Utility methods
    addKey: (environment, key, commands) => {
      if (!profile.builds[environment]) {
        profile.builds[environment] = { keys: {} }
      }
      profile.builds[environment].keys[key] = Array.isArray(commands) ? commands : [commands]
    },
    
    removeKey: (environment, key) => {
      if (profile.builds[environment] && profile.builds[environment].keys) {
        delete profile.builds[environment].keys[key]
      }
    },
    
    addAlias: (name, commands, description = '') => {
      profile.aliases[name] = {
        commands: Array.isArray(commands) ? commands : [commands],
        description: description
      }
    },
    
    removeAlias: (name) => {
      delete profile.aliases[name]
    },
    
    setEnvironment: (environment) => {
      profile.currentEnvironment = environment
    },
    
    getKeys: (environment) => {
      return profile.builds[environment]?.keys || {}
    },
    
    getAliases: () => {
      return profile.aliases || {}
    },
    
    // Validation helpers
    validate: () => {
      const errors = []
      
      if (!profile.name) errors.push('Profile name is required')
      if (!profile.builds) errors.push('Profile builds are required')
      if (!profile.builds.space) errors.push('Space build is required')
      if (!profile.builds.ground) errors.push('Ground build is required')
      if (!profile.aliases) errors.push('Aliases object is required')
      
      return errors
    },
    
    isValid: () => {
      return fixture.validate().length === 0
    },
    
    // Cleanup
    destroy: () => {
      unregisterFixture(fixtureId)
    }
  }
  
  registerFixture(fixtureId, fixture.destroy)
  
  return fixture
}

/**
 * Create a collection of profiles for testing multi-profile scenarios
 * @param {Array} types - Array of profile types to create
 * @returns {Object} Collection of profile fixtures
 */
export function createProfileCollectionFixture(types = ['basic', 'complex', 'empty']) {
  const fixtureId = generateFixtureId('profileCollection')
  const profiles = {}
  
  types.forEach((type, index) => {
    const profileId = `test-profile-${index + 1}`
    profiles[profileId] = createProfileDataFixture(type, {
      name: `Test Profile ${index + 1}`,
      description: `Test profile of type ${type}`
    })
  })
  
  const fixture = {
    profiles,
    
    // Utility methods
    getProfile: (id) => profiles[id],
    
    getAllProfiles: () => Object.values(profiles).map(p => p.profile),
    
    getProfileIds: () => Object.keys(profiles),
    
    addProfile: (id, type = 'basic', overrides = {}) => {
      profiles[id] = createProfileDataFixture(type, overrides)
    },
    
    removeProfile: (id) => {
      if (profiles[id]) {
        profiles[id].destroy()
        delete profiles[id]
      }
    },
    
    // Convert to storage format
    toStorageFormat: (currentProfileId = null) => {
      const storageProfiles = {}
      
      for (const [id, fixture] of Object.entries(profiles)) {
        storageProfiles[id] = fixture.profile
      }
      
      return {
        currentProfile: currentProfileId || Object.keys(storageProfiles)[0] || null,
        profiles: storageProfiles,
        settings: {
          theme: 'dark',
          language: 'en',
          autoSave: true
        },
        version: '1.0.0',
        lastModified: new Date().toISOString()
      }
    },
    
    // Cleanup
    destroy: () => {
      Object.values(profiles).forEach(profile => profile.destroy())
      unregisterFixture(fixtureId)
    }
  }
  
  registerFixture(fixtureId, fixture.destroy)
  
  return fixture
} 