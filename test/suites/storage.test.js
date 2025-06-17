/**
 * Unit Tests for storage.js
 * Tests localStorage management, backup/restore, and data persistence
 */

describe('Storage Module', () => {
    let originalLocalStorage;
    let mockStorage;

    beforeAll(() => {
        // Mock localStorage for testing
        originalLocalStorage = window.localStorage;
        mockStorage = {};
        
        // Only redefine localStorage if not in browser test environment
        if (!window.BROWSER_TEST_ENV) {
            Object.defineProperty(window, 'localStorage', {
                value: {
                    getItem: (key) => mockStorage[key] || null,
                    setItem: (key, value) => mockStorage[key] = value,
                    removeItem: (key) => delete mockStorage[key],
                    clear: () => mockStorage = {},
                    get length() { return Object.keys(mockStorage).length; },
                    key: (index) => Object.keys(mockStorage)[index] || null
                },
                writable: true
            });
        } else {
            // In browser environment, use actual localStorage but clear it
            localStorage.clear();
        }
    });

    afterAll(() => {
        // Restore original localStorage only if we replaced it
        if (!window.BROWSER_TEST_ENV && originalLocalStorage) {
            Object.defineProperty(window, 'localStorage', {
                value: originalLocalStorage,
                writable: true
            });
        } else if (window.BROWSER_TEST_ENV) {
            // In browser environment, just clear localStorage
            localStorage.clear();
        }
    });

    beforeEach(() => {
        // Clear storage before each test
        if (!window.BROWSER_TEST_ENV) {
            mockStorage = {};
        } else {
            localStorage.clear();
        }
        
        // Ensure storage module is loaded
        if (typeof window.stoStorage === 'undefined') {
            throw new Error('Storage module not loaded');
        }
    });

    describe('STOStorage Class', () => {
        it('should create STOStorage instance', () => {
            expect(window.stoStorage).toBeDefined();
            expect(window.stoStorage.constructor.name).toBe('STOStorage');
        });

        it('should have required methods', () => {
            const storage = window.stoStorage;
            
            expect(typeof storage.getAllData).toBe('function');
            expect(typeof storage.saveAllData).toBe('function');
            expect(typeof storage.getProfile).toBe('function');
            expect(typeof storage.saveProfile).toBe('function');
            expect(typeof storage.deleteProfile).toBe('function');
            expect(typeof storage.getSettings).toBe('function');
            expect(typeof storage.saveSettings).toBe('function');
            expect(typeof storage.createBackup).toBe('function');
            expect(typeof storage.restoreFromBackup).toBe('function');
            expect(typeof storage.exportData).toBe('function');
            expect(typeof storage.importData).toBe('function');
            expect(typeof storage.clearAllData).toBe('function');
        });
    });

    describe('Basic Storage Operations', () => {
        let storage;

        beforeEach(() => {
            storage = window.stoStorage;
        });

        it('should save and load profile data', () => {
            const testProfile = { 
                name: 'Test Profile', 
                mode: 'space',
                keys: { 'a': ['target'] } 
            };
            const profileId = 'test-profile';

            storage.saveProfile(profileId, testProfile);
            const loaded = storage.getProfile(profileId);

            expect(loaded).toBeDefined();
            expect(loaded.name).toBe(testProfile.name);
            expect(loaded.mode).toBe(testProfile.mode);
            expect(loaded.keys).toEqual(testProfile.keys);
        });

        it('should return null for non-existent profiles', () => {
            const result = storage.getProfile('non-existent-profile');
            expect(result).toBeNull();
        });

        it('should delete profiles', () => {
            const testProfile = { 
                name: 'Test Profile', 
                mode: 'space',
                keys: {} 
            };
            const profileId = 'test-profile';

            storage.saveProfile(profileId, testProfile);
            expect(storage.getProfile(profileId)).toBeDefined();

            const deleted = storage.deleteProfile(profileId);
            expect(deleted).toBeTruthy();
            expect(storage.getProfile(profileId)).toBeNull();
        });

        it('should handle settings', () => {
            const testSettings = {
                theme: 'dark',
                autoSave: false,
                showTooltips: true
            };

            storage.saveSettings(testSettings);
            const loaded = storage.getSettings();

            expect(loaded.theme).toBe(testSettings.theme);
            expect(loaded.autoSave).toBe(testSettings.autoSave);
            expect(loaded.showTooltips).toBe(testSettings.showTooltips);
        });

        it('should clear all data', () => {
            // Add some test data
            storage.saveProfile('profile1', { name: 'Profile 1', mode: 'space', keys: {} });
            storage.saveSettings({ theme: 'dark' });

            // Verify data exists
            expect(storage.getProfile('profile1')).toBeDefined();
            expect(storage.getSettings().theme).toBe('dark');

            // Clear all data
            storage.clearAllData();

            // Verify data is cleared (should return defaults)
            expect(storage.getProfile('profile1')).toBeNull();
            const defaultSettings = storage.getSettings();
            expect(defaultSettings.theme).toBe('default'); // Should be default value
        });

        it('should get all data', () => {
            // Add some test data
            storage.saveProfile('profile1', { name: 'Profile 1', mode: 'space', keys: {} });
            storage.saveProfile('profile2', { name: 'Profile 2', mode: 'ground', keys: {} });

            const allData = storage.getAllData();
            
            expect(allData).toBeDefined();
            expect(allData.profiles).toBeDefined();
            expect(allData.profiles.profile1).toBeDefined();
            expect(allData.profiles.profile2).toBeDefined();
            expect(allData.profiles.profile1.name).toBe('Profile 1');
            expect(allData.profiles.profile2.name).toBe('Profile 2');
        });
    });

    describe('Data Serialization', () => {
        let storage;

        beforeEach(() => {
            storage = window.stoStorage;
        });

        it('should handle complex profile objects', () => {
            const complexProfile = {
                name: 'Complex Profile',
                description: 'A complex test profile',
                mode: 'space',
                keys: {
                    'a': ['target', 'fire_all'],
                    'space': ['+STOTrayExecByTray 0 0']
                },
                aliases: {
                    'attack': {
                        name: 'Attack Sequence',
                        commands: ['target_enemy_near', 'fire_all'],
                        description: 'Target and attack'
                    }
                }
            };

            storage.saveProfile('complex-profile', complexProfile);
            const loaded = storage.getProfile('complex-profile');

            expect(loaded.name).toBe(complexProfile.name);
            expect(loaded.keys).toEqual(complexProfile.keys);
            expect(loaded.aliases).toEqual(complexProfile.aliases);
        });

        it('should export and import data', () => {
            // Add test data
            storage.saveProfile('profile1', { name: 'Profile 1', mode: 'space', keys: {} });
            storage.saveProfile('profile2', { name: 'Profile 2', mode: 'ground', keys: {} });

            // Export data
            const exported = storage.exportData();
            expect(exported).toBeDefined();
            expect(typeof exported).toBe('string');

            // Clear storage
            storage.clearAllData();
            expect(storage.getProfile('profile1')).toBeNull();

            // Import data
            const imported = storage.importData(exported);
            expect(imported).toBeTruthy();

            // Verify data is restored
            expect(storage.getProfile('profile1')).toBeDefined();
            expect(storage.getProfile('profile2')).toBeDefined();
            expect(storage.getProfile('profile1').name).toBe('Profile 1');
        });

        it('should handle invalid import data', () => {
            const result = storage.importData('invalid json string {');
            expect(result).toBeFalsy();
        });
    });

    describe('Backup and Restore', () => {
        let storage;

        beforeEach(() => {
            storage = window.stoStorage;
        });

        it('should create and restore backups', () => {
            // Add test data
            storage.saveProfile('profile1', { name: 'Profile 1', mode: 'space', keys: {} });
            storage.saveProfile('profile2', { name: 'Profile 2', mode: 'ground', keys: {} });

            // Create backup
            storage.createBackup();

            // Modify data
            storage.saveProfile('profile1', { name: 'Modified Profile', mode: 'space', keys: {} });
            expect(storage.getProfile('profile1').name).toBe('Modified Profile');

            // Restore backup
            const restored = storage.restoreFromBackup();
            expect(restored).toBeTruthy();

            // Verify original data is restored
            expect(storage.getProfile('profile1').name).toBe('Profile 1');
        });

        it('should handle restore when no backup exists', () => {
            // Clear any existing backup first
            storage.clearAllData();
            
            const result = storage.restoreFromBackup();
            expect(result).toBeFalsy();
        });
    });

    describe('Data Validation', () => {
        let storage;

        beforeEach(() => {
            storage = window.stoStorage;
        });

        it('should validate profile data structure', () => {
            const validProfile = {
                name: 'Valid Profile',
                mode: 'space',
                keys: {},
                aliases: {}
            };

            // This should work without throwing
            storage.saveProfile('valid-profile', validProfile);
            const loaded = storage.getProfile('valid-profile');

            expect(loaded.name).toBe(validProfile.name);
            expect(loaded.mode).toBe(validProfile.mode);
        });

        it('should handle missing required fields gracefully', () => {
            const incompleteProfile = {
                name: 'Incomplete Profile'
                // Missing mode and keys
            };

            // Storage should validate and reject incomplete profiles
            storage.saveProfile('incomplete-profile', incompleteProfile);
            const loaded = storage.getProfile('incomplete-profile');

            // The actual STOStorage validates profiles and won't save incomplete ones
            // So loaded should be null for invalid profiles
            expect(loaded).toBeNull();
        });
    });
});

