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

    it('should have required methods', () => {
        expect(typeof profileManager.showNewProfileModal).toBe('function');
        expect(typeof profileManager.showCloneProfileModal).toBe('function');
        expect(typeof profileManager.showRenameProfileModal).toBe('function');
        expect(typeof profileManager.handleProfileSave).toBe('function');
        expect(typeof profileManager.getProfileAnalysis).toBe('function');
        expect(typeof profileManager.getProfileTemplates).toBe('function');
        expect(typeof profileManager.exportProfile).toBe('function');
        expect(typeof profileManager.importProfile).toBe('function');
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
        if (templateKeys.length > 0) {
            const template = templates[templateKeys[0]];
            expect(template.name).toBeDefined();
            expect(template.description).toBeDefined();
            expect(template.mode).toBeDefined();
            expect(template.keys).toBeDefined();
        }
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