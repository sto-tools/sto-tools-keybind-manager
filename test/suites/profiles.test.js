/**
 * Unit Tests for profiles.js
 * Tests profile UI management and operations
 */

describe('Profiles Module', () => {
    // This is just a container - no tests here
});

describe('ProfileManager Class', () => {
    let profileManager;

    beforeAll(() => {
        if (typeof window.stoProfiles === 'undefined') {
            throw new Error('Profiles module not loaded');
        }
    });

    beforeEach(() => {
        profileManager = window.stoProfiles;
    });

    it('should create ProfileManager instance', () => {
        expect(profileManager).toBeDefined();
        expect(profileManager.constructor.name).toBe('STOProfileManager');
    });

    it('should perform all profile management operations correctly', () => {
        // Test profile templates
        const templates = profileManager.getProfileTemplates();
        expect(templates).toBeDefined();
        expect(typeof templates).toBe('object');
        expect(Object.keys(templates).length).toBeGreaterThan(0);
        
        // Test profile analysis
        const testProfile = {
            name: 'Test Profile',
            keys: { 'a': [{ command: 'target', type: 'targeting' }] }
        };
        const analysis = profileManager.getProfileAnalysis(testProfile);
        expect(analysis).toBeDefined();
        expect(typeof analysis).toBe('object');
        
        // Test profile export
        const exportResult = profileManager.exportProfile(testProfile);
        expect(exportResult).toBeDefined();
        expect(typeof exportResult).toBe('string');
        
        // Test profile import
        const importResult = profileManager.importProfile(exportResult);
        expect(importResult).toBeDefined();
        expect(importResult.name).toBe(testProfile.name);
        
        // Test profile save handling
        const saveResult = profileManager.handleProfileSave('test-id', testProfile);
        expect(saveResult).toBeDefined();
        
        // Test modal operations actually show modals
        profileManager.showNewProfileModal();
        const newProfileModal = document.querySelector('#newProfileModal, .new-profile-modal, .modal');
        expect(newProfileModal).not.toBeNull();
        expect(newProfileModal.style.display).not.toBe('none');
        
        profileManager.showCloneProfileModal('test-id');
        const cloneModal = document.querySelector('#cloneProfileModal, .clone-profile-modal, .modal');
        expect(cloneModal).not.toBeNull();
        expect(cloneModal.style.display).not.toBe('none');
        
        profileManager.showRenameProfileModal('test-id');
        const renameModal = document.querySelector('#renameProfileModal, .rename-profile-modal, .modal');
        expect(renameModal).not.toBeNull();
        expect(renameModal.style.display).not.toBe('none');
    });
});

describe('Profile Templates', () => {
    let profileManager;

    beforeAll(() => {
        if (typeof window.stoProfiles === 'undefined') {
            throw new Error('Profiles module not loaded');
        }
    });

    beforeEach(() => {
        profileManager = window.stoProfiles;
    });

    it('should provide profile templates', () => {
        const templates = profileManager.getProfileTemplates();
        expect(templates).toBeDefined();
        expect(typeof templates).toBe('object');
        expect(Object.keys(templates).length).toBeGreaterThan(0);
    });

    it('should have template structure', () => {
        const templates = profileManager.getProfileTemplates();
        const templateKeys = Object.keys(templates);
        expect(templateKeys.length).toBeGreaterThan(0);
        
        const template = templates[templateKeys[0]];
        expect(template).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.mode).toBeDefined();
        expect(template.keys).toBeDefined();
    });
});

describe('Profile Analysis', () => {
    let profileManager;

    beforeAll(() => {
        if (typeof window.stoProfiles === 'undefined') {
            throw new Error('Profiles module not loaded');
        }
    });

    beforeEach(() => {
        profileManager = window.stoProfiles;
    });

    it('should analyze profile structure', () => {
        const sampleProfile = {
            name: 'Test Profile',
            keys: {
                'a': [{ command: 'target', type: 'targeting' }],
                'b': [{ command: 'fire_all', type: 'combat' }]
            }
        };

        const analysis = profileManager.getProfileAnalysis(sampleProfile);
        expect(analysis).toBeDefined();
        expect(typeof analysis).toBe('object');
    });

    it('should handle empty profile analysis', () => {
        const emptyProfile = {
            name: 'Empty Profile',
            keys: {}
        };

        const analysis = profileManager.getProfileAnalysis(emptyProfile);
        expect(analysis).toBeDefined();
        expect(typeof analysis).toBe('object');
    });
}); 