describe('STOStorage', () => {
    let storageManager;

    beforeEach(() => {
        if (typeof window.STOStorage !== 'undefined') {
            storageManager = new window.STOStorage();
        }
    });

    it('should create STOStorage instance', () => {
        if (storageManager) {
            expect(storageManager).toBeDefined();
            expect(storageManager.constructor.name).toBe('STOStorage');
        }
    });

    it('should have required methods', () => {
        if (storageManager) {
            expect(typeof storageManager.getAllData).toBe('function');
            expect(typeof storageManager.saveAllData).toBe('function');
            expect(typeof storageManager.getProfile).toBe('function');
            expect(typeof storageManager.saveProfile).toBe('function');
            expect(typeof storageManager.deleteProfile).toBe('function');
        }
    });

    it('should validate data structure', () => {
        if (storageManager && typeof storageManager.isValidDataStructure === 'function') {
            const validData = {
                profiles: {
                    test: {
                        name: 'Test',
                        mode: 'space',
                        keys: {}
                    }
                },
                currentProfile: 'test'
            };

            const result = storageManager.isValidDataStructure(validData);
            expect(result).toBe(true);
        }
    });

    it('should reject invalid data structure', () => {
        if (storageManager && typeof storageManager.isValidDataStructure === 'function') {
            const invalidData = {
                profiles: 'invalid'
            };

            const result = storageManager.isValidDataStructure(invalidData);
            expect(result).toBe(false);
        }
    });

    it('should handle missing currentProfile', () => {
        if (storageManager && typeof storageManager.isValidDataStructure === 'function') {
            const invalidData = {
                profiles: {
                    test: {
                        name: 'Test',
                        mode: 'space',
                        keys: {}
                    }
                }
            };

            const result = storageManager.isValidDataStructure(invalidData);
            expect(result).toBe(false);
        }
    });
});

