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