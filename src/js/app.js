// STO Tools Keybind Manager - Main Application Controller
// Coordinates all modules and handles global application state

class STOKeybindManager {
    constructor() {
        this.currentProfile = null;
        this.selectedKey = null;
        this.currentMode = 'space';
        this.isModified = false;
        this.undoStack = [];
        this.redoStack = [];
        
        this.eventListeners = new Map();
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        try {
            // Load data from storage
            await this.loadData();
            
            // Setup UI components
            this.setupEventListeners();
            this.setupCommandLibrary();
            this.setupDragAndDrop();
            
            // Render initial state
            this.renderProfiles();
            this.renderKeyGrid();
            this.renderCommandChain();
            
            // Show welcome message for new users
            if (this.isFirstTime()) {
                this.showWelcomeMessage();
            }
            
            stoUI.showToast('STO Tools Keybind Manager loaded successfully', 'success');
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            stoUI.showToast('Failed to load application', 'error');
        }
    }

    // Data Management
    async loadData() {
        const data = stoStorage.getAllData();
        this.currentProfile = data.currentProfile;
        this.currentMode = data.profiles[this.currentProfile]?.mode || 'space';
        
        // Validate current profile exists
        if (!data.profiles[this.currentProfile]) {
            this.currentProfile = Object.keys(data.profiles)[0];
            this.saveCurrentProfile();
        }
    }

    saveData() {
        const data = stoStorage.getAllData();
        data.currentProfile = this.currentProfile;
        data.lastModified = new Date().toISOString();
        
        if (stoStorage.saveAllData(data)) {
            this.setModified(false);
            return true;
        }
        return false;
    }

    saveCurrentProfile() {
        const data = stoStorage.getAllData();
        data.currentProfile = this.currentProfile;
        return stoStorage.saveAllData(data);
    }

    setModified(modified = true) {
        this.isModified = modified;
        const indicator = document.getElementById('modifiedIndicator');
        if (indicator) {
            indicator.style.display = modified ? 'inline' : 'none';
        }
    }

    // Profile Management
    getCurrentProfile() {
        return stoStorage.getProfile(this.currentProfile);
    }

    switchProfile(profileId) {
        if (profileId !== this.currentProfile) {
            this.currentProfile = profileId;
            this.selectedKey = null;
            
            const profile = this.getCurrentProfile();
            if (profile) {
                this.currentMode = profile.mode || 'space';
            }
            
            this.saveCurrentProfile();
            this.renderKeyGrid();
            this.renderCommandChain();
            this.updateProfileInfo();
            
            stoUI.showToast(`Switched to profile: ${profile.name}`, 'success');
        }
    }

    createProfile(name, description = '', mode = 'space') {
        const profileId = this.generateProfileId(name);
        const profile = {
            name,
            description,
            mode,
            keys: {},
            aliases: {},
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };
        
        if (stoStorage.saveProfile(profileId, profile)) {
            this.switchProfile(profileId);
            this.renderProfiles();
            stoUI.showToast(`Profile "${name}" created`, 'success');
            return profileId;
        }
        
        stoUI.showToast('Failed to create profile', 'error');
        return null;
    }

    cloneProfile(sourceProfileId, newName) {
        const sourceProfile = stoStorage.getProfile(sourceProfileId);
        if (!sourceProfile) return null;
        
        const profileId = this.generateProfileId(newName);
        const clonedProfile = {
            ...JSON.parse(JSON.stringify(sourceProfile)), // Deep clone
            name: newName,
            description: `Copy of ${sourceProfile.name}`,
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };
        
        if (stoStorage.saveProfile(profileId, clonedProfile)) {
            this.renderProfiles();
            stoUI.showToast(`Profile "${newName}" created from "${sourceProfile.name}"`, 'success');
            return profileId;
        }
        
        stoUI.showToast('Failed to clone profile', 'error');
        return null;
    }

