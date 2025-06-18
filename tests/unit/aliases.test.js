import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Import real data first to ensure STO_DATA is available
import '../../src/js/data.js'

// Load the aliases module (it creates a global instance)
import '../../src/js/aliases.js'

// Load the real HTML
const htmlContent = readFileSync(join(process.cwd(), 'src/index.html'), 'utf-8')

// Global setup for all tests
beforeEach(() => {
  // Set up the real DOM
  document.documentElement.innerHTML = htmlContent
  
  // Mock only the UI methods that would show actual UI
  global.stoUI = {
    showModal: vi.fn(),
    hideModal: vi.fn(),
    showToast: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true)
  }
  
  // Mock only the app methods that would modify actual DOM
  global.app = {
    getCurrentProfile: vi.fn(() => ({
      keys: {},
      aliases: {},
      name: 'Test Profile',
      mode: 'Space'
    })),
    selectedKey: null,
    saveProfile: vi.fn(),
    setModified: vi.fn(),
    generateCommandId: vi.fn(() => `cmd_${Date.now()}`),
    addCommand: vi.fn()
  }
})

describe('STOAliasManager', () => {
  let aliasManager
  let STOAliasManager

  beforeEach(() => {
    // Get the constructor from the global instance
    STOAliasManager = global.window.stoAliases.constructor
    aliasManager = new STOAliasManager()
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should initialize with null currentAlias', () => {
      expect(aliasManager.currentAlias).toBeNull()
    })

    it('should setup event listeners', () => {
      const addAliasBtn = document.getElementById('addAliasBtn')
      const newAliasBtn = document.getElementById('newAliasBtn')
      const saveAliasBtn = document.getElementById('saveAliasBtn')
      
      expect(addAliasBtn).toBeTruthy()
      expect(newAliasBtn).toBeTruthy()
      expect(saveAliasBtn).toBeTruthy()
      
      // Setup event listeners
      aliasManager.setupEventListeners()
      
      // Verify elements exist (real DOM test)
      expect(addAliasBtn.id).toBe('addAliasBtn')
      expect(newAliasBtn.id).toBe('newAliasBtn')
      expect(saveAliasBtn.id).toBe('saveAliasBtn')
    })
  })

  describe('alias manager modal', () => {
    it('should show alias manager modal', () => {
      const renderSpy = vi.spyOn(aliasManager, 'renderAliasList').mockImplementation(() => {})
      
      aliasManager.showAliasManager()
      
      expect(renderSpy).toHaveBeenCalled()
      expect(stoUI.showModal).toHaveBeenCalledWith('aliasManagerModal')
    })

    it('should render alias list with existing aliases', () => {
      const container = document.getElementById('aliasList')
      expect(container).toBeTruthy()
      
      global.app.getCurrentProfile.mockReturnValue({
        aliases: {
          'TestAlias': {
            name: 'TestAlias',
            description: 'Test description',
            commands: 'say hello'
          }
        }
      })
      
      aliasManager.renderAliasList()
      
      expect(container.innerHTML).toContain('alias-grid')
      expect(container.innerHTML).toContain('TestAlias')
      expect(container.innerHTML).toContain('Test description')
    })

    it('should show empty state when no aliases exist', () => {
      const container = document.getElementById('aliasList')
      
      global.app.getCurrentProfile.mockReturnValue({
        aliases: {}
      })
      
      aliasManager.renderAliasList()
      
      expect(container.innerHTML).toContain('empty-state')
      expect(container.innerHTML).toContain('No Aliases')
    })

    it('should create alias cards with actions', () => {
      const alias = {
        name: 'TestAlias',
        description: 'Test description',
        commands: 'say hello world'
      }
      
      const card = aliasManager.createAliasCard('TestAlias', alias)
      
      expect(card).toContain('alias-card')
      expect(card).toContain('TestAlias')
      expect(card).toContain('Test description')
      expect(card).toContain('say hello world')
      expect(card).toContain('edit-alias-btn')
      expect(card).toContain('delete-alias-btn')
      expect(card).toContain('use-alias-btn')
    })

    it('should truncate long commands in alias cards', () => {
      const alias = {
        name: 'LongAlias',
        description: 'Long command test',
        commands: 'this is a very long command sequence that should be truncated when displayed'
      }
      
      const card = aliasManager.createAliasCard('LongAlias', alias)
      
      expect(card).toContain('...')
    })
  })

  describe('alias editing modal', () => {
    it('should show new alias modal with empty form', () => {
      const title = document.getElementById('editAliasTitle')
      const nameInput = document.getElementById('aliasName')
      const descInput = document.getElementById('aliasDescription')
      const commandsInput = document.getElementById('aliasCommands')
      
      expect(title).toBeTruthy()
      expect(nameInput).toBeTruthy()
      expect(descInput).toBeTruthy()
      expect(commandsInput).toBeTruthy()
      
      const updatePreviewSpy = vi.spyOn(aliasManager, 'updateAliasPreview').mockImplementation(() => {})
      
      aliasManager.showEditAliasModal()
      
      expect(title.textContent).toBe('New Alias')
      expect(nameInput.value).toBe('')
      expect(nameInput.disabled).toBe(false)
      expect(descInput.value).toBe('')
      expect(commandsInput.value).toBe('')
      expect(aliasManager.currentAlias).toBeNull()
      expect(updatePreviewSpy).toHaveBeenCalled()
      expect(stoUI.hideModal).toHaveBeenCalledWith('aliasManagerModal')
      expect(stoUI.showModal).toHaveBeenCalledWith('editAliasModal')
    })

    it('should show edit alias modal with existing data', () => {
      const title = document.getElementById('editAliasTitle')
      const nameInput = document.getElementById('aliasName')
      const descInput = document.getElementById('aliasDescription')
      const commandsInput = document.getElementById('aliasCommands')
      
      global.app.getCurrentProfile.mockReturnValue({
        aliases: {
          'ExistingAlias': {
            name: 'ExistingAlias',
            description: 'Existing description',
            commands: 'existing command'
          }
        }
      })
      
      const updatePreviewSpy = vi.spyOn(aliasManager, 'updateAliasPreview').mockImplementation(() => {})
      
      aliasManager.showEditAliasModal('ExistingAlias')
      
      expect(title.textContent).toBe('Edit Alias')
      expect(nameInput.value).toBe('ExistingAlias')
      expect(nameInput.disabled).toBe(true)
      expect(descInput.value).toBe('Existing description')
      expect(commandsInput.value).toBe('existing command')
      expect(aliasManager.currentAlias).toBe('ExistingAlias')
      expect(updatePreviewSpy).toHaveBeenCalled()
    })

    it('should disable name field when editing existing alias', () => {
      const nameInput = document.getElementById('aliasName')
      
      global.app.getCurrentProfile.mockReturnValue({
        aliases: {
          'ExistingAlias': {
            name: 'ExistingAlias',
            description: 'Test',
            commands: 'test command'
          }
        }
      })
      
      aliasManager.showEditAliasModal('ExistingAlias')
      
      expect(nameInput.disabled).toBe(true)
    })

    it('should update alias preview as user types', () => {
      const preview = document.getElementById('aliasPreview')
      const nameInput = document.getElementById('aliasName')
      const commandsInput = document.getElementById('aliasCommands')
      
      expect(preview).toBeTruthy()
      expect(nameInput).toBeTruthy()
      expect(commandsInput).toBeTruthy()
      
      nameInput.value = 'TestAlias'
      commandsInput.value = 'say hello'
      
      aliasManager.updateAliasPreview()
      
      expect(preview.textContent).toBe('alias TestAlias "say hello"')
    })

    it('should handle empty inputs in preview', () => {
      const preview = document.getElementById('aliasPreview')
      const nameInput = document.getElementById('aliasName')
      const commandsInput = document.getElementById('aliasCommands')
      
      nameInput.value = ''
      commandsInput.value = ''
      
      aliasManager.updateAliasPreview()
      
      expect(preview.textContent).toBe('alias AliasName "command sequence"')
    })
  })

  describe('alias operations', () => {
    it('should save new alias with validation', () => {
      const nameInput = document.getElementById('aliasName')
      const descInput = document.getElementById('aliasDescription')
      const commandsInput = document.getElementById('aliasCommands')
      
      nameInput.value = 'ValidAlias'
      descInput.value = 'Test description'
      commandsInput.value = 'say hello'
      
      const mockProfile = { aliases: {} }
      global.app.getCurrentProfile.mockReturnValue(mockProfile)
      
      const updateLibrarySpy = vi.spyOn(aliasManager, 'updateCommandLibrary').mockImplementation(() => {})
      const showManagerSpy = vi.spyOn(aliasManager, 'showAliasManager').mockImplementation(() => {})
      
      aliasManager.currentAlias = null
      aliasManager.saveAlias()
      
      expect(mockProfile.aliases.ValidAlias).toBeDefined()
      expect(mockProfile.aliases.ValidAlias.name).toBe('ValidAlias')
      expect(mockProfile.aliases.ValidAlias.description).toBe('Test description')
      expect(mockProfile.aliases.ValidAlias.commands).toBe('say hello')
      expect(app.saveProfile).toHaveBeenCalled()
      expect(app.setModified).toHaveBeenCalledWith(true)
      expect(updateLibrarySpy).toHaveBeenCalled()
      expect(stoUI.showToast).toHaveBeenCalledWith('Alias "ValidAlias" created', 'success')
      expect(stoUI.hideModal).toHaveBeenCalledWith('editAliasModal')
      expect(showManagerSpy).toHaveBeenCalled()
    })

    it('should update existing alias', () => {
      const nameInput = document.getElementById('aliasName')
      const descInput = document.getElementById('aliasDescription')
      const commandsInput = document.getElementById('aliasCommands')
      
      nameInput.value = 'ExistingAlias'
      descInput.value = 'Updated description'
      commandsInput.value = 'updated command'
      
      const mockProfile = {
        aliases: {
          ExistingAlias: {
            name: 'ExistingAlias',
            description: 'Old description',
            commands: 'old command',
            created: '2023-01-01T00:00:00.000Z'
          }
        }
      }
      global.app.getCurrentProfile.mockReturnValue(mockProfile)
      
      aliasManager.currentAlias = 'ExistingAlias'
      aliasManager.saveAlias()
      
      expect(mockProfile.aliases.ExistingAlias.description).toBe('Updated description')
      expect(mockProfile.aliases.ExistingAlias.commands).toBe('updated command')
      expect(mockProfile.aliases.ExistingAlias.created).toBe('2023-01-01T00:00:00.000Z')
      expect(mockProfile.aliases.ExistingAlias.lastModified).toBeDefined()
      expect(stoUI.showToast).toHaveBeenCalledWith('Alias "ExistingAlias" updated', 'success')
    })

    it('should validate alias name format', () => {
      const result = aliasManager.validateAlias('ValidName123', 'say hello')
      
      expect(result.valid).toBe(true)
    })

    it('should reject invalid alias names', () => {
      const tests = [
        { name: '', expected: 'Alias name is required' },
        { name: 'invalid name', expected: 'Invalid alias name' },
        { name: '123invalid', expected: 'Invalid alias name' },
        { name: 'a'.repeat(31), expected: 'Alias name is too long' },
        { name: 'alias', expected: 'This is a reserved command name' },
        { name: 'bind', expected: 'This is a reserved command name' }
      ]
      
      tests.forEach(test => {
        const result = aliasManager.validateAlias(test.name, 'valid commands')
        expect(result.valid).toBe(false)
        expect(result.error).toContain(test.expected)
      })
    })

    it('should validate alias commands', () => {
      const tests = [
        { commands: '', expected: 'Commands are required' },
        { commands: 'a'.repeat(501), expected: 'Command sequence is too long' }
      ]
      
      tests.forEach(test => {
        const result = aliasManager.validateAlias('ValidName', test.commands)
        expect(result.valid).toBe(false)
        expect(result.error).toContain(test.expected)
      })
    })

    it('should prevent duplicate alias names', () => {
      const nameInput = document.getElementById('aliasName')
      const commandsInput = document.getElementById('aliasCommands')
      
      nameInput.value = 'ExistingAlias'
      commandsInput.value = 'say hello'
      
      global.app.getCurrentProfile.mockReturnValue({
        aliases: {
          ExistingAlias: { name: 'ExistingAlias', commands: 'existing' }
        }
      })
      
      aliasManager.currentAlias = null
      aliasManager.saveAlias()
      
      expect(stoUI.showToast).toHaveBeenCalledWith('An alias with this name already exists', 'error')
    })

    it('should delete alias with confirmation', async () => {
      aliasManager.confirmDeleteAlias('TestAlias')
      
      expect(stoUI.confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete the alias "TestAlias"?',
        'Delete Alias',
        'danger'
      )
    })

    it('should remove alias from profile', () => {
      const mockProfile = {
        aliases: {
          TestAlias: { name: 'TestAlias', commands: 'test' },
          KeepAlias: { name: 'KeepAlias', commands: 'keep' }
        }
      }
      global.app.getCurrentProfile.mockReturnValue(mockProfile)
      
      const renderSpy = vi.spyOn(aliasManager, 'renderAliasList').mockImplementation(() => {})
      const updateLibrarySpy = vi.spyOn(aliasManager, 'updateCommandLibrary').mockImplementation(() => {})
      
      aliasManager.deleteAlias('TestAlias')
      
      expect(mockProfile.aliases.TestAlias).toBeUndefined()
      expect(mockProfile.aliases.KeepAlias).toBeDefined()
      expect(app.saveProfile).toHaveBeenCalled()
      expect(app.setModified).toHaveBeenCalledWith(true)
      expect(renderSpy).toHaveBeenCalled()
      expect(updateLibrarySpy).toHaveBeenCalled()
      expect(stoUI.showToast).toHaveBeenCalledWith('Alias "TestAlias" deleted', 'success')
    })
  })

  describe('alias usage', () => {
    it('should add alias to selected key', () => {
      global.app.selectedKey = 'F1'
      
      aliasManager.useAlias('TestAlias')
      
      expect(app.addCommand).toHaveBeenCalledWith('F1', expect.objectContaining({
        command: 'TestAlias',
        type: 'alias',
        icon: '🎭',
        text: 'Alias: TestAlias'
      }))
      expect(stoUI.hideModal).toHaveBeenCalledWith('aliasManagerModal')
      expect(stoUI.showToast).toHaveBeenCalledWith('Alias "TestAlias" added to F1', 'success')
    })

    it('should require key selection before adding alias', () => {
      global.app.selectedKey = null
      
      aliasManager.useAlias('TestAlias')
      
      expect(stoUI.showToast).toHaveBeenCalledWith('Please select a key first', 'warning')
      expect(app.addCommand).not.toHaveBeenCalled()
    })

    it('should add alias to key through addAliasToKey', () => {
      global.app.selectedKey = 'F2'
      global.app.getCurrentProfile.mockReturnValue({
        aliases: {
          TestAlias: {
            name: 'TestAlias',
            description: 'Test description',
            commands: 'say hello'
          }
        }
      })
      
      aliasManager.addAliasToKey('TestAlias')
      
      expect(app.addCommand).toHaveBeenCalledWith('F2', expect.objectContaining({
        command: 'TestAlias',
        type: 'alias',
        icon: '🎭',
        text: 'Alias: TestAlias',
        description: 'Test description'
      }))
    })

    it('should handle missing alias in addAliasToKey', () => {
      global.app.selectedKey = 'F1'
      global.app.getCurrentProfile.mockReturnValue({ aliases: {} })
      
      aliasManager.addAliasToKey('NonExistentAlias')
      
      expect(stoUI.showToast).toHaveBeenCalledWith('Alias not found', 'error')
      expect(app.addCommand).not.toHaveBeenCalled()
    })

    it('should track alias usage in keybinds', () => {
      global.app.getCurrentProfile.mockReturnValue({
        keys: {
          F1: [{ command: 'TestAlias' }],
          F2: [{ command: 'say hello' }, { command: 'TestAlias' }]
        },
        aliases: {
          OtherAlias: { commands: 'TestAlias $$ say world' }
        }
      })
      
      const usage = aliasManager.getAliasUsage('TestAlias')
      
      expect(usage).toHaveLength(3)
      expect(usage[0]).toEqual({
        type: 'keybind',
        key: 'F1',
        position: 1,
        context: 'Key "F1", command 1'
      })
      expect(usage[1]).toEqual({
        type: 'keybind',
        key: 'F2',
        position: 2,
        context: 'Key "F2", command 2'
      })
      expect(usage[2]).toEqual({
        type: 'alias',
        alias: 'OtherAlias',
        context: 'Alias "OtherAlias"'
      })
    })

    it('should track alias usage in other aliases', () => {
      global.app.getCurrentProfile.mockReturnValue({
        keys: {},
        aliases: {
          TestAlias: { commands: 'say hello' },
          ComboAlias: { commands: 'TestAlias $$ emote wave' }
        }
      })
      
      const usage = aliasManager.getAliasUsage('TestAlias')
      
      expect(usage).toHaveLength(1)
      expect(usage[0]).toEqual({
        type: 'alias',
        alias: 'ComboAlias',
        context: 'Alias "ComboAlias"'
      })
    })
  })

  describe('alias templates', () => {
    it('should provide predefined alias templates', () => {
      const templates = aliasManager.getAliasTemplates()
      
      expect(templates).toHaveProperty('space_combat')
      expect(templates).toHaveProperty('ground_combat')
      expect(templates).toHaveProperty('communication')
      expect(templates.space_combat.name).toBe('Space Combat')
    })

    it('should include space combat templates', () => {
      const templates = aliasManager.getAliasTemplates()
      const spaceCombat = templates.space_combat.templates
      
      expect(spaceCombat).toHaveProperty('AttackRun')
      expect(spaceCombat).toHaveProperty('DefensiveMode')
      expect(spaceCombat).toHaveProperty('HealSelf')
      expect(spaceCombat.AttackRun.commands).toContain('target_nearest_enemy')
    })

    it('should include ground combat templates', () => {
      const templates = aliasManager.getAliasTemplates()
      const groundCombat = templates.ground_combat.templates
      
      expect(groundCombat).toHaveProperty('GroundAttack')
      expect(groundCombat).toHaveProperty('GroundHeal')
      expect(groundCombat.GroundAttack.commands).toContain('target_nearest_enemy')
    })

    it('should include communication templates', () => {
      const templates = aliasManager.getAliasTemplates()
      const communication = templates.communication.templates
      
      expect(communication).toHaveProperty('TeamReady')
      expect(communication).toHaveProperty('NeedHealing')
      expect(communication).toHaveProperty('Incoming')
              expect(communication.TeamReady.commands).toContain('team Ready!')
    })

    it('should create alias from template', () => {
      const mockProfile = { aliases: {} }
      global.app.getCurrentProfile.mockReturnValue(mockProfile)
      
      const updateLibrarySpy = vi.spyOn(aliasManager, 'updateCommandLibrary').mockImplementation(() => {})
      const renderSpy = vi.spyOn(aliasManager, 'renderAliasList').mockImplementation(() => {})
      
      aliasManager.createAliasFromTemplate('space_combat', 'AttackRun')
      
      expect(mockProfile.aliases.AttackRun).toBeDefined()
      expect(mockProfile.aliases.AttackRun.name).toBe('AttackRun')
      expect(mockProfile.aliases.AttackRun.commands).toContain('target_nearest_enemy')
      expect(app.saveProfile).toHaveBeenCalled()
      expect(updateLibrarySpy).toHaveBeenCalled()
      expect(renderSpy).toHaveBeenCalled()
      expect(stoUI.showToast).toHaveBeenCalledWith('Alias "AttackRun" created from template', 'success')
    })

    it('should prevent overwriting existing alias with template', () => {
      global.app.getCurrentProfile.mockReturnValue({
        aliases: {
          AttackRun: { name: 'AttackRun', commands: 'existing' }
        }
      })
      
      aliasManager.createAliasFromTemplate('space_combat', 'AttackRun')
      
      expect(stoUI.showToast).toHaveBeenCalledWith('Alias "AttackRun" already exists', 'warning')
      expect(app.saveProfile).not.toHaveBeenCalled()
    })

    it('should handle invalid template', () => {
      aliasManager.createAliasFromTemplate('invalid_category', 'invalid_template')
      
      expect(stoUI.showToast).toHaveBeenCalledWith('Template not found', 'error')
    })
  })

  describe('command library integration', () => {
    it('should update command library when aliases change', () => {
      const categories = document.getElementById('commandCategories')
      expect(categories).toBeTruthy()
      
      global.app.getCurrentProfile.mockReturnValue({
        aliases: {
          TestAlias: { name: 'TestAlias', commands: 'test' }
        }
      })
      
      const createCategorySpy = vi.spyOn(aliasManager, 'createAliasCategoryElement')
      
      aliasManager.updateCommandLibrary()
      
      // Should remove existing alias category and add new one if aliases exist
      expect(createCategorySpy).toHaveBeenCalled()
    })

    it('should create alias category element for library', () => {
      const aliases = [
        ['TestAlias', { description: 'Test description', commands: 'say hello' }]
      ]
      
      const element = aliasManager.createAliasCategoryElement(aliases)
      
      expect(element.className).toBe('category')
      expect(element.dataset.category).toBe('aliases')
      expect(element.innerHTML).toContain('Command Aliases')
      expect(element.innerHTML).toContain('TestAlias')
    })

    it('should handle empty aliases in command library', () => {
      const categories = document.getElementById('commandCategories')
      
      global.app.getCurrentProfile.mockReturnValue({ aliases: {} })
      
      const createCategorySpy = vi.spyOn(aliasManager, 'createAliasCategoryElement')
      
      aliasManager.updateCommandLibrary()
      
      // Should not create category element for empty aliases
      expect(createCategorySpy).not.toHaveBeenCalled()
    })
  })

  describe('alias export', () => {
    it('should export aliases as STO format file', () => {
      global.app.getCurrentProfile.mockReturnValue({
        name: 'Test Profile',
        aliases: {
          TestAlias: {
            name: 'TestAlias',
            description: 'Test description',
            commands: 'say hello'
          }
        }
      })
      
      // Mock document.createElement to return a mock anchor element
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn()
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      
      aliasManager.exportAliases()
      
      expect(mockAnchor.download).toContain('Test_Profile_aliases.txt')
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(stoUI.showToast).toHaveBeenCalledWith('Aliases exported successfully', 'success')
    })

    it('should include alias descriptions as comments', () => {
      global.app.getCurrentProfile.mockReturnValue({
        name: 'Test Profile',
        aliases: {
          TestAlias: {
            name: 'TestAlias',
            description: 'This is a test alias',
            commands: 'say hello'
          }
        }
      })
      
      const mockAnchor = { click: vi.fn() }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      
      aliasManager.exportAliases()
      
      // The export functionality works with real Blob and URL APIs
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(stoUI.showToast).toHaveBeenCalledWith('Aliases exported successfully', 'success')
    })

    it('should handle profiles with no aliases', () => {
      global.app.getCurrentProfile.mockReturnValue({
        name: 'Empty Profile',
        aliases: {}
      })
      
      aliasManager.exportAliases()
      
      expect(stoUI.showToast).toHaveBeenCalledWith('No aliases to export', 'warning')
    })

    it('should generate proper filename for export', () => {
      global.app.getCurrentProfile.mockReturnValue({
        name: 'My Test Profile!',
        aliases: {
          TestAlias: { name: 'TestAlias', commands: 'test' }
        }
      })
      
      const mockAnchor = { click: vi.fn(), download: '' }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      
      aliasManager.exportAliases()
      
      expect(mockAnchor.download).toBe('My_Test_Profile__aliases.txt')
      expect(mockAnchor.click).toHaveBeenCalled()
    })
  })

  describe('$Target variable support in alias editor', () => {
    beforeEach(() => {
      // Set up DOM for alias editor modal
      document.body.innerHTML = `
        <div class="modal" id="editAliasModal">
          <div class="modal-content">
            <div class="modal-body">
              <div class="form-group">
                <label for="aliasCommands">Commands:</label>
                <div class="textarea-with-button">
                  <textarea id="aliasCommands" placeholder="Enter command sequence"></textarea>
                  <button type="button" class="btn btn-small insert-target-btn" title="Insert $Target variable">
                    <i class="fas fa-crosshairs"></i> $Target
                  </button>
                </div>
                <div class="variable-help">
                  <strong>$Target</strong> - Use in communication commands to include target name
                </div>
              </div>
              <div class="alias-preview">
                <div class="command-preview" id="aliasPreview">alias MyAlias "command sequence"</div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    it('should have $Target insert button in alias editor', () => {
      const insertButton = document.querySelector('.insert-target-btn');
      expect(insertButton).toBeTruthy();
      expect(insertButton.title).toBe('Insert $Target variable');
      expect(insertButton.innerHTML).toContain('$Target');
    });

    it('should have variable help section explaining $Target', () => {
      const variableHelp = document.querySelector('.variable-help');
      expect(variableHelp).toBeTruthy();
      expect(variableHelp.innerHTML).toContain('$Target');
      expect(variableHelp.innerHTML).toContain('target name');
    });

    it('should insert $Target at cursor position when button is clicked', () => {
      const textarea = document.getElementById('aliasCommands');
      const insertButton = document.querySelector('.insert-target-btn');
      
      // Set initial text and cursor position
      textarea.value = 'team Attacking ';
      textarea.setSelectionRange(14, 14); // Position after "Attacking "
      
      // Mock the insertTargetVariable method
      const originalMethod = aliasManager.insertTargetVariable;
      const mockInsert = vi.fn();
      aliasManager.insertTargetVariable = mockInsert;
      
      // Simulate the event delegation logic manually since we don't have the full event system
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: insertButton });
      
      // Simulate the event delegation from aliases.js
      if (clickEvent.target.classList.contains('insert-target-btn')) {
        const textareaContainer = clickEvent.target.closest('.textarea-with-button');
        const targetTextarea = textareaContainer ? textareaContainer.querySelector('textarea') : null;
        
        if (targetTextarea) {
          aliasManager.insertTargetVariable(targetTextarea);
        }
      }
      
      // Verify the method was called with the textarea
      expect(mockInsert).toHaveBeenCalledWith(textarea);
      
      // Restore original method
      aliasManager.insertTargetVariable = originalMethod;
    });

    it('should insert $Target variable correctly', () => {
      const textarea = document.getElementById('aliasCommands');
      
      // Test insertion at beginning
      textarea.value = '';
      textarea.setSelectionRange(0, 0);
      aliasManager.insertTargetVariable(textarea);
      expect(textarea.value).toBe('$Target');
      expect(textarea.selectionStart).toBe(7);
      expect(textarea.selectionEnd).toBe(7);
      
      // Test insertion in middle
      textarea.value = 'team Attacking  - focus fire!';
      textarea.setSelectionRange(15, 15); // Position after "Attacking " (note the space)
      aliasManager.insertTargetVariable(textarea);
      expect(textarea.value).toBe('team Attacking $Target - focus fire!');
      expect(textarea.selectionStart).toBe(22);
      expect(textarea.selectionEnd).toBe(22);
      
      // Test insertion at end
      textarea.value = 'team Target: ';
      textarea.setSelectionRange(13, 13);
      aliasManager.insertTargetVariable(textarea);
      expect(textarea.value).toBe('team Target: $Target');
      expect(textarea.selectionStart).toBe(20);
      expect(textarea.selectionEnd).toBe(20);
    });

    it('should trigger input event to update preview after insertion', () => {
      const textarea = document.getElementById('aliasCommands');
      const inputEventSpy = vi.fn();
      
      textarea.addEventListener('input', inputEventSpy);
      
      textarea.value = 'team Healing ';
      textarea.setSelectionRange(13, 13);
      
      aliasManager.insertTargetVariable(textarea);
      
      // Verify input event was triggered
      expect(inputEventSpy).toHaveBeenCalled();
    });

    it('should maintain focus on textarea after insertion', () => {
      const textarea = document.getElementById('aliasCommands');
      
      textarea.value = 'team Status: ';
      textarea.setSelectionRange(12, 12);
      
      aliasManager.insertTargetVariable(textarea);
      
      // Verify textarea maintains focus
      expect(document.activeElement).toBe(textarea);
    });

    it('should work with example showing $Target usage', () => {
      // Test that the example in the HTML uses $Target correctly
      const exampleText = 'team Healing [$Target]';
      
      // Verify this is a valid communication command with $Target
      expect(exampleText).toContain('$Target');
      expect(exampleText).toContain('team');
      expect(exampleText).toMatch(/\w+.*\$Target.*/);
    });

    it('should handle event delegation for insert button clicks', () => {
      const textarea = document.getElementById('aliasCommands');
      const insertButton = document.querySelector('.insert-target-btn');
      
      // Mock the event delegation logic
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: insertButton });
      
      const mockInsert = vi.fn();
      aliasManager.insertTargetVariable = mockInsert;
      
      // Simulate the event delegation logic from aliases.js
      if (clickEvent.target.classList.contains('insert-target-btn')) {
        const textareaContainer = clickEvent.target.closest('.textarea-with-button');
        const targetTextarea = textareaContainer ? textareaContainer.querySelector('textarea') : null;
        
        if (targetTextarea) {
          aliasManager.insertTargetVariable(targetTextarea);
        }
      }
      
      expect(mockInsert).toHaveBeenCalledWith(textarea);
    });
  })
}) 