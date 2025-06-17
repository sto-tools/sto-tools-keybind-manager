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
        expect(aliasManager).toBeDefined();
        expect(aliasManager.constructor.name).toBe('STOAliasManager');
    });

    it('should perform all alias management operations correctly', () => {
        // Test alias templates
        const templates = aliasManager.getAliasTemplates();
        expect(templates).toBeDefined();
        expect(typeof templates).toBe('object');
        
        // Test alias validation
        const validResult = aliasManager.validateAlias('test_alias', 'target $$ fire_all');
        expect(validResult.valid).toBe(true);
        
        const invalidResult = aliasManager.validateAlias('', 'target');
        expect(invalidResult.valid).toBe(false);
        expect(invalidResult.error).toBeDefined();
        
        // Test alias save and edit operations
        const testAlias = { name: 'test_alias', commands: 'target $$ fire_all' };
        const saveResult = aliasManager.saveAlias('test_alias', testAlias);
        expect(saveResult).toBeDefined();
        
        const editResult = aliasManager.editAlias('test_alias', testAlias);
        expect(editResult).toBeDefined();
        
        // Test alias deletion
        const deleteResult = aliasManager.deleteAlias('test_alias');
        expect(deleteResult).toBeDefined();
        
        // Test alias export
        const exportResult = aliasManager.exportAliases({ 'test_alias': testAlias });
        expect(exportResult).toBeDefined();
        expect(typeof exportResult).toBe('string');
        
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
        expect(templates).toBeDefined();
        expect(typeof templates).toBe('object');
    });

    it('should have template categories', () => {
        const templates = aliasManager.getAliasTemplates();
        const categories = Object.keys(templates);
        expect(categories.length).toBeGreaterThan(0);
        
        const category = templates[categories[0]];
        expect(category).toBeDefined();
        expect(category.name).toBeDefined();
        expect(category.description).toBeDefined();
        expect(category.templates).toBeDefined();
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
        expect(invalidNameResult.error).toBeDefined();

        // Test invalid commands
        const invalidCommandResult = aliasManager.validateAlias('test', '');
        expect(invalidCommandResult.valid).toBeFalsy();
        expect(invalidCommandResult.error).toBeDefined();
    });
}); 