// Browser test for project import functionality
import { test, expect } from 'vitest'

test('Project Import from Synced Files', async () => {
  console.log('=== Testing Project Import from Synced Files ===')
  
  // Wait for the app to be fully loaded
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // Create test data that mimics a synced project file
  const testProjectData = {
    version: '1.0.0',
    exported: new Date().toISOString(),
    type: 'project',
    data: {
      version: '1.0.0',
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      currentProfile: 'test_profile',
      profiles: {
        test_profile: {
          name: 'Test Profile',
          description: 'Test profile for import testing',
          currentEnvironment: 'space',
          builds: {
            space: {
              keys: {
                'F1': [{ command: 'FireAll', type: 'combat', id: 'cmd_1' }],
                'F2': [{ command: 'Target_Enemy_Near', type: 'targeting', id: 'cmd_2' }]
              }
            },
            ground: {
              keys: {}
            }
          },
          aliases: {
            'test_alias': {
              name: 'Test Alias',
              commands: ['FireAll', 'Target_Enemy_Near']
            }
          },
          created: new Date().toISOString(),
          lastModified: new Date().toISOString()
        }
      },
      globalAliases: {},
      settings: {
        theme: 'default',
        autoSave: true,
        showTooltips: true,
        confirmDeletes: true,
        maxUndoSteps: 50,
        defaultMode: 'space',
        compactView: false,
        language: 'en',
        syncFolderName: null,
        syncFolderPath: null,
        autoSync: false,
        autoSyncInterval: 'change'
      }
    }
  }
  
  // Test the import functionality
  console.log('Testing project import with wrapped data structure...')
  
  // Simulate the current broken behavior (direct importData call)
  const directImportResult = storageService.importData(JSON.stringify(testProjectData))
  console.log('Direct importData result:', directImportResult)
  
  // Test the correct behavior (using importJSONFile)
  const correctImportResult = stoExport.importJSONFile(JSON.stringify(testProjectData))
  console.log('Correct importJSONFile result:', correctImportResult)
  
  // The direct import should fail, the correct import should succeed
  expect(directImportResult).toBe(false) // Current broken behavior
  expect(correctImportResult).toBe(true) // Expected correct behavior
  
  // Verify the data was actually imported correctly
  if (correctImportResult) {
    const importedData = storageService.getAllData()
    console.log('Imported data profiles:', Object.keys(importedData.profiles))
    expect(importedData.profiles.test_profile).toBeDefined()
    expect(importedData.profiles.test_profile.name).toBe('Test Profile')
    expect(importedData.currentProfile).toBe('test_profile')
  }
  
  console.log('=== Project Import Test Complete ===')
}) 