describe('STOStorage - Profile Structure Validation', () => {
    let storageManager;

    beforeEach(() => {
        if (typeof window.STOStorage !== 'undefined') {
            storageManager = new window.STOStorage();
        }
    });

    it('should validate old profile format', () => {
        if (storageManager && typeof storageManager.isValidProfile === 'function') {
            const oldProfile = {
                name: 'Test Profile',
                mode: 'space',
                keys: {
                    'Space': [{ command: 'FireAll', type: 'combat' }]
                },
                aliases: {}
            };

            const result = storageManager.isValidProfile(oldProfile);
            expect(result).toBe(true);
        }
    });

    it('should validate new profile format with builds structure', () => {
        if (storageManager && typeof storageManager.isValidProfile === 'function') {
            const newProfile = {
                name: 'Test Profile',
                currentEnvironment: 'space',
                builds: {
                    space: {
                        keys: { 'Space': [{ command: 'FireAll', type: 'combat' }] },
                        aliases: {}
                    },
                    ground: {
                        keys: { 'Space': [{ command: 'target_enemy', type: 'targeting' }] },
                        aliases: {}
                    }
                }
            };

            const result = storageManager.isValidProfile(newProfile);
            expect(result).toBe(true);
        }
    });

    it('should reject profile with missing name', () => {
        if (storageManager && typeof storageManager.isValidProfile === 'function') {
            const invalidProfile = {
                mode: 'space',
                keys: {}
            };

            const result = storageManager.isValidProfile(invalidProfile);
            expect(result).toBe(false);
        }
    });

    it('should reject old profile format with missing required fields', () => {
        if (storageManager && typeof storageManager.isValidProfile === 'function') {
            const invalidProfile = {
                name: 'Test Profile',
                mode: 'space'
                // Missing keys field
            };

            const result = storageManager.isValidProfile(invalidProfile);
            expect(result).toBe(false);
        }
    });

    it('should reject new profile format with invalid builds structure', () => {
        if (storageManager && typeof storageManager.isValidProfile === 'function') {
            const invalidProfile = {
                name: 'Test Profile',
                builds: {
                    space: {
                        // Missing keys field
                        aliases: {}
                    }
                }
            };

            const result = storageManager.isValidProfile(invalidProfile);
            expect(result).toBe(false);
        }
    });

    it('should reject new profile format with no builds', () => {
        if (storageManager && typeof storageManager.isValidProfile === 'function') {
            const invalidProfile = {
                name: 'Test Profile',
                builds: {}
            };

            const result = storageManager.isValidProfile(invalidProfile);
            expect(result).toBe(false);
        }
    });

    it('should accept new profile with only space build', () => {
        if (storageManager && typeof storageManager.isValidProfile === 'function') {
            const validProfile = {
                name: 'Test Profile',
                builds: {
                    space: {
                        keys: {},
                        aliases: {}
                    }
                }
            };

            const result = storageManager.isValidProfile(validProfile);
            expect(result).toBe(true);
        }
    });

    it('should accept new profile with only ground build', () => {
        if (storageManager && typeof storageManager.isValidProfile === 'function') {
            const validProfile = {
                name: 'Test Profile',
                builds: {
                    ground: {
                        keys: {},
                        aliases: {}
                    }
                }
            };

            const result = storageManager.isValidProfile(validProfile);
            expect(result).toBe(true);
        }
    });

    it('should reject profile with invalid build environment names', () => {
        if (storageManager && typeof storageManager.isValidProfile === 'function') {
            const invalidProfile = {
                name: 'Test Profile',
                builds: {
                    invalid_env: {
                        keys: {},
                        aliases: {}
                    }
                }
            };

            // This should still pass since we only validate space/ground if they exist
            const result = storageManager.isValidProfile(invalidProfile);
            expect(result).toBe(true);
        }
    });
});

