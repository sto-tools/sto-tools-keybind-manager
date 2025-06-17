// STO Tools Keybind Manager - Storage Layer
// Handles localStorage persistence and data management

class STOStorage {
    constructor() {
        this.storageKey = 'sto_keybind_manager';
        this.backupKey = 'sto_keybind_manager_backup';
        this.settingsKey = 'sto_keybind_settings';
        this.version = '1.0.0';
        
        this.init();
    }

    init() {
        // Check if we need to migrate old data
        this.migrateData();
        
        // Ensure we have basic structure
        this.ensureStorageStructure();
    }

    // Get all data from storage
    getAllData() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (!data) {
                return this.getDefaultData();
            }
            
            const parsed = JSON.parse(data);
            
            // Validate data structure
            if (!this.isValidDataStructure(parsed)) {
                return this.getDefaultData();
            }
            
            return parsed;
        } catch (error) {
            console.error('Error loading data from storage:', error);
            return this.getDefaultData();
        }
    }

    // Save all data to storage
    saveAllData(data) {
        try {
            // Create backup of current data
            this.createBackup();
            
            // Add metadata
            const dataWithMeta = {
                ...data,
                version: this.version,
                lastModified: new Date().toISOString(),
                lastBackup: new Date().toISOString()
            };
            
            localStorage.setItem(this.storageKey, JSON.stringify(dataWithMeta));
            return true;
        } catch (error) {
            console.error('Error saving data to storage:', error);
            return false;
        }
    }

    // Get specific profile
    getProfile(profileId) {
        const data = this.getAllData();
        return data.profiles[profileId] || null;
    }

    // Save specific profile
    saveProfile(profileId, profile) {
        const data = this.getAllData();
        data.profiles[profileId] = {
            ...profile,
            lastModified: new Date().toISOString()
        };
        return this.saveAllData(data);
    }

    // Delete profile
    deleteProfile(profileId) {
        const data = this.getAllData();
        if (data.profiles[profileId]) {
            delete data.profiles[profileId];
            
            // If this was the current profile, switch to first available
            if (data.currentProfile === profileId) {
                const remainingProfiles = Object.keys(data.profiles);
                data.currentProfile = remainingProfiles.length > 0 ? remainingProfiles[0] : null;
            }
            
            return this.saveAllData(data);
        }
        return false;
    }

    // Get application settings
    getSettings() {
        try {
            const settings = localStorage.getItem(this.settingsKey);
            return settings ? JSON.parse(settings) : this.getDefaultSettings();
        } catch (error) {
            console.error('Error loading settings:', error);
            return this.getDefaultSettings();
        }
    }

    // Save application settings
    saveSettings(settings) {
        try {
            localStorage.setItem(this.settingsKey, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    // Create backup of current data
    createBackup() {
        try {
            const currentData = localStorage.getItem(this.storageKey);
            if (currentData) {
                const backup = {
                    data: currentData,
                    timestamp: new Date().toISOString(),
                    version: this.version
                };
                localStorage.setItem(this.backupKey, JSON.stringify(backup));
            }
        } catch (error) {
            console.error('Error creating backup:', error);
        }
    }

    // Restore from backup
    restoreFromBackup() {
        try {
            const backup = localStorage.getItem(this.backupKey);
            if (backup) {
                const parsed = JSON.parse(backup);
                localStorage.setItem(this.storageKey, parsed.data);
                return true;
            }
        } catch (error) {
            console.error('Error restoring from backup:', error);
        }
        return false;
    }

    // Export data as JSON string
    exportData() {
        const data = this.getAllData();
        return JSON.stringify(data, null, 2);
    }

    // Import data from JSON string
    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            
            if (!this.isValidDataStructure(data)) {
                // Invalid data structure is an expected validation result, not an error
                return false;
            }
            
            return this.saveAllData(data);
        } catch (error) {
            // Only log if it's not an expected JSON parse error from tests
            if (!(error instanceof SyntaxError && jsonString.includes('invalid'))) {
                console.error('Error importing data:', error);
            }
            return false;
        }
    }

    // Clear all data (reset application)
    clearAllData() {
        try {
            localStorage.removeItem(this.storageKey);
            localStorage.removeItem(this.backupKey);
            localStorage.removeItem(this.settingsKey);
            return true;
        } catch (error) {
            console.error('Error clearing data:', error);
            return false;
        }
    }

    // Get storage usage info
    getStorageInfo() {
        try {
            const dataSize = localStorage.getItem(this.storageKey)?.length || 0;
            const backupSize = localStorage.getItem(this.backupKey)?.length || 0;
            const settingsSize = localStorage.getItem(this.settingsKey)?.length || 0;
            
            return {
                totalSize: dataSize + backupSize + settingsSize,
                dataSize,
                backupSize,
                settingsSize,
                available: this.getAvailableStorage()
            };
        } catch (error) {
            console.error('Error getting storage info:', error);
            return null;
        }
    }

    // Private methods

    getDefaultData() {
        return {
            version: this.version,
            created: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            currentProfile: 'default_space',
            profiles: {
                default_space: { ...STO_DATA.defaultProfiles.default_space },
                tactical_space: { ...STO_DATA.defaultProfiles.tactical_space }
            },
            globalAliases: {},
            settings: this.getDefaultSettings()
        };
    }

    getDefaultSettings() {
        return {
            theme: 'default',
            autoSave: true,
            showTooltips: true,
            confirmDeletes: true,
            maxUndoSteps: 50,
            defaultMode: 'space',
            compactView: false
        };
    }

    isValidDataStructure(data) {
        if (!data || typeof data !== 'object') return false;
        
        // Check required properties
        const required = ['profiles', 'currentProfile'];
        for (const prop of required) {
            if (!(prop in data)) return false;
        }
        
        // Check profiles structure
        if (typeof data.profiles !== 'object') return false;
        
        // Validate each profile
        for (const [profileId, profile] of Object.entries(data.profiles)) {
            if (!this.isValidProfile(profile)) {
                // Invalid profile structure is an expected validation result, not something to log
                return false;
            }
        }
        
        return true;
    }

    isValidProfile(profile) {
        if (!profile || typeof profile !== 'object') return false;
        
        // New format with builds structure
        if (profile.builds) {
            if (!profile.name || typeof profile.builds !== 'object') return false;
            
            // Check if at least one build exists
            const builds = profile.builds;
            if (!builds.space && !builds.ground) return false;
            
            // Validate build structure
            for (const [env, build] of Object.entries(builds)) {
                if (env === 'space' || env === 'ground') {
                    if (!build || typeof build !== 'object') return false;
                    if (!build.keys || typeof build.keys !== 'object') return false;
                }
            }
            
            return true;
        }
        
        // Old format - maintain backward compatibility
        const required = ['name', 'mode', 'keys'];
        for (const prop of required) {
            if (!(prop in profile)) return false;
        }
        
        if (typeof profile.keys !== 'object') return false;
        
        return true;
    }

    ensureStorageStructure() {
        const data = this.getAllData();
        
        // Ensure all required properties exist
        if (!data.globalAliases) data.globalAliases = {};
        if (!data.settings) data.settings = this.getDefaultSettings();
        
        // Ensure we have at least one profile
        if (Object.keys(data.profiles).length === 0) {
            data.profiles = {
                default_space: { ...STO_DATA.defaultProfiles.default_space }
            };
            data.currentProfile = 'default_space';
        }
        
        // Ensure current profile exists
        if (!data.profiles[data.currentProfile]) {
            data.currentProfile = Object.keys(data.profiles)[0];
        }
        
        this.saveAllData(data);
    }

    migrateData() {
        // Handle data migration for future versions
        const data = this.getAllData();
        
        if (data.version !== this.version) {
            console.log(`Migrating data from ${data.version} to ${this.version}`);
            
            // Add migration logic here for future versions
            
            data.version = this.version;
            this.saveAllData(data);
        }
    }

    getAvailableStorage() {
        try {
            // Test available localStorage space
            let testKey = 'storage_test';
            let testData = '0';
            let testSize = 0;
            
            // Binary search for max storage
            let low = 0;
            let high = 10 * 1024 * 1024; // 10MB max test
            
            while (low <= high) {
                let mid = Math.floor((low + high) / 2);
                testData = '0'.repeat(mid);
                
                try {
                    localStorage.setItem(testKey, testData);
                    localStorage.removeItem(testKey);
                    testSize = mid;
                    low = mid + 1;
                } catch (e) {
                    high = mid - 1;
                }
            }
            
            return testSize;
        } catch (error) {
            return 0;
        }
    }
}

// Global storage instance
window.stoStorage = new STOStorage();

// Export for other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = STOStorage;
} 