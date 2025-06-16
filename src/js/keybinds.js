// STO Tools Keybind Manager - Keybind Operations
// Handles keybind parsing, validation, and file operations

class STOKeybindFileManager {
    constructor() {
        this.keybindPatterns = {
            // Standard keybind format: Key "command1 $$ command2" or Key "command" "optional"
            standard: /^([a-zA-Z0-9_+\-\s\[\]]+)\s+"([^"]*)"(?:\s+"([^"]*)")?$/,
            // Bind command format: /bind Key command or /bind Key "command"
            bind: /^\/bind\s+([a-zA-Z0-9_+\-\s\[\]]+)\s+(.+)$/,
            // Alias format: alias AliasName "command sequence"
            alias: /^alias\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+"([^"]+)"$/,
            // Comment lines (both # and ; style comments)
            comment: /^[#;].*$/
        };
        
        this.validKeys = this.generateValidKeys();
        // Don't initialize immediately - wait for app to be ready
    }

    init() {
        this.setupEventListeners();
    }

    // Generate list of valid STO keys
    generateValidKeys() {
        const keys = new Set();
        
        // Function keys
        for (let i = 1; i <= 12; i++) {
            keys.add(`F${i}`);
        }
        
        // Number keys
        for (let i = 0; i <= 9; i++) {
            keys.add(i.toString());
        }
        
        // Letter keys
        for (let i = 65; i <= 90; i++) {
            keys.add(String.fromCharCode(i));
        }
        
        // Special keys
        const specialKeys = [
            'Space', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete',
            'Insert', 'Home', 'End', 'PageUp', 'PageDown',
            'Up', 'Down', 'Left', 'Right',
            'NumPad0', 'NumPad1', 'NumPad2', 'NumPad3', 'NumPad4',
            'NumPad5', 'NumPad6', 'NumPad7', 'NumPad8', 'NumPad9',
            'NumPadEnter', 'NumPadPlus', 'NumPadMinus', 'NumPadMultiply', 'NumPadDivide',
            // Lowercase numpad variants (for compatibility)
            'numpad0', 'numpad1', 'numpad2', 'numpad3', 'numpad4',
            'numpad5', 'numpad6', 'numpad7', 'numpad8', 'numpad9',
            'divide', 'multiply', // STO-style names for numpad math keys
            // Mouse buttons
            'Button4', 'Button5', 'Button6', 'Button7', 'Button8',
            'Lbutton', 'Rbutton', 'Mbutton', 'Leftdrag', 'Rightdrag', 'Middleclick',
            'Mousechord', 'Wheelplus', 'Wheelminus',
            'Semicolon', 'Equals', 'Comma', 'Minus', 'Period', 'Slash',
            'Grave', 'LeftBracket', 'Backslash', 'RightBracket', 'Quote',
            // Bracket characters (for STO keybinds like Control+[)
            '[', ']'
        ];
        
        specialKeys.forEach(key => keys.add(key));
        
        // Modifier combinations
        const modifiers = ['Ctrl', 'Alt', 'Shift', 'Control']; // Include both Ctrl and Control
        const baseKeys = Array.from(keys); // Capture base keys before adding modifiers
        
        modifiers.forEach(modifier => {
            baseKeys.forEach(key => {
                keys.add(`${modifier}+${key}`);
            });
        });
        

        
        // Double modifier combinations
        keys.add('Ctrl+Alt');
        keys.add('Ctrl+Shift');
        keys.add('Alt+Shift');
        keys.add('Control+Alt');
        keys.add('Control+Shift');
        
        baseKeys.forEach(key => {
            keys.add(`Ctrl+Alt+${key}`);
            keys.add(`Ctrl+Shift+${key}`);
            keys.add(`Alt+Shift+${key}`);
            keys.add(`Control+Alt+${key}`);
            keys.add(`Control+Shift+${key}`);
        });
        
        return Array.from(keys).sort();
    }

    // Parse keybind file content
    parseKeybindFile(content) {
        const lines = content.split('\n');
        const result = {
            keybinds: {},
            aliases: {},
            comments: [],
            errors: []
        };
        
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            
            try {
                if (this.keybindPatterns.comment.test(trimmed)) {
                    result.comments.push({
                        line: index + 1,
                        content: trimmed
                    });
                } else if (this.keybindPatterns.alias.test(trimmed)) {
                    const match = trimmed.match(this.keybindPatterns.alias);
                    if (match) {
                        const [, aliasName, commands] = match;
                        result.aliases[aliasName] = {
                            name: aliasName,
                            commands: commands,
                            line: index + 1
                        };
                    }
                } else if (this.keybindPatterns.standard.test(trimmed)) {
                    const match = trimmed.match(this.keybindPatterns.standard);
                    if (match) {
                        const [, key, commandString, optionalParam] = match;
                        const commands = this.parseCommandString(commandString);
                        
                        result.keybinds[key] = {
                            key: key,
                            commands: commands,
                            line: index + 1,
                            raw: commandString,
                            // Store optional parameter if present (for completeness, though we ignore it)
                            optionalParam: optionalParam || null
                        };
                    }
                } else if (this.keybindPatterns.bind.test(trimmed)) {
                    const match = trimmed.match(this.keybindPatterns.bind);
                    if (match) {
                        const [, key, commandString] = match;
                        // Remove quotes if present
                        const cleanCommandString = commandString.replace(/^"(.*)"$/, '$1');
                        const commands = this.parseCommandString(cleanCommandString);
                        
                        result.keybinds[key] = {
                            key: key,
                            commands: commands,
                            line: index + 1,
                            raw: cleanCommandString
                        };
                    }
                } else {
                    result.errors.push({
                        line: index + 1,
                        content: trimmed,
                        error: 'Invalid keybind format'
                    });
                }
            } catch (error) {
                result.errors.push({
                    line: index + 1,
                    content: trimmed,
                    error: error.message
                });
            }
        });
        
        return result;
    }

    // Parse command string into individual commands
    parseCommandString(commandString) {
        const commands = commandString.split('$$').map(cmd => cmd.trim());
        
        return commands.map((command, index) => {
            const commandObj = {
                command: command,
                type: window.stoCommands ? window.stoCommands.detectCommandType(command) : 'custom',
                icon: window.stoCommands ? window.stoCommands.getCommandIcon(command) : '⚙️',
                text: window.stoCommands ? window.stoCommands.getCommandText(command) : command,
                id: `imported_${Date.now()}_${index}`
            };
            
            // Try to extract parameters for known command types
            if (command.includes('+STOTrayExecByTray')) {
                const match = command.match(/\+STOTrayExecByTray\s+(\d+)\s+(\d+)/);
                if (match) {
                    commandObj.parameters = {
                        tray: parseInt(match[1]),
                        slot: parseInt(match[2])
                    };
                    commandObj.text = `Execute Tray ${parseInt(match[1]) + 1} Slot ${parseInt(match[2]) + 1}`;
                }
            } else if (command.includes('"')) {
                // Extract quoted parameters (for communication commands)
                const match = command.match(/^(\w+)\s+"([^"]+)"$/);
                if (match) {
                    commandObj.parameters = {
                        message: match[2]
                    };
                    commandObj.text = `${commandObj.text}: ${match[2]}`;
                }
            }
            
            return commandObj;
        });
    }

    // Import keybind file into current profile
    importKeybindFile(content) {
        const parsed = this.parseKeybindFile(content);
        
        if (parsed.errors.length > 0) {
            const errorMsg = `Import completed with ${parsed.errors.length} error(s):\n` +
                parsed.errors.map(err => `Line ${err.line}: ${err.error}`).join('\n');
            stoUI.showToast(errorMsg, 'warning', 5000);
        }
        
        // Get current profile
        const profile = app.getCurrentProfile();
        if (!profile) {
            stoUI.showToast('No active profile to import into', 'error');
            return false;
        }
        
        // Import keybinds
        let importedKeys = 0;
        Object.entries(parsed.keybinds).forEach(([key, keybind]) => {
            if (this.isValidKey(key)) {
                // Store keybinds even if they have empty commands (for STO compatibility)
                profile.keys[key] = keybind.commands;
                importedKeys++;

            } else {

                parsed.errors.push({
                    line: keybind.line,
                    content: key,
                    error: 'Invalid key name'
                });
            }
        });
        
        // Import aliases
        let importedAliases = 0;
        Object.entries(parsed.aliases).forEach(([name, alias]) => {
            if (this.isValidAliasName(name)) {
                profile.aliases[name] = {
                    name: name,
                    commands: alias.commands,
                    description: `Imported alias: ${alias.commands.substring(0, 50)}...`
                };
                importedAliases++;
            } else {
                parsed.errors.push({
                    line: alias.line,
                    content: name,
                    error: 'Invalid alias name'
                });
            }
        });
        
        // Debug: Check if keys are actually in the profile BEFORE saving
        console.log('Before save - Profile keys:', Object.keys(profile.keys));
        console.log('Before save - Profile keys count:', Object.keys(profile.keys).length);
        
        // Save profile directly to storage instead of using app.saveProfile()
        stoStorage.saveProfile(app.currentProfile, profile);
        app.setModified(true);
        
        // Debug: Check if keys are actually in the profile AFTER saving
        console.log('After save - Profile keys:', Object.keys(profile.keys));
        console.log('After save - Profile keys count:', Object.keys(profile.keys).length);
        
        // Debug: Check what getCurrentProfile returns
        const currentProfile = app.getCurrentProfile();
        console.log('getCurrentProfile - Profile keys:', Object.keys(currentProfile.keys));
        console.log('getCurrentProfile - Profile keys count:', Object.keys(currentProfile.keys).length);
        
        // Force reload data from storage and then update UI
        app.loadData();
        
        // Update UI
        app.renderKeyGrid();
        app.renderCommandChain();
        
        // Show success message
        const message = `Import completed: ${importedKeys} keybinds, ${importedAliases} aliases`;

        stoUI.showToast(message, 'success');
        
        return {
            success: true,
            imported: { keys: importedKeys, aliases: importedAliases },
            errors: parsed.errors
        };
    }

    // Export profile to keybind file format
    exportProfile(profile) {
        let output = '';
        
        // Header
        output += `# ${profile.name} - ${profile.mode} mode\n`;
        output += `# Generated by STO Tools Keybind Manager\n`;
        output += `# ${new Date().toLocaleString()}\n\n`;
        
        // Export aliases first
        if (profile.aliases && Object.keys(profile.aliases).length > 0) {
            output += `# Command Aliases\n`;
            Object.entries(profile.aliases).forEach(([name, alias]) => {
                output += `alias ${name} "${alias.commands}"\n`;
            });
            output += `\n`;
        }
        
        // Export keybinds
        output += `# Keybind Commands\n`;
        const sortedKeys = Object.keys(profile.keys).sort(this.compareKeys.bind(this));
        
        sortedKeys.forEach(key => {
            const commands = profile.keys[key];
            if (commands && commands.length > 0) {
                const commandString = commands.map(cmd => cmd.command).join(' $$ ');
                // Export with optional parameter format for compatibility (empty second parameter)
                output += `${key} "${commandString}" ""\n`;
            } else {
                // Export empty keybinds with the two-parameter format
                output += `${key} "" ""\n`;
            }
        });
        
        return output;
    }

    // Key comparison for sorting
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

    // Validation methods
    isValidKey(key) {
        // Case-insensitive validation since STO keybinds are case insensitive
        return this.validKeys.some(validKey => validKey.toLowerCase() === key.toLowerCase());
    }

    isValidAliasName(name) {
        return STO_DATA.validation.aliasNamePattern.test(name);
    }

    validateKeybind(key, commands) {
        const errors = [];
        
        // Validate key
        if (!this.isValidKey(key)) {
            errors.push(`Invalid key name: ${key}`);
        }
        
        // Validate commands
        if (!commands || commands.length === 0) {
            errors.push('At least one command is required');
        } else {
            commands.forEach((command, index) => {
                if (!command.command || command.command.trim().length === 0) {
                    errors.push(`Command ${index + 1} is empty`);
                }
            });
        }
        
        // Check command count limit
        if (commands && commands.length > STO_DATA.validation.maxCommandsPerKey) {
            errors.push(`Too many commands (max ${STO_DATA.validation.maxCommandsPerKey})`);
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Key suggestion and filtering
    suggestKeys(filter = '') {
        const filterLower = filter.toLowerCase();
        
        return this.validKeys.filter(key => 
            key.toLowerCase().includes(filterLower)
        ).slice(0, 20); // Limit suggestions
    }

    getCommonKeys() {
        return [
            'Space', 'Tab', 'Enter',
            'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8',
            '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
            'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4',
            'Alt+1', 'Alt+2', 'Alt+3', 'Alt+4',
            'Shift+1', 'Shift+2', 'Shift+3', 'Shift+4'
        ];
    }

    // Event listeners
    setupEventListeners() {
        // Import keybind file handler
        document.addEventListener('change', (e) => {
            if (e.target.id === 'fileInput' && e.target.accept === '.txt') {
                this.handleKeybindFileImport(e);
            }
        });
    }

    handleKeybindFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.importKeybindFile(e.target.result);
            } catch (error) {
                stoUI.showToast('Failed to import keybind file: ' + error.message, 'error');
            }
        };
        reader.readAsText(file);
        
        // Reset file input
        event.target.value = '';
    }

    // Utility methods
    generateKeybindId() {
        return 'keybind_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    cloneKeybind(keybind) {
        return JSON.parse(JSON.stringify(keybind));
    }

    // Statistics
    getProfileStats(profile) {
        const stats = {
            totalKeys: Object.keys(profile.keys).length,
            totalCommands: 0,
            totalAliases: Object.keys(profile.aliases || {}).length,
            commandTypes: {},
            mostUsedCommands: {}
        };
        
        Object.values(profile.keys).forEach(commands => {
            stats.totalCommands += commands.length;
            
            commands.forEach(command => {
                // Count by type
                stats.commandTypes[command.type] = (stats.commandTypes[command.type] || 0) + 1;
                
                // Count by command
                stats.mostUsedCommands[command.command] = (stats.mostUsedCommands[command.command] || 0) + 1;
            });
        });
        
        return stats;
    }
}

// Global keybind manager instance
window.stoKeybinds = new STOKeybindFileManager(); 