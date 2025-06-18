/**
 * Unit Tests for export.js
 * Tests export functionality and file generation
 */

describe('Export Module', () => {
    // This is just a container - no tests here
});

describe('ExportManager Class', () => {
    let exportManager;

    beforeAll(() => {
        if (typeof window.stoExport === 'undefined') {
            throw new Error('Export module not loaded');
        }
    });

    beforeEach(() => {
        exportManager = window.stoExport;
    });

    it('should create ExportManager instance', () => {
        expect(exportManager).toBeInstanceOf(Object);
        expect(exportManager.constructor.name).toBe('STOExportManager');
    });

    it('should perform all export operations correctly', () => {
        const testProfile = {
            name: 'Test Profile',
            keys: { 'a': [{ command: 'Target', type: 'targeting' }] },
            aliases: { 'attack': { commands: 'Target_Enemy_Near $$ FireAll' } }
        };
        
        // Test STO keybind file generation
        const stoContent = exportManager.generateSTOKeybindFile(testProfile);
        expect(typeof stoContent).toBe('string');
        expect(stoContent).toContain('Test Profile');
        expect(stoContent).toContain('a "Target"');
        
        // Test JSON profile export
        const jsonProfile = exportManager.exportJSONProfile(testProfile);
        expect(typeof jsonProfile).toBe('string');
        const parsed = JSON.parse(jsonProfile);
        expect(parsed.name).toBe('Test Profile');
        
        // Test CSV data export
        const csvData = exportManager.exportCSVData(testProfile);
        expect(typeof csvData).toBe('string');
        expect(csvData).toContain('Key,Command,Type');
        
        // Test HTML report generation
        const htmlReport = exportManager.exportHTMLReport(testProfile);
        expect(typeof htmlReport).toBe('string');
        expect(htmlReport).toContain('<html>');
        expect(htmlReport).toContain('Test Profile');
        
        // Test filename generation
        const filename = exportManager.generateFileName(testProfile, 'txt');
        expect(typeof filename).toBe('string');
        expect(filename).toContain('.txt');
        
        // Test profile sanitization
        const sanitized = exportManager.sanitizeProfileForExport(testProfile);
        expect(sanitized).toBeDefined();
        expect(sanitized.name).toBe(testProfile.name);
        
        // Test JSON import
        const importResult = exportManager.importJSONFile(jsonProfile);
        expect(importResult).toBeDefined();
        expect(importResult.name).toBe(testProfile.name);
        
        // Test STO file export (full process)
        const exportResult = exportManager.exportSTOKeybindFile(testProfile);
        expect(exportResult).toBeDefined();
    });
});

describe('STO File Generation', () => {
    let exportManager;
    let sampleProfile;

    beforeAll(() => {
        if (typeof window.stoExport === 'undefined') {
            throw new Error('Export module not loaded');
        }
    });

    beforeEach(() => {
        exportManager = window.stoExport;
        
        // Create sample profile for testing
        sampleProfile = {
            name: 'Test Profile',
            description: 'A test profile',
            mode: 'space',
            keys: {
                'a': [{ command: 'target', type: 'targeting' }],
                'b': [{ command: 'fire_all', type: 'combat' }]
            },
            aliases: {
                'attack': {
                    name: 'Attack Sequence',
                    commands: 'target $$ fire_all',
                    description: 'Target and attack'
                }
            }
        };
    });

    it('should generate STO keybind file content', () => {
        const content = exportManager.generateSTOKeybindFile(sampleProfile);
        expect(typeof content).toBe('string');
        expect(content.length).toBeGreaterThan(0);
        expect(content).toContain('; Test Profile - STO Keybind Configuration');
    });

    it('should generate file header', () => {
        const header = exportManager.generateFileHeader(sampleProfile);
        expect(typeof header).toBe('string');
        expect(header).toContain(sampleProfile.name);
    });

    it('should generate filename', () => {
        const filename = exportManager.generateFileName(sampleProfile, 'txt');
        expect(typeof filename).toBe('string');
        expect(filename).toContain('.txt');
    });
});

