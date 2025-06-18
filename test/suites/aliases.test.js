/**
 * Unit Tests for aliases.js
 * Tests alias UI management and operations
 */

describe('Aliases Module', () => {
    // This is just a container - no tests here
});

describe('AliasManager Class', () => {
    let aliasManager;

    beforeAll(() => {
        if (typeof window.stoAliases === 'undefined') {
            throw new Error('Aliases module not loaded');
        }
    });

    beforeEach(() => {
        aliasManager = window.stoAliases;
    });

    it('should create AliasManager instance', () => {
        expect(aliasManager).toBeInstanceOf(Object);
        expect(aliasManager.constructor.name).toBe('STOAliasManager');
    });

    it('should perform all alias management operations correctly', () => {
        // Test alias templates
        const templates = aliasManager.getAliasTemplates();
        expect(typeof templates).toBe('object');
        expect(Object.keys(templates).length).toBeGreaterThan(0);
        
        // Test alias validation
        const validResult = aliasManager.validateAlias('test_alias', 'target $$ fire_all');
        expect(validResult.valid).toBe(true);
        
        const invalidResult = aliasManager.validateAlias('', 'target');
        expect(invalidResult.valid).toBe(false);
        expect(typeof invalidResult.error).toBe('string');
        expect(invalidResult.error.length).toBeGreaterThan(0);
        
        // Test alias save and edit operations
        const testAlias = { name: 'test_alias', commands: 'target $$ fire_all' };
        const saveResult = aliasManager.saveAlias('test_alias', testAlias);
        expect(saveResult).toBeTruthy();
        
        const editResult = aliasManager.editAlias('test_alias', testAlias);
        expect(editResult).toBeTruthy();
        
        // Test alias deletion
        const deleteResult = aliasManager.deleteAlias('test_alias');
        expect(deleteResult).toBeTruthy();
        
        // Test alias export
        const exportResult = aliasManager.exportAliases({ 'test_alias': testAlias });
        expect(typeof exportResult).toBe('string');
        expect(exportResult.length).toBeGreaterThan(0);
        
        // Test UI operations actually show modals/UI
        aliasManager.showAliasManager();
        const aliasManagerModal = document.querySelector('#aliasModal, .alias-modal, .modal');
        expect(aliasManagerModal).not.toBeNull();
        expect(aliasManagerModal.style.display).not.toBe('none');
        
        aliasManager.showEditAliasModal('test_alias');
        const editAliasModal = document.querySelector('#editAliasModal, .edit-alias-modal, .modal');
        expect(editAliasModal).not.toBeNull();
        expect(editAliasModal.style.display).not.toBe('none');
    });
});

describe('Alias Templates', () => {
    let aliasManager;

    beforeAll(() => {
        if (typeof window.stoAliases === 'undefined') {
            throw new Error('Aliases module not loaded');
        }
    });

    beforeEach(() => {
        aliasManager = window.stoAliases;
    });

    it('should provide alias templates', () => {
        const templates = aliasManager.getAliasTemplates();
        expect(typeof templates).toBe('object');
        expect(Object.keys(templates).length).toBeGreaterThan(0);
    });

    it('should have template categories', () => {
        const templates = aliasManager.getAliasTemplates();
        const categories = Object.keys(templates);
        expect(categories.length).toBeGreaterThan(0);
        
        const category = templates[categories[0]];
        expect(category).toEqual(expect.objectContaining({
            name: expect.any(String),
            description: expect.any(String),
            templates: expect.any(Object)
        }));
    });
});

describe('Alias Validation', () => {
    let aliasManager;

    beforeAll(() => {
        if (typeof window.stoAliases === 'undefined') {
            throw new Error('Aliases module not loaded');
        }
    });

    beforeEach(() => {
        aliasManager = window.stoAliases;
    });

    it('should validate alias names and commands', () => {
        // Test valid alias
        const validResult = aliasManager.validateAlias('test_alias', 'target $$ fire_all');
        expect(validResult.valid).toBeTruthy();

        // Test invalid alias name
        const invalidNameResult = aliasManager.validateAlias('', 'target');
        expect(invalidNameResult.valid).toBeFalsy();
        expect(typeof invalidNameResult.error).toBe('string');
        expect(invalidNameResult.error.length).toBeGreaterThan(0);

        // Test invalid commands
        const invalidCommandResult = aliasManager.validateAlias('test', '');
        expect(invalidCommandResult.valid).toBeFalsy();
        expect(typeof invalidCommandResult.error).toBe('string');
        expect(invalidCommandResult.error.length).toBeGreaterThan(0);
    });
}); 