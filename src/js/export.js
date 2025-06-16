// STO Tools Keybind Manager - Export Functionality
// Handles exporting keybinds and profiles in various formats

class STOExportManager {
    constructor() {
        this.exportFormats = {
            sto_keybind: 'STO Keybind File (.txt)',
            json_profile: 'JSON Profile (.json)',
            json_project: 'Complete Project (.json)',
            csv_data: 'CSV Data (.csv)',
            html_report: 'HTML Report (.html)'
        };
        
        // Don't initialize immediately - wait for app to be ready
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Main export button
        document.getElementById('exportKeybindsBtn')?.addEventListener('click', () => {
            this.showExportOptions();
        });

        // Copy command preview
        document.getElementById('copyPreviewBtn')?.addEventListener('click', () => {
            this.copyCommandPreview();
        });

        // Copy chain button
        document.getElementById('copyChainBtn')?.addEventListener('click', () => {
            this.copyCommandChain();
        });
    }

    // Export Options Dialog
    async showExportOptions() {
        const profile = app.getCurrentProfile();
        if (!profile) {
            stoUI.showToast('No profile selected to export', 'warning');
            return;
        }

        // For now, directly export as STO keybind file
        // TODO: Add export options modal for different formats
        this.exportSTOKeybindFile(profile);
    }

    // STO Keybind File Export
    exportSTOKeybindFile(profile) {
        try {
            const content = this.generateSTOKeybindFile(profile);
            this.downloadFile(content, this.generateFileName(profile, 'txt'), 'text/plain');
            
            stoUI.showToast('Keybind file exported successfully', 'success');
        } catch (error) {
            stoUI.showToast('Failed to export keybind file: ' + error.message, 'error');
        }
    }

    generateSTOKeybindFile(profile) {
        let content = '';
        
        // Header with metadata
        content += this.generateFileHeader(profile);
        
        // Export aliases first (they need to be defined before use)
        if (profile.aliases && Object.keys(profile.aliases).length > 0) {
            content += this.generateAliasSection(profile.aliases);
        }
        
        // Export keybinds
        content += this.generateKeybindSection(profile.keys);
        
        // Footer with usage instructions
        content += this.generateFileFooter();
        
        return content;
    }

    generateFileHeader(profile) {
        const timestamp = new Date().toLocaleString();
        
        // Calculate stats locally if stoKeybinds is not available
        let stats;
        if (typeof stoKeybinds !== 'undefined' && stoKeybinds.getProfileStats) {
            stats = stoKeybinds.getProfileStats(profile);
        } else {
            // Calculate stats locally
            stats = {
                totalKeys: Object.keys(profile.keys || {}).length,
                totalCommands: 0,
                totalAliases: Object.keys(profile.aliases || {}).length
            };
            
            Object.values(profile.keys || {}).forEach(commands => {
                stats.totalCommands += commands.length;
            });
        }
        
        return `; ================================================================
; ${profile.name} - STO Keybind Configuration
; ================================================================
; Mode: ${profile.mode.toUpperCase()}
; Generated: ${timestamp}
; Created by: STO Tools Keybind Manager v${STO_DATA.settings.version}
;
; Profile Statistics:
; - Keys bound: ${stats.totalKeys}
; - Total commands: ${stats.totalCommands}
; - Aliases defined: ${stats.totalAliases}
;
; To use this file in Star Trek Online:
; 1. Save this file to your STO Live folder
; 2. In game, type: /bind_load_file ${this.generateFileName(profile, 'txt')}
; ================================================================

`;
    }