    deleteProfile(profileId) {
        const profile = stoStorage.getProfile(profileId);
        if (!profile) return false;
        
        const data = stoStorage.getAllData();
        const profileCount = Object.keys(data.profiles).length;
        
        if (profileCount <= 1) {
            stoUI.showToast('Cannot delete the last profile', 'warning');
            return false;
        }
        
        if (stoStorage.deleteProfile(profileId)) {
            if (this.currentProfile === profileId) {
                // Switch to first available profile
                const remainingProfiles = Object.keys(stoStorage.getAllData().profiles);
                this.switchProfile(remainingProfiles[0]);
            }
            
            this.renderProfiles();
            stoUI.showToast(`Profile "${profile.name}" deleted`, 'success');
            return true;
        }
        
        stoUI.showToast('Failed to delete profile', 'error');
        return false;
    }

    generateProfileId(name) {
        const base = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        let id = base;
        let counter = 1;
        
        const data = stoStorage.getAllData();
        while (data.profiles[id]) {
            id = `${base}_${counter}`;
            counter++;
        }
        
        return id;
    }

    // Key Management
    selectKey(keyName) {
        this.selectedKey = keyName;
        this.renderKeyGrid();
        this.renderCommandChain();
        this.updateChainActions();
    }

    addKey(keyName) {
        if (!this.isValidKeyName(keyName)) {
            stoUI.showToast('Invalid key name', 'error');
            return false;
        }
        
        const profile = this.getCurrentProfile();
        
        if (!profile.keys[keyName]) {
            profile.keys[keyName] = [];
            stoStorage.saveProfile(this.currentProfile, profile);
            this.renderKeyGrid();
            this.selectKey(keyName);
            this.setModified(true);
            
            stoUI.showToast(`Key "${keyName}" added`, 'success');
            return true;
        } else {
            stoUI.showToast(`Key "${keyName}" already exists`, 'warning');
            return false;
        }
    }

    deleteKey(keyName) {
        const profile = this.getCurrentProfile();
        if (profile.keys[keyName]) {
            delete profile.keys[keyName];
            stoStorage.saveProfile(this.currentProfile, profile);
            
            if (this.selectedKey === keyName) {
                this.selectedKey = null;
            }
            
            this.renderKeyGrid();
            this.renderCommandChain();
            this.setModified(true);
            
            stoUI.showToast(`Key "${keyName}" deleted`, 'success');
            return true;
        }
        
        return false;
    }

    isValidKeyName(keyName) {
        return STO_DATA.validation.keyNamePattern.test(keyName) && keyName.length <= 20;
    }

    // Command Management
    addCommand(keyName, command) {
        const profile = this.getCurrentProfile();
        if (!profile.keys[keyName]) {
            profile.keys[keyName] = [];
        }
        
        // Generate unique ID for command
        command.id = this.generateCommandId();
        
        profile.keys[keyName].push(command);
        stoStorage.saveProfile(this.currentProfile, profile);
        this.renderCommandChain();
        this.renderKeyGrid();
        this.setModified(true);
        
        stoUI.showToast('Command added', 'success');
    }

    deleteCommand(keyName, commandIndex) {
        const profile = this.getCurrentProfile();
        if (profile.keys[keyName] && profile.keys[keyName][commandIndex]) {
            profile.keys[keyName].splice(commandIndex, 1);
            stoStorage.saveProfile(this.currentProfile, profile);
            this.renderCommandChain();
            this.renderKeyGrid();
            this.setModified(true);
            
            stoUI.showToast('Command deleted', 'success');
        }
    }

    moveCommand(keyName, fromIndex, toIndex) {
        const profile = this.getCurrentProfile();
        const commands = profile.keys[keyName];
        
        if (commands && fromIndex >= 0 && fromIndex < commands.length && 
            toIndex >= 0 && toIndex < commands.length) {
            
            const [command] = commands.splice(fromIndex, 1);
            commands.splice(toIndex, 0, command);
            
            stoStorage.saveProfile(this.currentProfile, profile);
            this.renderCommandChain();
            this.setModified(true);
        }
    }