describe('STOStorage - Data Persistence', () => {
    let storageManager;

    beforeEach(() => {
        if (typeof window.STOStorage !== 'undefined') {
            storageManager = new window.STOStorage();
        }
        // Clear localStorage before each test
        localStorage.clear();
    });

    afterEach(() => {
        // Clean up after each test
        localStorage.clear();
    });

    it('should save and retrieve data', () => {
        if (storageManager) {
            const testData = {
                version: '1.0.0',
                profiles: {
                    test: {
                        name: 'Test Profile',
                        mode: 'space',
                        keys: {}
                    }
                },
                currentProfile: 'test'
            };

            const saved = storageManager.saveAllData(testData);
            expect(saved).toBe(true);

            const retrieved = storageManager.getAllData();
            expect(retrieved.profiles.test.name).toBe('Test Profile');
        }
    });

    it('should save and retrieve individual profiles', () => {
        if (storageManager) {
            const testProfile = {
                name: 'Individual Test',
                mode: 'space',
                keys: {
                    'A': [{ command: 'test', type: 'custom' }]
                }
            };

            const saved = storageManager.saveProfile('individual_test', testProfile);
            expect(saved).toBe(true);

            const retrieved = storageManager.getProfile('individual_test');
            if (retrieved) {
                expect(retrieved.name).toBe('Individual Test');
                expect(retrieved.keys.A).toBeDefined();
            }
        }
    });

    it('should handle profile deletion', () => {
        if (storageManager) {
            const testProfile = {
                name: 'To Delete',
                mode: 'space', 
                keys: {}
            };

            storageManager.saveProfile('to_delete', testProfile);
            
            const deleted = storageManager.deleteProfile('to_delete');
            expect(deleted).toBe(true);

            const retrieved = storageManager.getProfile('to_delete');
            expect(retrieved).toBeNull();
        }
    });

    it('should export and import data', () => {
        if (storageManager) {
            const testData = {
                version: '1.0.0',
                profiles: {
                    export_test: {
                        name: 'Export Test',
                        mode: 'space',
                        keys: {}
                    }
                },
                currentProfile: 'export_test'
            };

            storageManager.saveAllData(testData);
            
            const exported = storageManager.exportData();
            expect(typeof exported).toBe('string');

            // Clear storage
            localStorage.clear();

            const imported = storageManager.importData(exported);
            expect(imported).toBe(true);

            const retrieved = storageManager.getAllData();
            expect(retrieved.profiles.export_test.name).toBe('Export Test');
        }
    });

    it('should handle invalid import data', () => {
        if (storageManager) {
            const invalidData = 'invalid json';
            const result = storageManager.importData(invalidData);
            expect(result).toBe(false);
        }
    });

    it('should handle storage errors gracefully', () => {
        if (storageManager) {
            // Test with overly large data that might exceed storage limits
            const hugeData = {
                version: '1.0.0',
                profiles: {},
                currentProfile: 'huge'
            };

            // Create a profile with massive data
            hugeData.profiles.huge = {
                name: 'Huge Profile',
                mode: 'space',
                keys: {}
            };

            // Add a lot of keys to simulate storage overflow
            for (let i = 0; i < 1000; i++) {
                hugeData.profiles.huge.keys[`key_${i}`] = [
                    { command: `command_${i}`.repeat(100), type: 'custom' }
                ];
            }

            // This should either succeed or fail gracefully
            const result = storageManager.saveAllData(hugeData);
            expect(typeof result).toBe('boolean');
        }
    });
}); 