    generateAliasSection(aliases) {
        if (!aliases || Object.keys(aliases).length === 0) {
            return '';
        }

        let content = `# Command Aliases
; ================================================================
; Aliases allow you to create custom commands that execute
; multiple commands in sequence. Use them in keybinds like any
; other command.
; ================================================================

`;

        // Sort aliases alphabetically
        const sortedAliases = Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b));
        
        sortedAliases.forEach(([name, alias]) => {
            if (alias.description) {
                content += `# ${alias.description}\n`;
            }
            content += `alias ${name} "${alias.commands}"\n\n`;
        });

        return content;
    }

    generateKeybindSection(keys) {
        if (!keys || Object.keys(keys).length === 0) {
            return '# No keybinds defined\n\n';
        }

        let content = `# Keybind Commands
; ================================================================
; Each line binds a key to one or more commands.
; Multiple commands are separated by $$
; ================================================================

`;

        // Sort keys using the keybind manager's sorting logic if available, otherwise use local sorting
        let sortedKeys;
        if (typeof stoKeybinds !== 'undefined' && stoKeybinds.compareKeys) {
            sortedKeys = Object.keys(keys).sort(stoKeybinds.compareKeys.bind(stoKeybinds));
        } else {
            // Local key sorting implementation
            sortedKeys = Object.keys(keys).sort(this.compareKeys.bind(this));
        }
        
        // Group keys by type for better organization
        const keyGroups = this.groupKeysByType(sortedKeys, keys);
        
        Object.entries(keyGroups).forEach(([groupName, groupKeys]) => {
            if (groupKeys.length === 0) return;
            
            content += `# ${groupName}\n`;
            content += `# ${'-'.repeat(groupName.length)}\n`;
            
            groupKeys.forEach(key => {
                const commands = keys[key];
                if (commands && commands.length > 0) {
                    const commandString = commands.map(cmd => cmd.command).join(' $$ ');
                    content += `${key} "${commandString}"\n`;
                }
            });
            
            content += '\n';
        });

        return content;
    }

    // Local key comparison for sorting (fallback when stoKeybinds is not available)
    compareKeys(a, b) {
        // Function keys first
        const aIsF = a.match(/^F(\d+)$/);
        const bIsF = b.match(/^F(\d+)$/);
        
        if (aIsF && bIsF) {
            return parseInt(aIsF[1]) - parseInt(bIsF[1]);
        }
        if (aIsF && !bIsF) return -1;
        if (!aIsF && bIsF) return 1;
        
        // Numbers next
        const aIsNum = /^\d+$/.test(a);
        const bIsNum = /^\d+$/.test(b);
        
        if (aIsNum && bIsNum) {
            return parseInt(a) - parseInt(b);
        }
        if (aIsNum && !bIsNum) return -1;
        if (!aIsNum && bIsNum) return 1;
        
        // Letters
        const aIsLetter = /^[A-Z]$/.test(a);
        const bIsLetter = /^[A-Z]$/.test(b);
        
        if (aIsLetter && bIsLetter) {
            return a.localeCompare(b);
        }
        if (aIsLetter && !bIsLetter) return -1;
        if (!aIsLetter && bIsLetter) return 1;
        
        // Special keys
        const specialOrder = ['Space', 'Tab', 'Enter', 'Escape'];
        const aSpecial = specialOrder.indexOf(a);
        const bSpecial = specialOrder.indexOf(b);
        
        if (aSpecial !== -1 && bSpecial !== -1) {
            return aSpecial - bSpecial;
        }
        if (aSpecial !== -1 && bSpecial === -1) return -1;
        if (aSpecial === -1 && bSpecial !== -1) return 1;
        
        // Default alphabetical
        return a.localeCompare(b);
    }

    groupKeysByType(sortedKeys, keys) {
        const groups = {
            'Function Keys': [],
            'Number Keys': [],
            'Letter Keys': [],
            'Special Keys': [],
            'Modifier Combinations': []
        };

        sortedKeys.forEach(key => {
            if (/^F\d+$/.test(key)) {
                groups['Function Keys'].push(key);
            } else if (/^\d+$/.test(key)) {
                groups['Number Keys'].push(key);
            } else if (/^[A-Z]$/.test(key)) {
                groups['Letter Keys'].push(key);
            } else if (key.includes('+')) {
                groups['Modifier Combinations'].push(key);
            } else {
                groups['Special Keys'].push(key);
            }
        });

        return groups;
    }

    generateFileFooter() {
        return `; ================================================================
; End of keybind file
; ================================================================
; 
; Additional STO Commands Reference:
; 
; Targeting:
;   target_nearest_enemy    - Target closest hostile
;   target_nearest_friend   - Target closest friendly
;   target_self            - Target your own ship
; 
; Combat:
;   FireAll               - Fire all weapons
;   FirePhasers          - Fire beam weapons only
;   FireTorps            - Fire torpedo weapons only
; 
; Shield Management:
;   +power_exec <ability> - Execute bridge officer ability
;   Examples: +power_exec Distribute_Shields 
; 
; Tray Execution:
;   +STOTrayExecByTray <tray> <slot> - Execute ability from tray
;   Example: +STOTrayExecByTray 0 0  (Tray 1, Slot 1)
; 
; For more commands and help, visit the STO Wiki or community forums.
; ================================================================
`;
    }

    // JSON Profile Export
    exportJSONProfile(profile) {
        try {
            const exportData = {
                version: STO_DATA.settings.version,
                exported: new Date().toISOString(),
                type: 'profile',
                profile: this.sanitizeProfileForExport(profile)
            };

            const content = JSON.stringify(exportData, null, 2);
            this.downloadFile(content, this.generateFileName(profile, 'json'), 'application/json');
            
            stoUI.showToast('Profile exported as JSON', 'success');
        } catch (error) {
            stoUI.showToast('Failed to export profile: ' + error.message, 'error');
        }
    }

    // Complete Project Export
    exportCompleteProject() {
        try {
            const data = stoStorage.getAllData();
            const exportData = {
                version: STO_DATA.settings.version,
                exported: new Date().toISOString(),
                type: 'project',
                data: data
            };

            const content = JSON.stringify(exportData, null, 2);
            const filename = `STO_Tools_Keybinds_Project_${new Date().toISOString().split('T')[0]}.json`;
            this.downloadFile(content, filename, 'application/json');
            
            stoUI.showToast('Complete project exported', 'success');
        } catch (error) {
            stoUI.showToast('Failed to export project: ' + error.message, 'error');
        }
    }

    // CSV Data Export
    exportCSVData(profile) {
        try {
            const csvContent = this.generateCSVData(profile);
            this.downloadFile(csvContent, this.generateFileName(profile, 'csv'), 'text/csv');
            
            stoUI.showToast('Data exported as CSV', 'success');
        } catch (error) {
            stoUI.showToast('Failed to export CSV: ' + error.message, 'error');
        }
    }

    generateCSVData(profile) {
        let csv = 'Key,Command,Type,Description,Position\n';
        
        Object.entries(profile.keys).forEach(([key, commands]) => {
            commands.forEach((command, index) => {
                const row = [
                    this.escapeCSV(key),
                    this.escapeCSV(command.command),
                    this.escapeCSV(command.type),
                    this.escapeCSV(command.text || ''),
                    index + 1
                ].join(',');
                csv += row + '\n';
            });
        });

        return csv;
    }

    escapeCSV(value) {
        if (typeof value !== 'string') {
            value = String(value);
        }
        
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return '"' + value.replace(/"/g, '""') + '"';
        }
        
        return value;
    }

    // HTML Report Export
    exportHTMLReport(profile) {
        try {
            const htmlContent = this.generateHTMLReport(profile);
            this.downloadFile(htmlContent, this.generateFileName(profile, 'html'), 'text/html');
            
            stoUI.showToast('HTML report exported', 'success');
        } catch (error) {
            stoUI.showToast('Failed to export HTML report: ' + error.message, 'error');
        }
    }

    generateHTMLReport(profile) {
        const stats = stoKeybinds.getProfileStats(profile);
        const timestamp = new Date().toLocaleString();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${profile.name} - STO Keybind Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .stats { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 30px; }
        .keybind-group { margin-bottom: 30px; }
        .keybind-group h3 { color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
        .keybind { margin-bottom: 15px; padding: 10px; background: #fafafa; border-left: 4px solid #007acc; }
        .key { font-weight: bold; color: #007acc; }
        .commands { margin-top: 5px; }
        .command { display: inline-block; margin: 2px 5px 2px 0; padding: 2px 8px; background: #e0e0e0; border-radius: 3px; font-size: 0.9em; }
        .command.targeting { background: #d4edda; }
        .command.combat { background: #f8d7da; }
        .command.tray { background: #cce5ff; }
        .command.power { background: #fff3cd; }
        .command.alias { background: #e2e3e5; }
        .aliases { margin-top: 30px; }
        .alias { margin-bottom: 15px; padding: 10px; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 5px; }
        .alias-name { font-weight: bold; color: #495057; }
        .alias-commands { font-family: monospace; background: #e9ecef; padding: 5px; margin-top: 5px; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${profile.name}</h1>
        <p><strong>Mode:</strong> ${profile.mode.toUpperCase()}</p>
        <p><strong>Generated:</strong> ${timestamp}</p>
        <p><strong>Created by:</strong> STO Tools Keybind Manager v${STO_DATA.settings.version}</p>
    </div>

    <div class="stats">
        <h2>Statistics</h2>
        <ul>
            <li><strong>Keys Bound:</strong> ${stats.totalKeys}</li>
            <li><strong>Total Commands:</strong> ${stats.totalCommands}</li>
            <li><strong>Aliases Defined:</strong> ${stats.totalAliases}</li>
        </ul>
    </div>

    ${this.generateHTMLKeybindSection(profile.keys)}
    ${this.generateHTMLAliasSection(profile.aliases)}

    <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc; color: #666; font-size: 0.9em;">
        <p>This report was generated by STO Tools Keybind Manager. For more information about Star Trek Online keybinds, visit the STO Wiki.</p>
    </div>
</body>
</html>`;
    }

    generateHTMLKeybindSection(keys) {
        if (!keys || Object.keys(keys).length === 0) {
            return '<div class="keybind-group"><h2>Keybinds</h2><p>No keybinds defined.</p></div>';
        }

        const sortedKeys = Object.keys(keys).sort(stoKeybinds.compareKeys.bind(stoKeybinds));
        const keyGroups = this.groupKeysByType(sortedKeys, keys);

        let html = '<div class="keybind-group"><h2>Keybinds</h2>';

        Object.entries(keyGroups).forEach(([groupName, groupKeys]) => {
            if (groupKeys.length === 0) return;

            html += `<h3>${groupName}</h3>`;
            
            groupKeys.forEach(key => {
                const commands = keys[key];
                if (commands && commands.length > 0) {
                    html += `<div class="keybind">
                        <div class="key">${key}</div>
                        <div class="commands">
                            ${commands.map(cmd => 
                                `<span class="command ${cmd.type}">${cmd.text || cmd.command}</span>`
                            ).join('')}
                        </div>
                    </div>`;
                }
            });
        });

        html += '</div>';
        return html;
    }

    generateHTMLAliasSection(aliases) {
        if (!aliases || Object.keys(aliases).length === 0) {
            return '';
        }

        let html = '<div class="aliases"><h2>Command Aliases</h2>';

        Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b)).forEach(([name, alias]) => {
            html += `<div class="alias">
                <div class="alias-name">${name}</div>
                ${alias.description ? `<div>${alias.description}</div>` : ''}
                <div class="alias-commands">${alias.commands}</div>
            </div>`;
        });

        html += '</div>';
        return html;
    }

    // Copy Operations
    copyCommandPreview() {
        const preview = document.getElementById('commandPreview');
        if (!preview || !preview.textContent.trim()) {
            stoUI.showToast('No command to copy', 'warning');
            return;
        }

        stoUI.copyToClipboard(preview.textContent);
    }

    copyCommandChain() {
        if (!app.selectedKey) {
            stoUI.showToast('No key selected', 'warning');
            return;
        }

        const profile = app.getCurrentProfile();
        const commands = profile.keys[app.selectedKey];
        
        if (!commands || commands.length === 0) {
            stoUI.showToast('No commands to copy', 'warning');
            return;
        }

        const commandString = commands.map(cmd => cmd.command).join(' $$ ');
        const fullCommand = `${app.selectedKey} "${commandString}"`;
        
        stoUI.copyToClipboard(fullCommand);
    }

    // Utility Methods
    generateFileName(profile, extension) {
        const safeName = profile.name.replace(/[^a-zA-Z0-9\-_]/g, '_');
        const timestamp = new Date().toISOString().split('T')[0];
        return `${safeName}_${timestamp}.${extension}`;
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    sanitizeProfileForExport(profile) {
        // Create a clean copy of the profile for export
        const sanitized = JSON.parse(JSON.stringify(profile));
        
        // Remove any internal IDs or temporary data
        if (sanitized.keys) {
            Object.values(sanitized.keys).forEach(commands => {
                commands.forEach(command => {
                    // Keep essential data, remove internal IDs
                    delete command.id;
                });
            });
        }

        return sanitized;
    }

    // Batch Export Operations
    exportAllProfiles() {
        const data = stoStorage.getAllData();
        const profiles = data.profiles;
        
        if (!profiles || Object.keys(profiles).length === 0) {
            stoUI.showToast('No profiles to export', 'warning');
            return;
        }

        // Create a zip-like structure (for now, export as separate files)
        Object.entries(profiles).forEach(([id, profile]) => {
            setTimeout(() => {
                this.exportSTOKeybindFile(profile);
            }, 100); // Small delay to prevent browser blocking
        });

        stoUI.showToast(`Exporting ${Object.keys(profiles).length} profiles...`, 'info');
    }

    // Import Operations (for completeness)
    async importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    const extension = file.name.split('.').pop().toLowerCase();
                    
                    switch (extension) {
                        case 'txt':
                            resolve(stoKeybinds.importKeybindFile(content));
                            break;
                        case 'json':
                            resolve(this.importJSONFile(content));
                            break;
                        default:
                            reject(new Error('Unsupported file format'));
                    }
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    importJSONFile(content) {
        try {
            const data = JSON.parse(content);
            
            if (data.type === 'profile' && data.profile) {
                return stoProfiles.importProfile(content);
            } else if (data.type === 'project' && data.data) {
                return stoStorage.importData(JSON.stringify(data.data));
            } else {
                throw new Error('Unknown JSON file format');
            }
        } catch (error) {
            throw new Error('Invalid JSON file: ' + error.message);
        }
    }
}

// Global export manager instance
window.stoExport = new STOExportManager(); 