describe('Profile Sanitization', () => {
    let exportManager;

    beforeAll(() => {
        if (typeof window.stoExport === 'undefined') {
            throw new Error('Export module not loaded');
        }
    });

    beforeEach(() => {
        exportManager = window.stoExport;
    });

    it('should sanitize profile for export', () => {
        const profile = {
            name: 'Test Profile',
            keys: { 'a': [{ command: 'target' }] },
            internalData: 'should be removed'
        };

        const sanitized = exportManager.sanitizeProfileForExport(profile);
        expect(sanitized).toBeDefined();
        expect(sanitized.name).toBe(profile.name);
        expect(sanitized.keys).toBeDefined();
    });
});

describe('Export Comment Syntax', () => {
    let exportManager;

    beforeAll(() => {
        if (typeof window.stoExport === 'undefined') {
            throw new Error('Export module not loaded');
        }
    });

    beforeEach(() => {
        exportManager = window.stoExport;
    });

    it('should use semicolon comment syntax in exported files', () => {
        const testProfile = {
            name: 'Test Profile',
            mode: 'space',
            keys: {
                'space': [{ command: 'FireAll', type: 'combat', id: 'cmd1' }],
                'f1': [{ command: '+STOTrayExecByTray 0 5', type: 'tray', id: 'cmd2' }]
            },
            aliases: {}
        };

        const exportResult = exportManager.generateSTOKeybindFile(testProfile);
        
        if (exportResult && typeof exportResult === 'string') {
            // Check that comments use semicolon syntax instead of hash
            const lines = exportResult.split('\n');
            const commentLines = lines.filter(line => line.trim().startsWith(';'));
            
            // Should have comments with semicolon syntax
            expect(commentLines.length).toBeGreaterThan(0);
            
            // Should not have hash comments in command documentation
            const hashCommentLines = lines.filter(line => line.trim().startsWith('#') && !line.includes('bind'));
            expect(hashCommentLines.length).toBe(0);
        }
    });

    it('should maintain proper command documentation format', () => {
        const testProfile = {
            name: 'Documentation Test',
            mode: 'space',
            keys: {
                't': [{ command: 'Target_Enemy_Near', type: 'targeting', id: 'cmd1' }]
            },
            aliases: {}
        };

        const exportResult = exportManager.generateSTOKeybindFile(testProfile);
        
        if (exportResult && typeof exportResult === 'string') {
            // Check that the export contains proper bind format
            expect(exportResult).toContain('bind');
            
            // Check for consistent comment style
            const lines = exportResult.split('\n');
            const commentLines = lines.filter(line => line.trim().startsWith(';'));
            
            commentLines.forEach(line => {
                // Comments should start with semicolon
                expect(line.trim().charAt(0)).toBe(';');
            });
        }
    });

    it('should preserve existing export functionality after comment syntax change', () => {
        const testProfile = {
            name: 'Functionality Test',
            keys: { 'a': [{ command: 'Target', type: 'targeting' }] }
        };
        
        // Test that basic export methods work correctly
        const stoContent = exportManager.generateSTOKeybindFile(testProfile);
        expect(typeof stoContent).toBe('string');
        expect(stoContent).toContain('Functionality Test');
        
        const jsonContent = exportManager.exportJSONProfile(testProfile);
        expect(typeof jsonContent).toBe('string');
        const parsed = JSON.parse(jsonContent);
        expect(parsed.name).toBe('Functionality Test');
        
        // Test helper methods if they exist
        if (typeof exportManager.generateBindCommand === 'function') {
            const bindCommand = exportManager.generateBindCommand('a', 'Target');
            expect(typeof bindCommand).toBe('string');
            expect(bindCommand).toContain('a');
            expect(bindCommand).toContain('Target');
        }
        
        if (typeof exportManager.formatComment === 'function') {
            const comment = exportManager.formatComment('Test comment');
            expect(typeof comment).toBe('string');
            expect(comment).toContain('Test comment');
        }
    });
}); 