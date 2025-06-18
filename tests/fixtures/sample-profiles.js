// Test fixtures for STO Keybind Manager profiles

export const basicProfile = {
  profiles: {
    'test-profile-1': {
      name: 'Test Profile',
      description: 'Profile for testing',
      builds: {
        space: {
          keys: {
            'F1': {
              commands: [
                { id: 1, command: 'FireAll', delay: 0 }
              ]
            },
            'F2': {
              commands: [
                { id: 2, command: 'FirePhasers', delay: 0 }
              ]
            }
          },
          aliases: {}
        },
        ground: {
          keys: {},
          aliases: {}
        }
      },
      currentEnvironment: 'space',
      created: '2024-01-01T00:00:00.000Z',
      lastModified: '2024-01-01T00:00:00.000Z'
    }
  },
  currentProfile: 'test-profile-1',
  settings: {
    theme: 'dark',
    autoSave: true
  }
}

export const complexProfile = {
  profiles: {
    'complex-profile': {
      name: 'Complex Test Profile',
      description: 'Profile with multiple commands and aliases',
      builds: {
        space: {
          keys: {
            'Space': {
              commands: [
                { id: 1, command: 'FireAll', delay: 0 },
                { id: 2, command: '+TrayExecByTray 0 0', delay: 500 },
                { id: 3, command: 'FireTorps', delay: 1000 }
              ]
            },
            'Tab': {
              commands: [
                { id: 4, command: 'Target_Enemy_Near', delay: 0 }
              ]
            }
          },
          aliases: {
            'FireSequence': '+TrayExecByTray 0 0$$+TrayExecByTray 0 1$$+TrayExecByTray 0 2'
          }
        },
        ground: {
          keys: {
            'Space': {
              commands: [
                { id: 5, command: 'Jump', delay: 0 }
              ]
            }
          },
          aliases: {}
        }
      },
      currentEnvironment: 'space',
      created: '2024-01-01T00:00:00.000Z',
      lastModified: '2024-01-01T00:00:00.000Z'
    }
  },
  currentProfile: 'complex-profile',
  settings: {
    theme: 'light',
    autoSave: false
  }
}

export const emptyProfile = {
  profiles: {
    'empty-profile': {
      name: 'Empty Profile',
      description: 'Empty profile for testing',
      builds: {
        space: {
          keys: {},
          aliases: {}
        },
        ground: {
          keys: {},
          aliases: {}
        }
      },
      currentEnvironment: 'space',
      created: '2024-01-01T00:00:00.000Z',
      lastModified: '2024-01-01T00:00:00.000Z'
    }
  },
  currentProfile: 'empty-profile',
  settings: {
    theme: 'dark',
    autoSave: true
  }
}

export const multiProfile = {
  profiles: {
    'profile-1': {
      name: 'Profile One',
      description: 'First test profile',
      builds: {
        space: {
          keys: { 'F1': { commands: [{ id: 1, command: 'FireAll', delay: 0 }] } },
          aliases: {}
        },
        ground: {
          keys: {},
          aliases: {}
        }
      },
      currentEnvironment: 'space',
      created: '2024-01-01T00:00:00.000Z',
      lastModified: '2024-01-01T00:00:00.000Z'
    },
    'profile-2': {
      name: 'Profile Two',
      description: 'Second test profile',
      builds: {
        space: {
          keys: { 'F2': { commands: [{ id: 2, command: 'FirePhasers', delay: 0 }] } },
          aliases: {}
        },
        ground: {
          keys: {},
          aliases: {}
        }
      },
      currentEnvironment: 'space',
      created: '2024-01-02T00:00:00.000Z',
      lastModified: '2024-01-02T00:00:00.000Z'
    }
  },
  currentProfile: 'profile-1',
  settings: {
    theme: 'dark',
    autoSave: true
  }
} 