    generateCommandId() {
        return 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Rendering Methods
    renderProfiles() {
        const select = document.getElementById('profileSelect');
        if (!select) return;
        
        const data = stoStorage.getAllData();
        select.innerHTML = '';
        
        Object.entries(data.profiles).forEach(([id, profile]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = profile.name;
            if (id === this.currentProfile) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        this.updateProfileInfo();
    }

    updateProfileInfo() {
        const profile = this.getCurrentProfile();
        if (!profile) return;
        
        // Update mode buttons
        const modeBtns = document.querySelectorAll('.mode-btn');
        modeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === profile.mode);
        });
        
        // Update key count
        const keyCount = document.getElementById('keyCount');
        if (keyCount) {
            const count = Object.keys(profile.keys).length;
            keyCount.textContent = `${count} key${count !== 1 ? 's' : ''}`;
        }
    }

    renderKeyGrid() {
        const grid = document.getElementById('keyGrid');
        if (!grid) return;
        
        const profile = this.getCurrentProfile();
        if (!profile) return;
        
        grid.innerHTML = '';
        
        // Get all keys for this profile
        const keys = Object.keys(profile.keys);
        console.log('renderKeyGrid: Profile keys:', keys);
        console.log('renderKeyGrid: Profile keys count:', keys.length);
        
        // Add common keys that might not have commands yet
        const commonKeys = ['Space', '1', '2', '3', '4', '5', 'F1', 'F2', 'F3', 'F4'];
        const allKeys = [...new Set([...keys, ...commonKeys])].sort();
        console.log('renderKeyGrid: All keys to render:', allKeys);
        
        allKeys.forEach(keyName => {
            const keyElement = this.createKeyElement(keyName);
            grid.appendChild(keyElement);
        });
    }

    createKeyElement(keyName) {
        const profile = this.getCurrentProfile();
        const commands = profile.keys[keyName] || [];
        const isSelected = keyName === this.selectedKey;
        
        const keyElement = document.createElement('div');
        keyElement.className = `key-item ${isSelected ? 'active' : ''}`;
        keyElement.dataset.key = keyName;
        keyElement.title = `${keyName}: ${commands.length} command${commands.length !== 1 ? 's' : ''}`;
        
        keyElement.innerHTML = `
            <div class="key-label">${keyName}</div>
            ${commands.length > 0 ? `
                <div class="activity-bar" style="width: ${Math.min(commands.length * 15, 100)}%"></div>
                <div class="command-count-badge">${commands.length}</div>
            ` : ''}
        `;
        
        keyElement.addEventListener('click', () => {
            this.selectKey(keyName);
        });
        
        return keyElement;
    }

