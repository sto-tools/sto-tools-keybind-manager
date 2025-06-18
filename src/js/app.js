// STO Tools Keybind Manager - Main Application Controller
// Coordinates all modules and handles global application state

class STOToolsKeybindManager {
    constructor() {
        this.currentProfile = null;
        this.currentMode = 'space';
        this.currentEnvironment = 'space'; // New: tracks current environment (space/ground)
        this.selectedKey = null;
        this.isModified = false;
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50;
        this.commandIdCounter = 0;
        
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
            // Check if required dependencies are available
            if (typeof stoStorage === 'undefined' || typeof stoUI === 'undefined') {
                throw new Error('Required dependencies not loaded');
            }
            
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
            
            // Dispatch app ready event
            const readyEvent = new CustomEvent('sto-app-ready', {
                detail: { app: this }
            });
            window.dispatchEvent(readyEvent);
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            if (typeof stoUI !== 'undefined' && stoUI.showToast) {
                stoUI.showToast('Failed to load application', 'error');
            }
            
            // Dispatch error event
            const errorEvent = new CustomEvent('sto-app-error', {
                detail: { error }
            });
            window.dispatchEvent(errorEvent);
        }
    }

    // Data Management
    async loadData() {
        const data = stoStorage.getAllData();
        this.currentProfile = data.currentProfile;
        
        // Load current environment from profile or default to space
        const profileData = data.profiles[this.currentProfile];
        if (profileData) {
            this.currentEnvironment = profileData.currentEnvironment || 'space';
        } else {
            this.currentEnvironment = 'space';
        }
        
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
        const profile = stoStorage.getProfile(this.currentProfile);
        if (!profile) return null;
        
        // Return current environment build data
        return this.getCurrentBuild(profile);
    }

    getCurrentBuild(profile) {
        if (!profile) return null;
        
        // Convert old profile format to new format if needed
        if (!profile.builds) {
            profile.builds = {
                space: {
                    keys: profile.keys || {},
                    aliases: profile.aliases || {}
                },
                ground: {
                    keys: {},
                    aliases: {}
                }
            };
            profile.currentEnvironment = profile.mode || 'space';
            delete profile.mode; // Remove old mode property
            delete profile.keys; // Move to builds
            delete profile.aliases; // Move to builds
            
            // Save the converted profile
            stoStorage.saveProfile(this.currentProfile, profile);
        }
        
        // Ensure builds exist
        if (!profile.builds) {
            profile.builds = {
                space: { keys: {}, aliases: {} },
                ground: { keys: {}, aliases: {} }
            };
        }
        
        if (!profile.builds[this.currentEnvironment]) {
            profile.builds[this.currentEnvironment] = { keys: {}, aliases: {} };
        }
        
        // Return a profile-like object with current build data
        return {
            ...profile,
            keys: profile.builds[this.currentEnvironment].keys || {},
            aliases: profile.builds[this.currentEnvironment].aliases || {},
            mode: this.currentEnvironment // For backward compatibility
        };
    }

    switchProfile(profileId) {
        if (profileId !== this.currentProfile) {
            this.currentProfile = profileId;
            this.selectedKey = null;
            
            const profile = stoStorage.getProfile(profileId);
            if (profile) {
                this.currentEnvironment = profile.currentEnvironment || 'space';
            }
            
            this.saveCurrentProfile();
            this.renderKeyGrid();
            this.renderCommandChain();
            this.updateProfileInfo();
            
            const currentBuild = this.getCurrentProfile();
            stoUI.showToast(`Switched to profile: ${currentBuild.name} (${this.currentEnvironment})`, 'success');
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
        
        if (Object.keys(data.profiles).length === 0) {
            // No profiles available
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No profiles available';
            option.disabled = true;
            select.appendChild(option);
        } else {
            Object.entries(data.profiles).forEach(([id, profile]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = profile.name;
                if (id === this.currentProfile) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        }
        
        this.updateProfileInfo();
    }

    updateProfileInfo() {
        const profile = this.getCurrentProfile();
        
        // Update mode buttons
        const modeBtns = document.querySelectorAll('.mode-btn');
        modeBtns.forEach(btn => {
            btn.classList.toggle('active', profile && btn.dataset.mode === this.currentEnvironment);
            btn.disabled = !profile;
        });
        
        // Update key count
        const keyCount = document.getElementById('keyCount');
        if (keyCount) {
            if (profile) {
                const count = Object.keys(profile.keys).length;
                keyCount.textContent = `${count} key${count !== 1 ? 's' : ''}`;
            } else {
                keyCount.textContent = 'No profile';
            }
        }
    }

    renderKeyGrid() {
        const grid = document.getElementById('keyGrid');
        if (!grid) return;
        
        const profile = this.getCurrentProfile();
        grid.innerHTML = '';
        
        if (!profile) {
            // Show empty state when no profile is available
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <h4>No Profile Selected</h4>
                    <p>Create a new profile or load default data to get started.</p>
                </div>
            `;
            return;
        }
        
        // Get all keys for this profile
        const keys = Object.keys(profile.keys);
        // console.log('renderKeyGrid: Profile keys:', keys);
        // console.log('renderKeyGrid: Profile keys count:', keys.length);
        
        // Add common keys that might not have commands yet
        const commonKeys = ['Space', '1', '2', '3', '4', '5', 'F1', 'F2', 'F3', 'F4'];
        const allKeys = [...new Set([...keys, ...commonKeys])].sort();
        // console.log('renderKeyGrid: All keys to render:', allKeys);
        
        // Check view preference
        const viewMode = localStorage.getItem('keyViewMode') || 'key-types';
        
        if (viewMode === 'categorized') {
            this.renderCategorizedKeyView(grid, profile, allKeys);
        } else if (viewMode === 'key-types') {
            this.renderKeyTypeView(grid, profile, allKeys);
        } else {
            this.renderSimpleKeyGrid(grid, allKeys);
        }
        
        // Update toggle button icon
        this.updateViewToggleButton(viewMode);
        
        // Reapply any existing filter after rendering the new view
        const filterInput = document.getElementById('keyFilter');
        if (filterInput && filterInput.value.trim()) {
            this.filterKeys(filterInput.value.trim());
        }
    }

    renderSimpleKeyGrid(grid, allKeys) {
        // Remove categorized class to use normal grid layout
        grid.classList.remove('categorized');
        
        allKeys.forEach(keyName => {
            const keyElement = this.createKeyElement(keyName);
            grid.appendChild(keyElement);
        });
    }

    renderCategorizedKeyView(grid, profile, allKeys) {
        // Add categorized class to override grid layout
        grid.classList.add('categorized');
        
        // Categorize keys based on their commands, including all keys
        const categorizedKeys = this.categorizeKeys(profile.keys, allKeys);
        
        // Sort categories by priority (Unknown first, then alphabetically)
        const sortedCategories = Object.entries(categorizedKeys).sort(([aId, aData], [bId, bData]) => {
            if (aData.priority !== bData.priority) {
                return aData.priority - bData.priority;
            }
            return aData.name.localeCompare(bData.name);
        });
        
        // Create category tree structure - show all categories even if empty
        sortedCategories.forEach(([categoryId, categoryData]) => {
            const categoryElement = this.createKeyCategoryElement(categoryId, categoryData);
            grid.appendChild(categoryElement);
        });
    }

    categorizeKeys(keysWithCommands, allKeys) {
        const categories = {};
        
        // Add Unknown category first (for empty keys)
        categories.unknown = {
            name: 'Unknown',
            icon: 'fas fa-question-circle',
            keys: new Set(),
            priority: 0
        };
        
        // Initialize categories from command library
        Object.entries(STO_DATA.commands).forEach(([categoryId, categoryData]) => {
            categories[categoryId] = {
                name: categoryData.name,
                icon: categoryData.icon,
                keys: new Set(),
                priority: 1
            };
        });
        
        // Process all keys, not just ones with commands
        allKeys.forEach(keyName => {
            const commands = keysWithCommands[keyName] || [];
            
            if (!commands || commands.length === 0) {
                categories.unknown.keys.add(keyName);
                return;
            }
            
            // Get all categories this key belongs to
            const keyCategories = new Set();
            commands.forEach(command => {
                if (command.type && categories[command.type]) {
                    keyCategories.add(command.type);
                } else if (window.stoCommands) {
                    // Use command detection if type is not set
                    const detectedType = window.stoCommands.detectCommandType(command.command);
                    if (categories[detectedType]) {
                        keyCategories.add(detectedType);
                    }
                }
            });
            
            // Add key to all relevant categories
            if (keyCategories.size > 0) {
                keyCategories.forEach(categoryId => {
                    categories[categoryId].keys.add(keyName);
                });
            } else {
                // Fallback for unknown command types
                if (!categories.custom) {
                    categories.custom = {
                        name: 'Custom Commands',
                        icon: 'fas fa-cog',
                        keys: new Set(),
                        priority: 2
                    };
                }
                categories.custom.keys.add(keyName);
            }
        });
        
        // Convert sets to arrays and sort
        Object.values(categories).forEach(category => {
            category.keys = Array.from(category.keys).sort(this.compareKeys.bind(this));
        });
        
        return categories;
    }

    createKeyCategoryElement(categoryId, categoryData, mode = 'command') {
        const element = document.createElement('div');
        element.className = 'category';
        element.dataset.category = categoryId;
        
        // Use different storage key for key-type categories
        const storageKey = mode === 'key-type' ? `keyTypeCategory_${categoryId}_collapsed` : `keyCategory_${categoryId}_collapsed`;
        const isCollapsed = localStorage.getItem(storageKey) === 'true';
        
        element.innerHTML = `
            <h4 class="${isCollapsed ? 'collapsed' : ''}" data-category="${categoryId}" data-mode="${mode}">
                <i class="fas fa-chevron-right category-chevron"></i>
                <i class="${categoryData.icon}"></i> 
                ${categoryData.name} 
                <span class="key-count">(${categoryData.keys.length})</span>
            </h4>
            <div class="category-commands ${isCollapsed ? 'collapsed' : ''}">
                ${categoryData.keys.map(keyName => this.createKeyElementHTML(keyName)).join('')}
            </div>
        `;
        
        // Add click handler for category header
        const header = element.querySelector('h4');
        header.addEventListener('click', () => {
            this.toggleKeyCategory(categoryId, element, mode);
        });
        
        // Add click handlers for key elements
        const keyElements = element.querySelectorAll('.command-item');
        keyElements.forEach(keyElement => {
            keyElement.addEventListener('click', () => {
                const keyName = keyElement.dataset.key;
                this.selectKey(keyName);
            });
        });
        
        return element;
    }

    createKeyElementHTML(keyName) {
        const profile = this.getCurrentProfile();
        const commands = profile.keys[keyName] || [];
        const isActive = this.selectedKey === keyName;
        
                // Simple length-based font sizing for categorized view (no line breaks)
        const keyLength = keyName.length;
        let lengthClass;
        if (keyLength <= 6) {
            lengthClass = 'short';
        } else if (keyLength <= 12) {
            lengthClass = 'medium';
        } else {
            lengthClass = 'long';
        }
        
        return `
            <div class="command-item ${isActive ? 'active' : ''}" data-key="${keyName}" data-length="${lengthClass}">
                <span class="key-label">${keyName}</span>
                ${commands.length > 0 ? `
                    <span class="command-count-badge">${commands.length}</span>
                ` : ''}
            </div>
        `;
    }

    toggleKeyCategory(categoryId, element, mode = 'command') {
        const header = element.querySelector('h4');
        const commands = element.querySelector('.category-commands');
        const chevron = header.querySelector('.category-chevron');
        
        const isCollapsed = commands.classList.contains('collapsed');
        
        // Use different storage key for key-type categories
        const storageKey = mode === 'key-type' ? `keyTypeCategory_${categoryId}_collapsed` : `keyCategory_${categoryId}_collapsed`;
        
        if (isCollapsed) {
            commands.classList.remove('collapsed');
            header.classList.remove('collapsed');
            chevron.style.transform = 'rotate(90deg)';
            localStorage.setItem(storageKey, 'false');
        } else {
            commands.classList.add('collapsed');
            header.classList.add('collapsed');
            chevron.style.transform = 'rotate(0deg)';
            localStorage.setItem(storageKey, 'true');
        }
    }

    formatKeyName(keyName) {
        // Smart formatting for compound keys to use line breaks instead of tiny text
        if (keyName.includes('+')) {
            // Always break compound keys for better readability
            return keyName.replace(/\+/g, '<br>+<br>');
        }
        return keyName;
    }

    detectKeyTypes(keyName) {
        const types = [];
        
        // Check if this is a compound key with modifiers
        if (keyName.includes('+')) {
            const parts = keyName.split('+');
            const hasModifier = parts.some(part => 
                part.match(/^(Ctrl|Control|Alt|Shift|Win|Cmd|Super)$/i)
            );
            
            if (hasModifier) {
                types.push('modifiers');
            }
        }
        
        // Extract the base key from compound keys to check its type too
        const baseKey = keyName.split('+').pop();
        
        // Function Keys
        if (baseKey.match(/^F\d+$/)) types.push('function');
        
        // Mouse inputs - comprehensive list from STO documentation
        else if (baseKey.match(/^(Lbutton|Rbutton|Mbutton|Leftdrag|Rightdrag|Middledrag|Leftclick|Rightclick|Middleclick|Leftdoubleclick|Rightdoubleclick|Middledoubleclick|Wheelplus|Wheelminus|Mousechord|Mouse|Wheel|LMouse|RMouse|MMouse|XMouse|Drag)/i)) types.push('mouse');
        
        // Numberpad
        else if (baseKey.match(/^(Numpad|Keypad)/i)) types.push('numberpad');
        
        // Single Modifiers (for standalone modifier keys)
        else if (baseKey.match(/^(Ctrl|Control|Alt|Shift|Win|Cmd|Super)$/i)) {
            if (!types.includes('modifiers')) types.push('modifiers');
        }
        
        // Navigation
        else if (baseKey.match(/^(Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Delete)$/i)) types.push('navigation');
        
        // System/Special
        else if (baseKey.match(/^(Space|Tab|Enter|Return|Escape|Esc|Backspace|CapsLock|ScrollLock|NumLock|PrintScreen|Pause|Break)$/i)) types.push('system');
        
        // Numbers
        else if (baseKey.match(/^[0-9]$/)) types.push('alphanumeric');
        
        // Letters
        else if (baseKey.match(/^[A-Za-z]$/)) types.push('alphanumeric');
        
        // Symbols and punctuation
        else if (baseKey.match(/^[`~!@#$%^&*()_+\-=\[\]{}\\|;':",./<>?]$/) || 
            baseKey.match(/^(Comma|Period|Semicolon|Quote|Slash|Backslash|Minus|Plus|Equals|Bracket|Grave|Tilde)$/i)) {
            types.push('symbols');
        }
        
        // Default fallback
        else {
            types.push('other');
        }
        
        return types.length > 0 ? types : ['other'];
    }

    categorizeKeysByType(keysWithCommands, allKeys) {
        const categories = {
            function: {
                name: 'Function Keys',
                icon: 'fas fa-keyboard',
                keys: new Set(),
                priority: 1
            },
            alphanumeric: {
                name: 'Letters & Numbers',
                icon: 'fas fa-font',
                keys: new Set(),
                priority: 2
            },
            numberpad: {
                name: 'Numberpad',
                icon: 'fas fa-calculator',
                keys: new Set(),
                priority: 3
            },
            modifiers: {
                name: 'Modifier Keys',
                icon: 'fas fa-hand-paper',
                keys: new Set(),
                priority: 4
            },
            navigation: {
                name: 'Navigation',
                icon: 'fas fa-arrows-alt',
                keys: new Set(),
                priority: 5
            },
            system: {
                name: 'System Keys',
                icon: 'fas fa-cogs',
                keys: new Set(),
                priority: 6
            },
            mouse: {
                name: 'Mouse & Wheel',
                icon: 'fas fa-mouse',
                keys: new Set(),
                priority: 7
            },
            symbols: {
                name: 'Symbols & Punctuation',
                icon: 'fas fa-at',
                keys: new Set(),
                priority: 8
            },
            other: {
                name: 'Other Keys',
                icon: 'fas fa-question-circle',
                keys: new Set(),
                priority: 9
            }
        };
        
        // Categorize each key by its types (can be multiple)
        allKeys.forEach(keyName => {
            const keyTypes = this.detectKeyTypes(keyName);
            keyTypes.forEach(keyType => {
                if (categories[keyType]) {
                    categories[keyType].keys.add(keyName);
                } else {
                    categories.other.keys.add(keyName);
                }
            });
        });
        
        // Convert sets to arrays and sort
        Object.values(categories).forEach(category => {
            category.keys = Array.from(category.keys).sort(this.compareKeys.bind(this));
        });
        
        return categories;
    }

    renderKeyTypeView(grid, profile, allKeys) {
        // Add categorized class to override grid layout
        grid.classList.add('categorized');
        
        // Categorize keys by their input type
        const categorizedKeys = this.categorizeKeysByType(profile.keys, allKeys);
        
        // Sort categories by priority
        const sortedCategories = Object.entries(categorizedKeys).sort(([aId, aData], [bId, bData]) => {
            return aData.priority - bData.priority;
        });
        
        // Create category tree structure - show all categories even if empty
        sortedCategories.forEach(([categoryId, categoryData]) => {
            const categoryElement = this.createKeyCategoryElement(categoryId, categoryData, 'key-type');
            grid.appendChild(categoryElement);
        });
    }

    compareKeys(a, b) {
        // Custom key sorting logic
        const getKeyPriority = (key) => {
            if (key === 'Space') return 0;
            if (key.match(/^[0-9]$/)) return 1;
            if (key.match(/^F[0-9]+$/)) return 2;
            if (key.includes('Ctrl+')) return 3;
            if (key.includes('Alt+')) return 4;
            if (key.includes('Shift+')) return 5;
            return 6;
        };
        
        const priorityA = getKeyPriority(a);
        const priorityB = getKeyPriority(b);
        
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        
        return a.localeCompare(b);
    }

    createKeyElement(keyName) {
        const profile = this.getCurrentProfile();
        const commands = profile.keys[keyName] || [];
        const isSelected = keyName === this.selectedKey;
        
        const keyElement = document.createElement('div');
        keyElement.className = `key-item ${isSelected ? 'active' : ''}`;
        keyElement.dataset.key = keyName;
        keyElement.title = `${keyName}: ${commands.length} command${commands.length !== 1 ? 's' : ''}`;
        
        // Smart formatting for compound keys and font sizing
        const formattedKeyName = this.formatKeyName(keyName);
        const hasLineBreaks = formattedKeyName.includes('<br>');
        
        // Determine length classification
        let lengthClass;
        if (hasLineBreaks) {
            // For compound keys with line breaks, check the longest part
            const parts = keyName.split('+');
            const longestPart = Math.max(...parts.map(part => part.length));
            if (longestPart <= 4) {
                lengthClass = 'short';
            } else if (longestPart <= 8) {
                lengthClass = 'medium';
            } else {
                lengthClass = 'long';
            }
                 } else {
             // For single keys, use total length
             const keyLength = keyName.length;
             if (keyLength <= 3) {
                 lengthClass = 'short';
             } else if (keyLength <= 5) {
                 lengthClass = 'medium';
             } else if (keyLength <= 8) {
                 lengthClass = 'long';
             } else {
                 lengthClass = 'extra-long';
             }
         }
         
         keyElement.dataset.length = lengthClass;
        
        keyElement.innerHTML = `
            <div class="key-label">${formattedKeyName}</div>
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

    updateViewToggleButton(viewMode) {
        const toggleBtn = document.getElementById('toggleKeyViewBtn');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (viewMode === 'categorized') {
                icon.className = 'fas fa-sitemap';
                toggleBtn.title = 'Switch to key type view';
            } else if (viewMode === 'key-types') {
                icon.className = 'fas fa-th';
                toggleBtn.title = 'Switch to grid view';
            } else {
                icon.className = 'fas fa-list';
                toggleBtn.title = 'Switch to command categories';
            }
        }
    }

    toggleKeyView() {
        const currentMode = localStorage.getItem('keyViewMode') || 'key-types';
        let newMode;
        
        // 3-way toggle: key-types → grid → categorized → key-types
        if (currentMode === 'key-types') {
            newMode = 'grid';
        } else if (currentMode === 'grid') {
            newMode = 'categorized';
        } else {
            newMode = 'key-types';
        }
        
        localStorage.setItem('keyViewMode', newMode);
        this.renderKeyGrid();
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
        
        // Check if this command matches a library definition
        const commandDef = this.findCommandDefinition(command);
        const isParameterized = commandDef && commandDef.customizable;
        
        // Use library definition for display if available
        let displayName = command.text;
        let displayIcon = command.icon;
        
        if (commandDef) {
            displayName = commandDef.name;
            displayIcon = commandDef.icon;
            
            // For parameterized commands, add parameter details to the name
            if (isParameterized && command.parameters) {
                if (commandDef.commandId === 'tray_with_backup') {
                    const p = command.parameters;
                    displayName = `${commandDef.name} (${p.active} ${p.tray} ${p.slot} ${p.backup_tray} ${p.backup_slot})`;
                } else if (commandDef.commandId === 'custom_tray') {
                    const p = command.parameters;
                    displayName = `${commandDef.name} (${p.tray} ${p.slot})`;
                } else if (commandDef.commandId === 'target') {
                    const p = command.parameters;
                    displayName = `${commandDef.name}: ${p.entityName}`;
                }
            } else if (isParameterized) {
                // Extract parameters from command string for display
                if (command.command.includes('TrayExecByTrayWithBackup')) {
                    const parts = command.command.split(' ');
                    if (parts.length >= 6) {
                        displayName = `${commandDef.name} (${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]} ${parts[5]})`;
                    }
                } else if (command.command.includes('TrayExec')) {
                    const parts = command.command.replace('+', '').split(' ');
                    if (parts.length >= 3) {
                        displayName = `${commandDef.name} (${parts[1]} ${parts[2]})`;
                    }
                } else if (command.command.includes('Target ')) {
                    const match = command.command.match(/Target "([^"]+)"/);
                    if (match) {
                        displayName = `${commandDef.name}: ${match[1]}`;
                    }
                }
            }
        }
        
        // Add parameters data attribute for styling
        if (isParameterized) {
            element.dataset.parameters = 'true';
            element.classList.add('customizable');
        }
        
        // Check if command has a warning
        const warningInfo = this.getCommandWarning(command);
        const warningIcon = warningInfo ? `<span class="command-warning-icon" title="${warningInfo}"><i class="fas fa-exclamation-triangle"></i></span>` : '';
        
        // Add parameter indicator for tray commands and other parameterized commands
        const parameterIndicator = isParameterized ? ' <span class="param-indicator" title="Editable parameters">⚙️</span>' : '';
        
        element.innerHTML = `
            <div class="command-number">${index + 1}</div>
            <div class="command-content">
                <span class="command-icon">${displayIcon}</span>
                <span class="command-text">${displayName}${parameterIndicator}</span>
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
        
        // Apply environment filtering after creating elements
        this.filterCommandLibrary();
    }

    createCategoryElement(categoryId, category) {
        const element = document.createElement('div');
        element.className = 'category';
        element.dataset.category = categoryId;
        
        element.innerHTML = `
            <h4><i class="${category.icon}"></i> ${category.name}</h4>
            <div class="category-commands">
                ${Object.entries(category.commands).map(([cmdId, cmd]) => `
                    <div class="command-item ${cmd.customizable ? 'customizable' : ''}" data-command="${cmdId}" title="${cmd.description}${cmd.customizable ? ' (Customizable)' : ''}">
                        ${cmd.icon} ${cmd.name}${cmd.customizable ? ' <span class="param-indicator">⚙️</span>' : ''}
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
        
        // Check if command is parameterized
        if (commandDef.customizable && commandDef.parameters) {
            this.showParameterModal(categoryId, commandId, commandDef);
            return;
        }
        
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
        // Note: addAliasBtn is not included because aliases are independent of key selection
        const buttonsToToggle = [
            'addCommandBtn',
            'addFromTemplateBtn', 
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
        
        // Key view toggle
        document.getElementById('toggleKeyViewBtn')?.addEventListener('click', () => {
            this.toggleKeyView();
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
        if (this.currentEnvironment !== mode) {
            // Save current build before switching
            this.saveCurrentBuild();
            
            this.currentEnvironment = mode;
            
            // Update profile's current environment
            const profile = stoStorage.getProfile(this.currentProfile);
            if (profile) {
                profile.currentEnvironment = mode;
                stoStorage.saveProfile(this.currentProfile, profile);
            }
            
            // Update UI button states
            this.updateModeButtons();
            
            this.updateProfileInfo();
            this.renderKeyGrid();
            this.renderCommandChain();
            this.filterCommandLibrary(); // Apply environment filter to command library
            this.setModified(true);
            
            stoUI.showToast(`Switched to ${mode} mode`, 'success');
        }
    }
    
    updateModeButtons() {
        // Update the active state of mode buttons
        const spaceBtn = document.querySelector('[data-mode="space"]');
        const groundBtn = document.querySelector('[data-mode="ground"]');
        
        if (spaceBtn && groundBtn) {
            spaceBtn.classList.toggle('active', this.currentEnvironment === 'space');
            groundBtn.classList.toggle('active', this.currentEnvironment === 'ground');
        }
    }

    saveCurrentBuild() {
        const profile = stoStorage.getProfile(this.currentProfile);
        const currentBuild = this.getCurrentProfile();
        
        if (profile && currentBuild) {
            // Ensure builds structure exists
            if (!profile.builds) {
                profile.builds = {
                    space: { keys: {}, aliases: {} },
                    ground: { keys: {}, aliases: {} }
                };
            }
            
            // Save current build data
            profile.builds[this.currentEnvironment] = {
                keys: currentBuild.keys || {},
                aliases: currentBuild.aliases || {}
            };
            
            stoStorage.saveProfile(this.currentProfile, profile);
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
        
        let keybindText = `# ${profile.name} - ${this.currentEnvironment} mode\n`;
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
        // Include environment in filename
        const safeName = profile.name.replace(/[^a-zA-Z0-9]/g, '_');
        a.download = `${safeName}_${this.currentEnvironment}_keybinds.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        stoUI.showToast(`${this.currentEnvironment} keybinds exported successfully`, 'success');
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
        const filterLower = filter.toLowerCase();
        
        // Filter grid view keys (.key-item)
        const keyItems = document.querySelectorAll('.key-item');
        keyItems.forEach(item => {
            const keyName = item.dataset.key.toLowerCase();
            const visible = !filter || keyName.includes(filterLower);
            item.style.display = visible ? 'flex' : 'none';
        });
        
        // Filter categorized/key-type view keys (.command-item[data-key])
        const commandItems = document.querySelectorAll('.command-item[data-key]');
        commandItems.forEach(item => {
            const keyName = item.dataset.key.toLowerCase();
            const visible = !filter || keyName.includes(filterLower);
            item.style.display = visible ? 'flex' : 'none';
        });
        
        // Hide/show categories based on whether they have visible keys
        const categories = document.querySelectorAll('.category');
        categories.forEach(category => {
            const visibleKeys = category.querySelectorAll('.command-item[data-key]:not([style*="display: none"])');
            const categoryVisible = !filter || visibleKeys.length > 0;
            category.style.display = categoryVisible ? 'block' : 'none';
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
        // Show all grid view keys
        const keyItems = document.querySelectorAll('.key-item');
        keyItems.forEach(item => {
            item.style.display = 'flex';
        });
        
        // Show all categorized/key-type view keys
        const commandItems = document.querySelectorAll('.command-item[data-key]');
        commandItems.forEach(item => {
            item.style.display = 'flex';
        });
        
        // Show all categories
        const categories = document.querySelectorAll('.category');
        categories.forEach(category => {
            category.style.display = 'block';
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
    
    // Parameter Modal for Customizable Commands
    showParameterModal(categoryId, commandId, commandDef) {
        this.currentParameterCommand = { categoryId, commandId, commandDef };
        
        // Create modal if it doesn't exist
        if (!document.getElementById('parameterModal')) {
            this.createParameterModal();
        }
        
        // Populate modal with parameter inputs
        this.populateParameterModal(commandDef);
        
        // Show modal
        stoUI.showModal('parameterModal');
    }
    
    createParameterModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'parameterModal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="parameterModalTitle">Configure Command Parameters</h3>
                    <button class="modal-close" data-modal="parameterModal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div id="parameterInputs">
                        <!-- Parameter inputs will be populated here -->
                    </div>
                    <div class="command-preview-modal">
                        <label>Generated Command:</label>
                        <div class="command-preview" id="parameterCommandPreview">
                            <!-- Command preview will be shown here -->
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" id="saveParameterCommandBtn">Add Command</button>
                    <button class="btn btn-secondary" data-modal="parameterModal">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        document.getElementById('saveParameterCommandBtn').addEventListener('click', () => {
            this.saveParameterCommand();
        });
        
        // Close modal handlers - handle both X button and Cancel button
        const closeButtons = modal.querySelectorAll('.modal-close, [data-modal="parameterModal"]');
        closeButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.cancelParameterCommand();
            });
        });
    }
    
    cancelParameterCommand() {
        // Clean up state
        this.currentParameterCommand = null;
        
        // Reset modal button text in case we were editing
        const saveBtn = document.getElementById('saveParameterCommandBtn');
        if (saveBtn) {
            saveBtn.textContent = 'Add Command';
        }
        
        // Hide modal
        stoUI.hideModal('parameterModal');
    }
    
    populateParameterModal(commandDef) {
        const container = document.getElementById('parameterInputs');
        const titleElement = document.getElementById('parameterModalTitle');
        
        titleElement.textContent = `Configure: ${commandDef.name}`;
        container.innerHTML = '';
        
        // Create input for each parameter
        Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
            const inputGroup = document.createElement('div');
            inputGroup.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = this.formatParameterName(paramName);
            label.setAttribute('for', `param_${paramName}`);
            
            const input = document.createElement('input');
            input.type = paramDef.type === 'number' ? 'number' : 'text';
            input.id = `param_${paramName}`;
            input.name = paramName;
            input.value = paramDef.default || '';
            
            if (paramDef.placeholder) {
                input.placeholder = paramDef.placeholder;
            }
            
            if (paramDef.type === 'number') {
                if (paramDef.min !== undefined) input.min = paramDef.min;
                if (paramDef.max !== undefined) input.max = paramDef.max;
                if (paramDef.step !== undefined) input.step = paramDef.step;
            }
            
            const help = document.createElement('small');
            help.textContent = this.getParameterHelp(paramName, paramDef);
            
            inputGroup.appendChild(label);
            inputGroup.appendChild(input);
            inputGroup.appendChild(help);
            container.appendChild(inputGroup);
            
            // Add real-time preview update
            input.addEventListener('input', () => {
                this.updateParameterPreview();
            });
        });
        
        // Initial preview update
        this.updateParameterPreview();
    }
    
    formatParameterName(paramName) {
        return paramName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    
    getParameterHelp(paramName, paramDef) {
        const helps = {
            entityName: 'Name of the entity to target (e.g., ship name, player name)',
            active: 'Whether the command is active (1 = active, 0 = inactive)',
            tray: 'Primary tray number (0-9, where 0 is the first tray)',
            slot: 'Primary slot number (0-9, where 0 is the first slot)',
            backup_tray: 'Backup tray number (0-9, where 0 is the first tray)',
            backup_slot: 'Backup slot number (0-9, where 0 is the first slot)',
            amount: 'Throttle adjustment amount (-1 to 1)',
            position: 'Throttle position (-1 = full reverse, 0 = stop, 1 = full forward)',
            distance: 'Camera distance from target',
            filename: 'Name of the keybind file (without extension)',
            message: 'Text message to send',
            state: 'Enable (1) or disable (0) combat log'
        };
        
        return helps[paramName] || `${paramDef.type} value ${paramDef.min !== undefined ? `(${paramDef.min} to ${paramDef.max})` : ''}`;
    }
    
    updateParameterPreview() {
        if (!this.currentParameterCommand) return;
        
        const { categoryId, commandId, commandDef } = this.currentParameterCommand;
        const params = this.getParameterValues();
        
        // Generate command using the command builder
        const command = this.buildParameterizedCommand(categoryId, commandId, commandDef, params);
        
        const preview = document.getElementById('parameterCommandPreview');
        if (preview && command) {
            preview.textContent = command.command;
        }
    }
    
    getParameterValues() {
        const params = {};
        const inputs = document.querySelectorAll('#parameterInputs input');
        
        inputs.forEach(input => {
            const paramName = input.name;
            let value = input.value;
            
            if (input.type === 'number') {
                value = parseFloat(value) || 0;
            }
            
            params[paramName] = value;
        });
        
        return params;
    }
    
    buildParameterizedCommand(categoryId, commandId, commandDef, params) {
        // Use the command builder logic from commands.js
        const builders = {
            targeting: (params) => {
                if (commandId === 'target' && params.entityName) {
                    return {
                        command: `${commandDef.command} "${params.entityName}"`,
                        text: `Target: ${params.entityName}`
                    };
                }
                return { command: commandDef.command, text: commandDef.name };
            },
            tray: (params) => {
                const tray = params.tray || 0;
                const slot = params.slot || 0;
                
                if (commandId === 'tray_with_backup') {
                    const active = params.active !== undefined ? params.active : 1;
                    const backupTray = params.backup_tray || 0;
                    const backupSlot = params.backup_slot || 0;
                    
                    return {
                        command: `TrayExecByTrayWithBackup ${active} ${tray} ${slot} ${backupTray} ${backupSlot}`,
                        text: `Execute Tray ${tray + 1} Slot ${slot + 1} (backup: Tray ${backupTray + 1} Slot ${backupSlot + 1})`
                    };
                } else {
                    // Preserve original command format when editing
                    const isEditing = this.currentParameterCommand && this.currentParameterCommand.isEditing;
                    if (isEditing) {
                        const profile = this.getCurrentProfile();
                        const existingCommand = profile.keys[this.selectedKey][this.currentParameterCommand.editIndex];
                        if (existingCommand && existingCommand.command.startsWith('TrayExecByTray') && !existingCommand.command.startsWith('+')) {
                            return {
                                command: `TrayExecByTray ${tray} ${slot}`,
                                text: `Execute Tray ${tray + 1} Slot ${slot + 1}`
                            };
                        }
                    }
                    
                    return {
                        command: `+STOTrayExecByTray ${tray} ${slot}`,
                        text: `Execute Tray ${tray + 1} Slot ${slot + 1}`
                    };
                }
            },
            movement: (params) => {
                let command = commandDef.command;
                if (commandId === 'throttle_adjust' && params.amount !== undefined) {
                    command = `${commandDef.command} ${params.amount}`;
                } else if (commandId === 'throttle_set' && params.position !== undefined) {
                    command = `${commandDef.command} ${params.position}`;
                }
                return { command, text: commandDef.name };
            },
            camera: (params) => {
                let command = commandDef.command;
                if (commandId === 'cam_distance' && params.distance !== undefined) {
                    command = `${commandDef.command} ${params.distance}`;
                }
                return { command, text: commandDef.name };
            },
            communication: (params) => ({
                command: `${commandDef.command} "${params.message || 'Message text here'}"`,
                text: `${commandDef.name}: ${params.message || 'Message text here'}`
            }),
            system: (params) => {
                let command = commandDef.command;
                if ((commandId === 'bind_save_file' || commandId === 'bind_load_file') && params.filename) {
                    command = `${commandDef.command} ${params.filename}`;
                } else if (commandId === 'combat_log' && params.state !== undefined) {
                    command = `${commandDef.command} ${params.state}`;
                }
                return { command, text: commandDef.name };
            }
        };
        
        const builder = builders[categoryId];
        if (builder) {
            const result = builder(params);
            return {
                command: result.command,
                type: categoryId,
                icon: commandDef.icon,
                text: result.text,
                id: this.generateCommandId(),
                parameters: params
            };
        }
        
        return null;
    }
    
    saveParameterCommand() {
        if (!this.selectedKey || !this.currentParameterCommand) return;
        
        const { categoryId, commandId, commandDef, editIndex, isEditing } = this.currentParameterCommand;
        const params = this.getParameterValues();
        
        const command = this.buildParameterizedCommand(categoryId, commandId, commandDef, params);
        
        if (command) {
            if (isEditing && editIndex !== undefined) {
                // Update existing command
                const profile = this.getCurrentProfile();
                profile.keys[this.selectedKey][editIndex] = command;
                stoStorage.saveProfile(this.currentProfile, profile);
                this.renderCommandChain();
                this.setModified(true);
                stoUI.showToast('Command updated successfully', 'success');
            } else {
                // Add new command
                this.addCommand(this.selectedKey, command);
            }
            
            stoUI.hideModal('parameterModal');
            this.currentParameterCommand = null;
            
            // Reset modal button text
            document.getElementById('saveParameterCommandBtn').textContent = 'Add Command';
        }
    }
    
    editCommand(index) {
        if (!this.selectedKey) return;
        
        const profile = this.getCurrentProfile();
        const commands = profile.keys[this.selectedKey];
        
        if (!commands || !commands[index]) return;
        
        const command = commands[index];
        
        // Check if this is a parameterized command that can be edited
        if (command.parameters && command.type) {
            // Find the original command definition
            const commandDef = this.findCommandDefinition(command);
            if (commandDef && commandDef.customizable) {
                this.editParameterizedCommand(index, command, commandDef);
                return;
            }
        }
        
        // Also check if command is detectable as parameterized via findCommandDefinition
        const commandDef = this.findCommandDefinition(command);
        if (commandDef && commandDef.customizable) {
            this.editParameterizedCommand(index, command, commandDef);
            return;
        }
        
        // For non-parameterized commands, show command details
        stoUI.showToast(`Command: ${command.command}\nType: ${command.type}`, 'info', 3000);
    }
    
    findCommandDefinition(command) {
        // Special handling for tray execution commands - detect by command string
        if (command.command.includes('TrayExec')) {
            const trayCategory = STO_DATA.commands.tray;
            if (trayCategory) {
                // Check for TrayExecByTrayWithBackup
                if (command.command.includes('TrayExecByTrayWithBackup')) {
                    const trayWithBackupDef = trayCategory.commands.tray_with_backup;
                    if (trayWithBackupDef) {
                        return { commandId: 'tray_with_backup', ...trayWithBackupDef };
                    }
                }
                // Check for STOTrayExecByTray or TrayExecByTray (both use same dialog)
                else if (command.command.includes('STOTrayExecByTray') || 
                         (command.command.includes('TrayExecByTray') && !command.command.includes('WithBackup'))) {
                    const customTrayDef = trayCategory.commands.custom_tray;
                    if (customTrayDef) {
                        return { commandId: 'custom_tray', ...customTrayDef };
                    }
                }
            }
        }
        
        const category = STO_DATA.commands[command.type];
        if (!category) return null;
        
        // First try to find exact command match (for non-customizable commands)
        for (const [commandId, commandDef] of Object.entries(category.commands)) {
            if (commandDef.command === command.command) {
                return { commandId, ...commandDef };
            }
        }
        
        // Then try to find the command by matching the base command string (for customizable commands)
        for (const [commandId, commandDef] of Object.entries(category.commands)) {
            if (commandDef.customizable && command.command.startsWith(commandDef.command.split(' ')[0])) {
                return { commandId, ...commandDef };
            }
        }
        
        return null;
    }
    
    editParameterizedCommand(index, command, commandDef) {
        this.currentParameterCommand = { 
            categoryId: command.type, 
            commandId: commandDef.commandId, 
            commandDef,
            editIndex: index,
            isEditing: true
        };
        
        // Create modal if it doesn't exist
        if (!document.getElementById('parameterModal')) {
            this.createParameterModal();
        }
        
        // Populate modal with existing parameter values
        this.populateParameterModalForEdit(commandDef, command.parameters);
        
        // Change modal title and button text for editing
        document.getElementById('parameterModalTitle').textContent = `Edit: ${commandDef.name}`;
        document.getElementById('saveParameterCommandBtn').textContent = 'Update Command';
        
        // Show modal
        stoUI.showModal('parameterModal');
    }
    
    populateParameterModalForEdit(commandDef, existingParams) {
        const container = document.getElementById('parameterInputs');
        container.innerHTML = '';
        
        // Create input for each parameter with existing values
        Object.entries(commandDef.parameters).forEach(([paramName, paramDef]) => {
            const inputGroup = document.createElement('div');
            inputGroup.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = this.formatParameterName(paramName);
            label.setAttribute('for', `param_${paramName}`);
            
            const input = document.createElement('input');
            input.type = paramDef.type === 'number' ? 'number' : 'text';
            input.id = `param_${paramName}`;
            input.name = paramName;
            
            // Use existing parameter value or default
            const existingValue = existingParams && existingParams[paramName] !== undefined 
                ? existingParams[paramName] 
                : paramDef.default;
            input.value = existingValue || '';
            
            if (paramDef.placeholder) {
                input.placeholder = paramDef.placeholder;
            }
            
            if (paramDef.type === 'number') {
                if (paramDef.min !== undefined) input.min = paramDef.min;
                if (paramDef.max !== undefined) input.max = paramDef.max;
                if (paramDef.step !== undefined) input.step = paramDef.step;
            }
            
            const help = document.createElement('small');
            help.textContent = this.getParameterHelp(paramName, paramDef);
            
            inputGroup.appendChild(label);
            inputGroup.appendChild(input);
            inputGroup.appendChild(help);
            container.appendChild(inputGroup);
            
            // Add real-time preview update
            input.addEventListener('input', () => {
                this.updateParameterPreview();
            });
        });
        
        // Initial preview update
        this.updateParameterPreview();
    }

    filterCommandLibrary() {
        // Filter commands in the command library based on current environment
        const commandItems = document.querySelectorAll('.command-item');
        
        commandItems.forEach(item => {
            const commandId = item.dataset.command;
            if (!commandId) return;
            
            // Find the command definition
            let commandDef = null;
            let categoryKey = null;
            
            // Search through all categories for this command
            for (const [catKey, category] of Object.entries(STO_DATA.commands)) {
                if (category.commands[commandId]) {
                    commandDef = category.commands[commandId];
                    categoryKey = catKey;
                    break;
                }
            }
            
            if (commandDef) {
                let shouldShow = true;
                
                // Check if command has environment restriction
                if (commandDef.environment) {
                    // If command has specific environment, only show it in that environment
                    shouldShow = commandDef.environment === this.currentEnvironment;
                } else {
                    // If no environment specified, show in all environments
                    shouldShow = true;
                }
                
                // Apply visibility
                item.style.display = shouldShow ? 'flex' : 'none';
            }
        });
        
        // Hide/show categories based on whether they have visible commands
        const categories = document.querySelectorAll('.category');
        categories.forEach(category => {
            const visibleCommands = category.querySelectorAll('.command-item:not([style*="display: none"])');
            const categoryVisible = visibleCommands.length > 0;
            category.style.display = categoryVisible ? 'block' : 'none';
        });
    }
}

// Initialize application
const app = new STOToolsKeybindManager();
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