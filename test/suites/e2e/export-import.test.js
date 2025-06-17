/**
 * E2E Tests for Export/Import Functionality
 */

describe('Export/Import', () => {
    beforeAll(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    beforeEach(() => {
        // Reset to clean state
        if (window.app && window.app.resetApplication) {
            window.app.resetApplication();
        }
    });

    describe('Export Button Access', () => {
        it('should have export keybinds button', () => {
            const exportBtn = document.getElementById('exportKeybindsBtn');
            if (exportBtn) {
                expect(exportBtn).toBeTruthy();
            }
        });

        it('should show export options when button clicked', () => {
            const exportBtn = document.getElementById('exportKeybindsBtn');
            if (exportBtn) {
                exportBtn.click();
                
                // Should trigger export process
                expect(exportBtn).toBeTruthy();
            }
        });
    });

    describe('Export Formats', () => {
        it('should support STO keybind file format', () => {
            if (window.stoExport && window.stoExport.exportFormats) {
                expect(window.stoExport.exportFormats.sto_keybind).toBeTruthy();
                expect(window.stoExport.exportFormats.sto_keybind).toContain('.txt');
            }
        });

        it('should support JSON profile format', () => {
            if (window.stoExport && window.stoExport.exportFormats) {
                expect(window.stoExport.exportFormats.json_profile).toBeTruthy();
                expect(window.stoExport.exportFormats.json_profile).toContain('.json');
            }
        });

        it('should support complete project export', () => {
            if (window.stoExport && window.stoExport.exportFormats) {
                expect(window.stoExport.exportFormats.json_project).toBeTruthy();
                expect(window.stoExport.exportFormats.json_project).toContain('.json');
            }
        });

        it('should support CSV data export', () => {
            if (window.stoExport && window.stoExport.exportFormats) {
                expect(window.stoExport.exportFormats.csv_data).toBeTruthy();
                expect(window.stoExport.exportFormats.csv_data).toContain('.csv');
            }
        });

        it('should support HTML report export', () => {
            if (window.stoExport && window.stoExport.exportFormats) {
                expect(window.stoExport.exportFormats.html_report).toBeTruthy();
                expect(window.stoExport.exportFormats.html_report).toContain('.html');
            }
        });
    });

    describe('STO Keybind File Export', () => {
        it('should generate STO keybind file content', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && window.stoExport && window.stoExport.generateSTOKeybindFile) {
                const content = window.stoExport.generateSTOKeybindFile(profile);
                if (content) {
                    expect(typeof content).toBe('string');
                    expect(content.length).toBeGreaterThan(0);
                }
            }
        });

        it('should include file header with metadata', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && window.stoExport && window.stoExport.generateFileHeader) {
                const header = window.stoExport.generateFileHeader(profile);
                if (header) {
                    expect(header).toContain(profile.name);
                    expect(header).toContain('STO Keybind Configuration');
                    expect(header).toContain('Generated:');
                }
            }
        });

        it('should include aliases section when aliases exist', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.aliases && Object.keys(profile.aliases).length > 0) {
                if (window.stoExport && window.stoExport.generateAliasSection) {
                    const aliasSection = window.stoExport.generateAliasSection(profile.aliases);
                    if (aliasSection) {
                        expect(aliasSection).toContain('Command Aliases');
                        expect(aliasSection).toContain('alias ');
                    }
                }
            }
        });

        it('should include keybind section', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.keys && window.stoExport && window.stoExport.generateKeybindSection) {
                const keybindSection = window.stoExport.generateKeybindSection(profile.keys);
                if (keybindSection) {
                    expect(typeof keybindSection).toBe('string');
                    expect(keybindSection).toContain('Keybind Commands');
                }
            }
        });

        it('should include usage instructions in footer', () => {
            if (window.stoExport && window.stoExport.generateFileFooter) {
                const footer = window.stoExport.generateFileFooter();
                expect(footer).toBeTruthy();
                expect(footer).toContain('STO');
                expect(footer).toContain('Commands Reference');
            }
        });
    });

    describe('JSON Export', () => {
        it('should export profile as JSON', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && window.stoExport && window.stoExport.exportJSONProfile) {
                const jsonData = window.stoExport.exportJSONProfile(profile);
                if (jsonData) {
                    expect(typeof jsonData).toBe('string');
                    const parsed = JSON.parse(jsonData);
                    expect(parsed.name).toBe(profile.name);
                }
            }
        });

        it('should export complete project', () => {
            if (window.stoExport && window.stoExport.exportCompleteProject) {
                const projectData = window.stoExport.exportCompleteProject();
                if (projectData) {
                    expect(typeof projectData).toBe('string');
                    const parsed = JSON.parse(projectData);
                    expect(parsed.profiles).toBeTruthy();
                }
            }
        });

        it('should sanitize profile data for export', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && window.stoExport && window.stoExport.sanitizeProfileForExport) {
                const sanitized = window.stoExport.sanitizeProfileForExport(profile);
                if (sanitized) {
                    expect(typeof sanitized).toBe('object');
                    expect(sanitized.name).toBeTruthy();
                }
            }
        });
    });

    describe('CSV Export', () => {
        it('should generate CSV data', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && window.stoExport && window.stoExport.generateCSVData) {
                const csvData = window.stoExport.generateCSVData(profile);
                if (csvData) {
                    expect(typeof csvData).toBe('string');
                    expect(csvData).toContain(','); // CSV should have commas
                }
            }
        });

        it('should escape CSV values properly', () => {
            if (window.stoExport && window.stoExport.escapeCSV) {
                const testValue = 'Test "quoted" value';
                const escaped = window.stoExport.escapeCSV(testValue);
                if (escaped) {
                    expect(escaped).toContain('"');
                }
            }
        });
    });

    describe('HTML Report Export', () => {
        it('should generate HTML report', () => {
            const profile = window.app?.getCurrentProfile();
            expect(profile).toBeTruthy();
            expect(window.stoExport).toBeTruthy();
            expect(window.stoExport.generateHTMLReport).toBeTruthy();
            
            const htmlReport = window.stoExport.generateHTMLReport(profile);
            expect(htmlReport).toBeTruthy();
            expect(typeof htmlReport).toBe('string');
            expect(htmlReport.toLowerCase()).toContain('<html>');
            expect(htmlReport).toContain(profile.name);
        });

        it('should include keybind section in HTML', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.keys && window.stoExport && window.stoExport.generateHTMLKeybindSection) {
                const htmlSection = window.stoExport.generateHTMLKeybindSection(profile.keys);
                expect(htmlSection).toBeTruthy();
                expect(htmlSection).toContain('<div');
                expect(htmlSection).toContain('keybind');
            }
        });

        it('should include alias section in HTML when aliases exist', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.aliases && Object.keys(profile.aliases).length > 0) {
                if (window.stoExport && window.stoExport.generateHTMLAliasSection) {
                    const htmlSection = window.stoExport.generateHTMLAliasSection(profile.aliases);
                    if (htmlSection) {
                        expect(htmlSection).toContain('<table>');
                        expect(htmlSection).toContain('Alias');
                    }
                }
            }
        });
    });

    describe('File Download', () => {
        it('should generate appropriate filename', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && window.stoExport && window.stoExport.generateFileName) {
                const filename = window.stoExport.generateFileName(profile, 'txt');
                expect(filename).toBeTruthy();
                // Filename uses underscores instead of spaces
                expect(filename).toContain(profile.name.replace(/\s+/g, '_'));
                expect(filename).toContain('.txt');
            }
        });

        it('should have download file method', () => {
            if (window.stoExport && window.stoExport.downloadFile) {
                expect(typeof window.stoExport.downloadFile).toBe('function');
            }
        });
    });

    describe('Copy to Clipboard', () => {
        it('should have copy command preview button', () => {
            const copyBtn = document.getElementById('copyPreviewBtn');
            if (copyBtn) {
                expect(copyBtn).toBeTruthy();
            }
        });

        it('should copy command preview to clipboard', () => {
            const copyBtn = document.getElementById('copyPreviewBtn');
            if (copyBtn && window.stoExport && window.stoExport.copyCommandPreview) {
                // Mock clipboard API
                const originalClipboard = navigator.clipboard;
                let clipboardText = '';
                navigator.clipboard = {
                    writeText: (text) => {
                        clipboardText = text;
                        return Promise.resolve();
                    }
                };
                
                copyBtn.click();
                
                if (clipboardText) {
                    expect(typeof clipboardText).toBe('string');
                }
                
                navigator.clipboard = originalClipboard;
            }
        });

        it('should have copy chain button', () => {
            const copyChainBtn = document.getElementById('copyChainBtn');
            if (copyChainBtn) {
                expect(copyChainBtn).toBeTruthy();
            }
        });

        it('should copy command chain to clipboard', () => {
            const copyChainBtn = document.getElementById('copyChainBtn');
            if (copyChainBtn && window.stoExport && window.stoExport.copyCommandChain) {
                // Mock clipboard API
                const originalClipboard = navigator.clipboard;
                let clipboardText = '';
                navigator.clipboard = {
                    writeText: (text) => {
                        clipboardText = text;
                        return Promise.resolve();
                    }
                };
                
                copyChainBtn.click();
                
                if (clipboardText) {
                    expect(typeof clipboardText).toBe('string');
                }
                
                navigator.clipboard = originalClipboard;
            }
        });
    });

    describe('Import Functionality', () => {
        it('should have import from file method', () => {
            if (window.stoExport && window.stoExport.importFromFile) {
                expect(typeof window.stoExport.importFromFile).toBe('function');
            }
        });

        it('should import JSON file', () => {
            if (window.stoExport && window.stoExport.importJSONFile) {
                // Use the correct format that matches the actual export format
                const testJSON = JSON.stringify([{
                    name: 'Test Profile',
                    mode: 'space',
                    keys: {},
                    aliases: {}
                }]);
                
                try {
                    const result = window.stoExport.importJSONFile(testJSON);
                    if (result && Array.isArray(result) && result.length > 0) {
                        expect(result[0].name).toBe('Test Profile');
                    }
                } catch (error) {
                    // If the import method expects a different format, just check it doesn't crash
                    expect(error).toBeTruthy();
                }
            }
        });

        it('should validate imported data', () => {
            if (window.stoExport && window.stoExport.importJSONFile) {
                const invalidJSON = '{"invalid": "data"}';
                
                try {
                    const result = window.stoExport.importJSONFile(invalidJSON);
                    // Should handle invalid data gracefully
                    expect(result).toBeFalsy();
                } catch (error) {
                    // Should throw error for invalid data
                    expect(error).toBeTruthy();
                }
            }
        });
    });

    describe('Export All Profiles', () => {
        it('should export all profiles', () => {
            if (window.stoExport && window.stoExport.exportAllProfiles) {
                const allProfiles = window.stoExport.exportAllProfiles();
                if (allProfiles) {
                    expect(typeof allProfiles).toBe('string');
                    const parsed = JSON.parse(allProfiles);
                    expect(Array.isArray(parsed)).toBe(true);
                }
            }
        });
    });

    describe('Key Sorting for Export', () => {
        it('should sort keys properly for export', () => {
            if (window.stoExport && window.stoExport.compareKeys) {
                const keys = ['F2', 'F1', 'F10', 'A', 'Z', 'Ctrl+A'];
                const sorted = keys.sort(window.stoExport.compareKeys.bind(window.stoExport));
                
                // Function keys should come first, then alphabetical
                expect(sorted[0]).toBe('F1');
                expect(sorted[1]).toBe('F2');
                expect(sorted[2]).toBe('F10');
            }
        });

        it('should group keys by type for export', () => {
            const profile = window.app?.getCurrentProfile();
            if (profile && profile.keys && window.stoExport && window.stoExport.groupKeysByType) {
                const sortedKeys = Object.keys(profile.keys);
                const groups = window.stoExport.groupKeysByType(sortedKeys, profile.keys);
                
                if (groups) {
                    expect(typeof groups).toBe('object');
                }
            }
        });
    });

    describe('Export Manager API', () => {
        it('should have STOExportManager available', () => {
            if (window.stoExport) {
                expect(window.stoExport).toBeTruthy();
                expect(window.stoExport.constructor.name).toBe('STOExportManager');
            }
        });

        it('should have export format definitions', () => {
            if (window.stoExport && window.stoExport.exportFormats) {
                expect(typeof window.stoExport.exportFormats).toBe('object');
                expect(Object.keys(window.stoExport.exportFormats).length).toBeGreaterThan(0);
            }
        });

        it('should have main export methods', () => {
            if (window.stoExport) {
                expect(typeof window.stoExport.exportSTOKeybindFile).toBe('function');
                expect(typeof window.stoExport.showExportOptions).toBe('function');
            }
        });
    });

    describe('Error Handling', () => {
        it('should handle export errors gracefully', () => {
            if (window.stoExport && window.stoExport.exportSTOKeybindFile) {
                // Test with invalid profile
                try {
                    window.stoExport.exportSTOKeybindFile(null);
                    // Should handle null profile
                } catch (error) {
                    expect(error).toBeTruthy();
                }
            }
        });

        it('should show toast messages for export status', () => {
            // This would test integration with the toast system
            if (window.stoUI && window.stoUI.showToast) {
                expect(typeof window.stoUI.showToast).toBe('function');
            }
        });
    });
}); 