    renderCommandChain() {
        const container = document.getElementById('commandList');
        const title = document.getElementById('chainTitle');
        const preview = document.getElementById('commandPreview');
        const commandCount = document.getElementById('commandCount');
        const emptyState = document.getElementById('emptyState');
        
        if (!container || !title || !preview) return;
        
        if (!this.selectedKey) {
            title.textContent = 'Select a key to edit';
            preview.textContent = 'Select a key to see the generated command';
            if (commandCount) commandCount.textContent = '0 commands';
            if (emptyState) emptyState.style.display = 'block';
            container.innerHTML = '<div class="empty-state" id="emptyState"><i class="fas fa-keyboard"></i><h4>No Key Selected</h4><p>Select a key from the left panel to view and edit its command chain.</p></div>';
            return;
        }
        
        const profile = this.getCurrentProfile();
        const commands = profile.keys[this.selectedKey] || [];
        
        title.textContent = `Command Chain for ${this.selectedKey}`;
        if (commandCount) commandCount.textContent = `${commands.length} command${commands.length !== 1 ? 's' : ''}`;
        
        if (commands.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-plus-circle"></i>
                    <h4>No Commands</h4>
                    <p>Click "Add Command" to start building your command chain for ${this.selectedKey}.</p>
                </div>
            `;
            preview.textContent = `${this.selectedKey} ""`;
        } else {
            container.innerHTML = '';
            commands.forEach((command, index) => {
                const element = this.createCommandElement(command, index);
                container.appendChild(element);
            });
            
            // Update preview
            const commandString = commands.map(cmd => cmd.command).join(' $$ ');
            preview.textContent = `${this.selectedKey} "${commandString}"`;
        }
    }

    createCommandElement(command, index) {
        const element = document.createElement('div');
        element.className = 'command-item-row';
        element.dataset.index = index;
        element.draggable = true;
        
        // Check if command has a warning
        const warningInfo = this.getCommandWarning(command);
        const warningIcon = warningInfo ? `<span class="command-warning-icon" title="${warningInfo}"><i class="fas fa-exclamation-triangle"></i></span>` : '';
        
        element.innerHTML = `
            <div class="command-number">${index + 1}</div>
            <div class="command-content">
                <span class="command-icon">${command.icon}</span>
                <span class="command-text">${command.text}</span>
                ${warningIcon}
            </div>
            <span class="command-type ${command.type}">${command.type}</span>
            <div class="command-actions">
                <button class="btn btn-small-icon" onclick="app.editCommand(${index})" title="Edit Command">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-small-icon btn-danger" onclick="app.deleteCommand('${this.selectedKey}', ${index})" title="Delete Command">
                    <i class="fas fa-times"></i>
                </button>
                <button class="btn btn-small-icon" onclick="app.moveCommand('${this.selectedKey}', ${index}, ${index - 1})" 
                        title="Move Up" ${index === 0 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-up"></i>
                </button>
                <button class="btn btn-small-icon" onclick="app.moveCommand('${this.selectedKey}', ${index}, ${index + 1})" 
                        title="Move Down" ${index === this.getCurrentProfile().keys[this.selectedKey].length - 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-down"></i>
                </button>
            </div>
        `;
        
        return element;
    }

    getCommandWarning(command) {
        // Look up the command in the data structure to find its warning
        const categories = STO_DATA.commands;
        
        for (const [categoryId, category] of Object.entries(categories)) {
            for (const [cmdId, cmdData] of Object.entries(category.commands)) {
                // Match by command text or actual command
                if (cmdData.command === command.command || 
                    cmdData.name === command.text ||
                    command.command.includes(cmdData.command)) {
                    return cmdData.warning || null;
                }
            }
        }
        
        return null;
    }

    setupCommandLibrary() {
        const container = document.getElementById('commandCategories');
        if (!container) return;
        
        container.innerHTML = '';
        
        Object.entries(STO_DATA.commands).forEach(([categoryId, category]) => {
            const categoryElement = this.createCategoryElement(categoryId, category);
            container.appendChild(categoryElement);
        });
    }

    createCategoryElement(categoryId, category) {
        const element = document.createElement('div');
        element.className = 'category';
        element.dataset.category = categoryId;
        
        element.innerHTML = `
            <h4><i class="${category.icon}"></i> ${category.name}</h4>
            <div class="category-commands">
                ${Object.entries(category.commands).map(([cmdId, cmd]) => `
                    <div class="command-item" data-command="${cmdId}" title="${cmd.description}">
                        ${cmd.icon} ${cmd.name}
                    </div>
                `).join('')}
            </div>
        `;
        
        // Add click handlers for commands
        element.addEventListener('click', (e) => {
            if (e.target.classList.contains('command-item')) {
                const commandId = e.target.dataset.command;
                this.addCommandFromLibrary(categoryId, commandId);
            }
        });
        
        return element;
    }

    addCommandFromLibrary(categoryId, commandId) {
        if (!this.selectedKey) {
            stoUI.showToast('Please select a key first', 'warning');
            return;
        }
        
        const commandDef = STO_DATA.commands[categoryId].commands[commandId];
        if (!commandDef) return;
        
        const command = {
            command: commandDef.command,
            type: categoryId,
            icon: commandDef.icon,
            text: commandDef.name,
            id: this.generateCommandId()
        };
        
        this.addCommand(this.selectedKey, command);
    }

    setupDragAndDrop() {
        const commandList = document.getElementById('commandList');
        if (!commandList) return;
        
        stoUI.initDragAndDrop(commandList, {
            dragSelector: '.command-item-row',
            dropZoneSelector: '.command-item-row',
            onDrop: (e, dragState, dropZone) => {
                if (!this.selectedKey) return;
                
                const fromIndex = parseInt(dragState.dragElement.dataset.index);
                const toIndex = parseInt(dropZone.dataset.index);
                
                if (fromIndex !== toIndex) {
                    this.moveCommand(this.selectedKey, fromIndex, toIndex);
                }
            }
        });
    }

    updateChainActions() {
        const hasSelectedKey = !!this.selectedKey;
        
        // Enable/disable buttons based on selection
        const buttonsToToggle = [
            'addCommandBtn',
            'addFromTemplateBtn', 
            'addAliasBtn',
            'importFromKeyBtn',
            'deleteKeyBtn',
            'duplicateKeyBtn'
        ];
        
        buttonsToToggle.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.disabled = !hasSelectedKey;
            }
        });
    }

    // Event Handlers
    setupEventListeners() {
        // Profile management
        const profileSelect = document.getElementById('profileSelect');
        profileSelect?.addEventListener('change', (e) => {
            this.switchProfile(e.target.value);
        });
        
        // Mode switching
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.switchMode(mode);
            });
        });
        
        // File operations
        document.getElementById('openProjectBtn')?.addEventListener('click', () => {
            this.openProject();
        });
        
        document.getElementById('saveProjectBtn')?.addEventListener('click', () => {
            this.saveProject();
        });
        
        document.getElementById('exportKeybindsBtn')?.addEventListener('click', () => {
            this.exportKeybinds();
        });
        
        // Key management
        document.getElementById('addKeyBtn')?.addEventListener('click', () => {
            stoUI.showModal('addKeyModal');
        });
        
        document.getElementById('deleteKeyBtn')?.addEventListener('click', () => {
            if (this.selectedKey) {
                this.confirmDeleteKey(this.selectedKey);
            }
        });
        
        document.getElementById('duplicateKeyBtn')?.addEventListener('click', () => {
            if (this.selectedKey) {
                this.duplicateKey(this.selectedKey);
            }
        });
        
        // Command management
        document.getElementById('addCommandBtn')?.addEventListener('click', () => {
            stoUI.showModal('addCommandModal');  
        });
        
        document.getElementById('addFromTemplateBtn')?.addEventListener('click', () => {
            this.showTemplateModal();
        });
        
        document.getElementById('clearChainBtn')?.addEventListener('click', () => {
            if (this.selectedKey) {
                this.confirmClearChain(this.selectedKey);
            }
        });
        
        document.getElementById('validateChainBtn')?.addEventListener('click', () => {
            this.validateCurrentChain();
        });
        
        // Search and filter
        document.getElementById('keyFilter')?.addEventListener('input', (e) => {
            this.filterKeys(e.target.value);
        });
        
        document.getElementById('commandSearch')?.addEventListener('input', (e) => {
            this.filterCommands(e.target.value);
        });
        
        document.getElementById('showAllKeysBtn')?.addEventListener('click', () => {
            this.showAllKeys();
        });
        
        // Library toggle
        document.getElementById('toggleLibraryBtn')?.addEventListener('click', () => {
            this.toggleLibrary();
        });
        
        // Modal handlers
        this.setupModalHandlers();
        
        // Auto-save
        setInterval(() => {
            if (this.isModified) {
                this.saveData();
            }
        }, 30000); // Auto-save every 30 seconds
    }

    setupModalHandlers() {
        // Add Key Modal
        document.getElementById('confirmAddKeyBtn')?.addEventListener('click', () => {
            const keyName = document.getElementById('newKeyName')?.value.trim();
            if (keyName) {
                this.addKey(keyName);
                stoUI.hideModal('addKeyModal');
            }
        });
        
        // Key suggestions
        document.querySelectorAll('.key-suggestion').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const keyName = e.target.dataset.key;
                const input = document.getElementById('newKeyName');
                if (input) {
                    input.value = keyName;
                }
            });
        });
        
        // Add Command Modal
        document.getElementById('saveCommandBtn')?.addEventListener('click', () => {
            this.saveCommandFromModal();
        });
        
        // Modal close handlers
        document.querySelectorAll('.modal-close, [data-modal]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = e.target.dataset.modal || e.target.closest('button').dataset.modal;
                if (modalId) {
                    stoUI.hideModal(modalId);
                }
            });
        });
    }

    // Utility Methods
    saveProfile() {
        const profile = this.getCurrentProfile();
        if (profile) {
            stoStorage.saveProfile(this.currentProfile, profile);
        }
    }

    switchMode(mode) {
        const profile = this.getCurrentProfile();
        if (profile && profile.mode !== mode) {
            profile.mode = mode;
            this.currentMode = mode;
            stoStorage.saveProfile(this.currentProfile, profile);
            this.updateProfileInfo();
            this.setModified(true);
            
            stoUI.showToast(`Switched to ${mode} mode`, 'success');
        }
    }

    async confirmDeleteKey(keyName) {
        const confirmed = await stoUI.confirm(
            `Are you sure you want to delete the key "${keyName}" and all its commands?`,
            'Delete Key',
            'danger'
        );
        
        if (confirmed) {
            this.deleteKey(keyName);
        }
    }

    async confirmClearChain(keyName) {
        const confirmed = await stoUI.confirm(
            `Are you sure you want to clear all commands for "${keyName}"?`,
            'Clear Commands',
            'warning'
        );
        
        if (confirmed) {
            const profile = this.getCurrentProfile();
            profile.keys[keyName] = [];
            stoStorage.saveProfile(this.currentProfile, profile);
            this.renderCommandChain();
            this.renderKeyGrid();
            this.setModified(true);
            
            stoUI.showToast(`Commands cleared for ${keyName}`, 'success');
        }
    }

    openProject() {
        const input = document.getElementById('fileInput');
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const success = stoStorage.importData(e.target.result);
                        if (success) {
                            this.loadData();
                            this.renderProfiles();
                            this.renderKeyGrid();
                            this.renderCommandChain();
                            stoUI.showToast('Project loaded successfully', 'success');
                        } else {
                            stoUI.showToast('Failed to load project file', 'error');
                        }
                    } catch (error) {
                        stoUI.showToast('Invalid project file', 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    saveProject() {
        const data = stoStorage.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sto_keybinds.json';
        a.click();
        URL.revokeObjectURL(url);
        
        stoUI.showToast('Project exported successfully', 'success');
    }

    exportKeybinds() {
        const profile = this.getCurrentProfile();
        if (!profile) return;
        
        let keybindText = `# ${profile.name} - ${profile.mode} mode\n`;
        keybindText += `# Generated by STO Tools Keybind Manager\n`;
        keybindText += `# ${new Date().toLocaleString()}\n\n`;
        
        // Add aliases first
        if (profile.aliases && Object.keys(profile.aliases).length > 0) {
            keybindText += `# Command Aliases\n`;
            Object.entries(profile.aliases).forEach(([name, alias]) => {
                keybindText += `alias ${name} "${alias.commands}"\n`;
            });
            keybindText += `\n`;
        }
        
        // Add keybinds
        keybindText += `# Keybind Commands\n`;
        Object.entries(profile.keys).forEach(([key, commands]) => {
            if (commands.length > 0) {
                const commandString = commands.map(cmd => cmd.command).join(' $$ ');
                keybindText += `${key} "${commandString}"\n`;
            }
        });
        
        const blob = new Blob([keybindText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${profile.name.replace(/[^a-zA-Z0-9]/g, '_')}_keybinds.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        stoUI.showToast('Keybinds exported successfully', 'success');
    }

    isFirstTime() {
        return !localStorage.getItem('sto_keybind_manager_visited');
    }

    showWelcomeMessage() {
        localStorage.setItem('sto_keybind_manager_visited', 'true');
        stoUI.showModal('aboutModal');
    }

    // Additional Methods
    duplicateKey(keyName) {
        const profile = this.getCurrentProfile();
        const commands = profile.keys[keyName];
        
        if (!commands || commands.length === 0) {
            stoUI.showToast('No commands to duplicate', 'warning');
            return;
        }
        
        // Find a suitable new key name
        let newKeyName = keyName + '_copy';
        let counter = 1;
        
        while (profile.keys[newKeyName]) {
            newKeyName = `${keyName}_copy_${counter}`;
            counter++;
        }
        
        // Clone commands
        const clonedCommands = commands.map(cmd => ({
            ...cmd,
            id: this.generateCommandId()
        }));
        
        profile.keys[newKeyName] = clonedCommands;
        stoStorage.saveProfile(this.currentProfile, profile);
        this.renderKeyGrid();
        this.setModified(true);
        
        stoUI.showToast(`Key "${keyName}" duplicated as "${newKeyName}"`, 'success');
    }
    
    showTemplateModal() {
        stoUI.showToast('Template system coming soon', 'info');
    }
    
    validateCurrentChain() {
        if (!this.selectedKey) {
            stoUI.showToast('No key selected', 'warning');
            return;
        }
        
        const profile = this.getCurrentProfile();
        const commands = profile.keys[this.selectedKey] || [];
        
        if (commands.length === 0) {
            stoUI.showToast('No commands to validate', 'warning');
            return;
        }
        
        const validation = stoKeybinds.validateKeybind(this.selectedKey, commands);
        
        if (validation.valid) {
            stoUI.showToast('Command chain is valid', 'success');
        } else {
            const errorMsg = 'Validation errors:\n' + validation.errors.join('\n');
            stoUI.showToast(errorMsg, 'error', 5000);
        }
    }
    
    filterKeys(filter) {
        const keyItems = document.querySelectorAll('.key-item');
        const filterLower = filter.toLowerCase();
        
        keyItems.forEach(item => {
            const keyName = item.dataset.key.toLowerCase();
            const visible = !filter || keyName.includes(filterLower);
            item.style.display = visible ? 'flex' : 'none';
        });
    }
    
    filterCommands(filter) {
        const commandItems = document.querySelectorAll('.command-item');
        const filterLower = filter.toLowerCase();
        
        commandItems.forEach(item => {
            const text = item.textContent.toLowerCase();
            const visible = !filter || text.includes(filterLower);
            item.style.display = visible ? 'flex' : 'none';
        });
    }
    
    showAllKeys() {
        const keyItems = document.querySelectorAll('.key-item');
        keyItems.forEach(item => {
            item.style.display = 'flex';
        });
        
        const filterInput = document.getElementById('keyFilter');
        if (filterInput) {
            filterInput.value = '';
        }
    }
    
    toggleLibrary() {
        const content = document.getElementById('libraryContent');
        const btn = document.getElementById('toggleLibraryBtn');
        
        if (content && btn) {
            const isCollapsed = content.style.display === 'none';
            content.style.display = isCollapsed ? 'block' : 'none';
            
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = isCollapsed ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
            }
        }
    }
    
    saveCommandFromModal() {
        if (!this.selectedKey) {
            stoUI.showToast('Please select a key first', 'warning');
            return;
        }
        
        const command = stoCommands.getCurrentCommand();
        if (!command) {
            stoUI.showToast('Please configure a command', 'warning');
            return;
        }
        
        const validation = stoCommands.validateCommand(command);
        if (!validation.valid) {
            stoUI.showToast(validation.error, 'error');
            return;
        }
        
        this.addCommand(this.selectedKey, command);
        stoUI.hideModal('addCommandModal');
    }
    
    editCommand(index) {
        if (!this.selectedKey) return;
        
        const profile = this.getCurrentProfile();
        const commands = profile.keys[this.selectedKey];
        
        if (!commands || !commands[index]) return;
        
        // For now, just show the command details
        const command = commands[index];
        stoUI.showToast(`Command: ${command.command}\nType: ${command.type}`, 'info', 3000);
    }
}

// Initialize application
const app = new STOKeybindManager();
window.app = app;

// Initialize other modules after app is ready
if (typeof stoProfiles !== 'undefined') {
    stoProfiles.init();
}
if (typeof stoKeybinds !== 'undefined') {
    stoKeybinds.init();
}
if (typeof stoAliases !== 'undefined') {
    stoAliases.init();
}
if (typeof stoExport !== 'undefined') {
    stoExport.init();
} 