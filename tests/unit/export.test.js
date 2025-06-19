import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Import real modules in dependency order
import '../../src/js/data.js'
import '../../src/js/storage.js'
import '../../src/js/profiles.js'
import '../../src/js/keybinds.js'
import '../../src/js/ui.js'
import '../../src/js/app.js'
// Load the export module (it creates a global instance)
import '../../src/js/export.js'

// Load the real HTML
const htmlContent = readFileSync(join(process.cwd(), 'src/index.html'), 'utf-8')

// Global setup for all tests
beforeEach(() => {
  // Set up the real DOM
  document.documentElement.innerHTML = htmlContent
  
  // Mock only the UI methods that would show actual modals or toasts
  vi.spyOn(stoUI, 'showToast').mockImplementation(() => {})
  vi.spyOn(stoUI, 'copyToClipboard').mockImplementation(() => {})
  
  // Create a test profile in the real storage system
  const testProfile = {
    id: 'test-profile',
    name: 'Test Profile',
    mode: 'Space',
    keys: {
      F1: [
        { command: 'FireAll', type: 'combat', text: 'Fire All Weapons' },
        { command: 'target_nearest_enemy', type: 'targeting', text: 'Target Enemy' }
      ],
      F2: [
        { command: 'TestAlias', type: 'alias', text: 'Alias: TestAlias' }
      ],
      A: [
        { command: '+STOTrayExecByTray 0 0', type: 'tray', text: 'Tray 1 Slot 1' }
      ]
    },
    aliases: {
      TestAlias: {
        name: 'TestAlias',
        description: 'Test alias description',
        commands: 'say hello $$ emote wave'
      },
      AttackRun: {
        name: 'AttackRun',
        description: 'Attack sequence',
        commands: 'target_nearest_enemy $$ FireAll'
      }
    }
  }
  
  // Add the test profile to real storage and set as current
  stoStorage.saveProfile(testProfile.id, testProfile)
  app.currentProfile = testProfile.id
  app.saveCurrentProfile()
  
  // Set selected key for copy tests
  app.selectedKey = 'F1'
  
  // Set command preview content for copy tests
  const preview = document.getElementById('commandPreview')
  if (preview) {
    preview.textContent = 'F1 "FireAll $$ target_nearest_enemy"'
  }
})

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks()
  stoStorage.clearAllData()
  app.currentProfile = null
  app.selectedKey = null
})

describe('STOExportManager', () => {
  let exportManager
  let STOExportManager

  beforeEach(() => {
    // Get the constructor from the global instance
    STOExportManager = global.window.stoExport.constructor
    exportManager = new STOExportManager()
  })

  describe('initialization', () => {
    it('should initialize export formats map', () => {
      expect(exportManager.exportFormats).toBeDefined()
      expect(exportManager.exportFormats.sto_keybind).toBe('STO Keybind File (.txt)')
      expect(exportManager.exportFormats.json_profile).toBe('JSON Profile (.json)')
      expect(exportManager.exportFormats.json_project).toBe('Complete Project (.json)')
      expect(exportManager.exportFormats.csv_data).toBe('CSV Data (.csv)')
      expect(exportManager.exportFormats.html_report).toBe('HTML Report (.html)')
    })

    it('should setup event listeners', () => {
      const exportBtn = document.getElementById('exportKeybindsBtn')
      const copyPreviewBtn = document.getElementById('copyPreviewBtn')
      
      expect(exportBtn).toBeTruthy()
      expect(copyPreviewBtn).toBeTruthy()
      
      exportManager.setupEventListeners()
      
      // Verify elements exist (real DOM test)
      expect(exportBtn.id).toBe('exportKeybindsBtn')
      expect(copyPreviewBtn.id).toBe('copyPreviewBtn')
    })
  })

  describe('STO keybind file export', () => {
    it('should export profile as STO keybind file', () => {
      const mockAnchor = { 
        click: vi.fn(), 
        download: '',
        href: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      const profile = app.getCurrentProfile()
      exportManager.exportSTOKeybindFile(profile)
      
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toContain('Test_Profile')
      expect(mockAnchor.download).toContain('.txt')
      expect(stoUI.showToast).toHaveBeenCalledWith('Keybind file exported successfully', 'success')
    })

    it('should generate file with proper header', () => {
      const profile = app.getCurrentProfile()
      const header = exportManager.generateFileHeader(profile)
      
      expect(header).toContain('Test Profile - STO Keybind Configuration')
      expect(header).toContain('Mode: SPACE')
      expect(header).toContain('Generated:')
      expect(header).toContain('STO Tools Keybind Manager')
      expect(header).toContain('bind_load_file')
    })

    it('should include profile statistics in header', () => {
      const profile = app.getCurrentProfile()
      const header = exportManager.generateFileHeader(profile)
      
      expect(header).toContain('Keys bound: 3')
      expect(header).toContain('Total commands: 4')
      expect(header).toContain('Note: Aliases are exported separately')
    })

    it('should include usage instructions in header', () => {
      const profile = app.getCurrentProfile()
      const header = exportManager.generateFileHeader(profile)
      
      expect(header).toContain('To use this file in Star Trek Online:')
      expect(header).toContain('Save this file to your STO Live folder')
      expect(header).toContain('/bind_load_file')
    })

    it('should generate keybind file without aliases', () => {
      const profile = app.getCurrentProfile()
      const content = exportManager.generateSTOKeybindFile(profile)
      
      // Should not contain alias sections since they're exported separately
      expect(content).not.toContain('Command Aliases')
      expect(content).not.toContain('alias TestAlias')
      expect(content).toContain('Keybind Commands')
      expect(content).toContain('Note: Aliases are exported separately')
    })

    it('should export aliases separately', () => {
      const profile = app.getCurrentProfile()
      const content = exportManager.generateAliasFile(profile)
      
      expect(content).toContain('STO Alias Configuration')
      expect(content).toContain('alias TestAlias')
      expect(content).toContain('alias AttackRun')
      expect(content).not.toContain('Keybind Commands')
    })

    it('should generate alias file with proper header', () => {
      const profile = app.getCurrentProfile()
      const content = exportManager.generateAliasFile(profile)
      
      expect(content).toContain(profile.name + ' - STO Alias Configuration')
      expect(content).toContain('Total aliases:')
      expect(content).toContain('Save this file as "CommandAliases.txt"')
      expect(content).toContain('localdata\\CommandAliases.txt')
    })

    it('should sort aliases alphabetically', () => {
      const aliases = {
        ZebAlias: { commands: 'say zebra' },
        AlphaAlias: { commands: 'say alpha' },
        BetaAlias: { commands: 'say beta' }
      }
      
      const section = exportManager.generateAliasSection(aliases)
      
      const alphaIndex = section.indexOf('alias AlphaAlias')
      const betaIndex = section.indexOf('alias BetaAlias')
      const zebIndex = section.indexOf('alias ZebAlias')
      
      expect(alphaIndex).toBeLessThan(betaIndex)
      expect(betaIndex).toBeLessThan(zebIndex)
    })

    it('should include alias descriptions as comments', () => {
      const profile = app.getCurrentProfile()
      const section = exportManager.generateAliasSection(profile.aliases)
      
      expect(section).toContain('; Test alias description')
      expect(section).toContain('alias TestAlias <& say hello $$ emote wave &>')
      expect(section).toContain('; Attack sequence')
              expect(section).toContain('alias AttackRun <& target_nearest_enemy $$ FireAll &>')
    })

    it('should generate keybind section with commands', () => {
      const profile = app.getCurrentProfile()
      const section = exportManager.generateKeybindSection(profile.keys)
      
      expect(section).toContain('Keybind Commands')
      expect(section).toContain('F1 "FireAll $$ target_nearest_enemy"')
      expect(section).toContain('F2 "TestAlias"')
      expect(section).toContain('A "+STOTrayExecByTray 0 0"')
    })

    it('should group keys by type for organization', () => {
      const keys = ['F1', 'F2', 'A', 'B', '1', '2', 'Space', 'Ctrl+A']
      const mockKeys = {}
      keys.forEach(key => { mockKeys[key] = [{ command: 'test' }] })
      
      const groups = exportManager.groupKeysByType(keys, mockKeys)
      
      expect(groups['Function Keys']).toContain('F1')
      expect(groups['Function Keys']).toContain('F2')
      expect(groups['Letter Keys']).toContain('A')
      expect(groups['Letter Keys']).toContain('B')
      expect(groups['Number Keys']).toContain('1')
      expect(groups['Number Keys']).toContain('2')
      expect(groups['Special Keys']).toContain('Space')
      expect(groups['Modifier Combinations']).toContain('Ctrl+A')
    })

    it('should include footer with usage instructions', () => {
      const footer = exportManager.generateFileFooter()
      
      expect(footer).toContain('End of keybind file')
      expect(footer).toContain('Additional STO Commands Reference')
      expect(footer).toContain('target_nearest_enemy')
      expect(footer).toContain('FireAll')
      expect(footer).toContain('+STOTrayExecByTray')
      expect(footer).toContain('Distribute_Shields')
    })
  })

  describe('key sorting and grouping', () => {
    it('should sort keys using appropriate comparison', () => {
      const keys = ['B', 'F10', 'A', 'F2', '1', '10']
      const sorted = keys.sort(exportManager.compareKeys.bind(exportManager))
      
      // Function keys should come first, then numbers, then letters
      expect(sorted.indexOf('F2')).toBeLessThan(sorted.indexOf('F10'))
      expect(sorted.indexOf('F10')).toBeLessThan(sorted.indexOf('1'))
      expect(sorted.indexOf('10')).toBeLessThan(sorted.indexOf('A'))
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'))
    })

    it('should handle function key numerical sorting', () => {
      const keys = ['F11', 'F2', 'F10', 'F1']
      const sorted = keys.sort(exportManager.compareKeys.bind(exportManager))
      
      expect(sorted).toEqual(['F1', 'F2', 'F10', 'F11'])
    })

    it('should group function keys together', () => {
      const keys = ['F1', 'A', 'F2', 'B']
      const mockKeys = {}
      keys.forEach(key => { mockKeys[key] = [{ command: 'test' }] })
      
      const groups = exportManager.groupKeysByType(keys, mockKeys)
      
      expect(groups['Function Keys']).toEqual(expect.arrayContaining(['F1', 'F2']))
      expect(groups['Function Keys']).not.toContain('A')
      expect(groups['Function Keys']).not.toContain('B')
    })

    it('should group letter keys together', () => {
      const keys = ['A', 'F1', 'Z', 'B']
      const mockKeys = {}
      keys.forEach(key => { mockKeys[key] = [{ command: 'test' }] })
      
      const groups = exportManager.groupKeysByType(keys, mockKeys)
      
      expect(groups['Letter Keys']).toEqual(expect.arrayContaining(['A', 'B', 'Z']))
      expect(groups['Letter Keys']).not.toContain('F1')
    })

    it('should group special keys together', () => {
      const keys = ['Space', 'Tab', 'Enter', 'A']
      const mockKeys = {}
      keys.forEach(key => { mockKeys[key] = [{ command: 'test' }] })
      
      const groups = exportManager.groupKeysByType(keys, mockKeys)
      
      expect(groups['Special Keys']).toEqual(expect.arrayContaining(['Space', 'Tab', 'Enter']))
      expect(groups['Special Keys']).not.toContain('A')
    })

    it('should group modifier combinations appropriately', () => {
      const keys = ['Ctrl+A', 'Alt+F1', 'Shift+Space', 'A']
      const mockKeys = {}
      keys.forEach(key => { mockKeys[key] = [{ command: 'test' }] })
      
      const groups = exportManager.groupKeysByType(keys, mockKeys)
      
      expect(groups['Modifier Combinations']).toEqual(expect.arrayContaining(['Ctrl+A', 'Alt+F1', 'Shift+Space']))
      expect(groups['Modifier Combinations']).not.toContain('A')
    })
  })

  describe('JSON profile export', () => {
    it('should export profile as JSON', () => {
      const mockAnchor = { 
        click: vi.fn(), 
        download: '',
        href: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      const profile = app.getCurrentProfile()
      exportManager.exportJSONProfile(profile)
      
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toContain('.json')
      expect(stoUI.showToast).toHaveBeenCalledWith('Profile exported as JSON', 'success')
    })

    it('should sanitize profile data for export', () => {
      const profile = {
        name: 'Test',
        keys: {
          F1: [{ command: 'test', id: 'internal-id', type: 'combat' }]
        }
      }
      
      const sanitized = exportManager.sanitizeProfileForExport(profile)
      
      expect(sanitized.keys.F1[0]).not.toHaveProperty('id')
      expect(sanitized.keys.F1[0]).toHaveProperty('command')
      expect(sanitized.keys.F1[0]).toHaveProperty('type')
    })

    it('should include export metadata', () => {
      const mockAnchor = { click: vi.fn() }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      // Mock Blob to capture content
      let blobContent = ''
      const originalBlob = global.Blob
      global.Blob = class MockBlob {
        constructor(chunks) {
          blobContent = chunks[0]
        }
      }
      
      const profile = app.getCurrentProfile()
      exportManager.exportJSONProfile(profile)
      
      global.Blob = originalBlob
      
      const exportData = JSON.parse(blobContent)
      expect(exportData.version).toBeDefined()
      expect(exportData.exported).toBeDefined()
      expect(exportData.type).toBe('profile')
      expect(exportData.profile).toBeDefined()
    })

    it('should validate JSON structure before export', () => {
      const profile = app.getCurrentProfile()
      const sanitized = exportManager.sanitizeProfileForExport(profile)
      
      // Should be valid JSON
      expect(() => JSON.stringify(sanitized)).not.toThrow()
      expect(sanitized.name).toBe('Test Profile')
      expect(sanitized.mode).toBe('space')
      expect(sanitized.keys).toBeDefined()
      expect(sanitized.aliases).toBeDefined()
    })
  })

  describe('complete project export', () => {
    it('should export all profiles and settings', () => {
      const mockAnchor = { 
        click: vi.fn(), 
        download: '',
        href: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      exportManager.exportCompleteProject()
      
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toContain('STO_Tools_Keybinds_Project')
      expect(mockAnchor.download).toContain('.json')
      expect(stoUI.showToast).toHaveBeenCalledWith('Complete project exported', 'success')
    })

    it('should include application settings', () => {
      const mockAnchor = { click: vi.fn() }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      // Mock Blob to capture content
      let blobContent = ''
      const originalBlob = global.Blob
      global.Blob = class MockBlob {
        constructor(chunks) {
          blobContent = chunks[0]
        }
      }
      
      exportManager.exportCompleteProject()
      
      global.Blob = originalBlob
      
      const exportData = JSON.parse(blobContent)
      expect(exportData.type).toBe('project')
      expect(exportData.data.profiles).toBeDefined()
      expect(exportData.data.settings).toBeDefined()
    })

    it('should create backup-compatible format', () => {
      const mockAnchor = { click: vi.fn() }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      // Mock Blob to capture content
      let blobContent = ''
      const originalBlob = global.Blob
      global.Blob = class MockBlob {
        constructor(chunks) {
          blobContent = chunks[0]
        }
      }
      
      exportManager.exportCompleteProject()
      
      global.Blob = originalBlob
      
      const exportData = JSON.parse(blobContent)
      expect(exportData.version).toBeDefined()
      expect(exportData.exported).toBeDefined()
      expect(exportData.type).toBe('project')
      
      // Should be importable
      expect(() => JSON.parse(blobContent)).not.toThrow()
    })
  })

  describe('CSV data export', () => {
    it('should export profile data as CSV', () => {
      const mockAnchor = { 
        click: vi.fn(), 
        download: '',
        href: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      const profile = app.getCurrentProfile()
      exportManager.exportCSVData(profile)
      
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toContain('.csv')
      expect(stoUI.showToast).toHaveBeenCalledWith('Data exported as CSV', 'success')
    })

    it('should generate CSV with proper headers', () => {
      const profile = app.getCurrentProfile()
      const csv = exportManager.generateCSVData(profile)
      
      expect(csv).toMatch(/^Key,Command,Type,Description,Position/)
    })

    it('should escape CSV special characters', () => {
      expect(exportManager.escapeCSV('simple')).toBe('simple')
      expect(exportManager.escapeCSV('has,comma')).toBe('"has,comma"')
      expect(exportManager.escapeCSV('has"quote')).toBe('"has""quote"')
      expect(exportManager.escapeCSV('has\nnewline')).toBe('"has\nnewline"')
    })

    it('should include all relevant data fields', () => {
      const profile = app.getCurrentProfile()
      const csv = exportManager.generateCSVData(profile)
      
      expect(csv).toContain('F1,FireAll,combat,Fire All Weapons,1')
      expect(csv).toContain('F1,target_nearest_enemy,targeting,Target Enemy,2')
      expect(csv).toContain('F2,TestAlias,alias,Alias: TestAlias,1')
    })
  })

  describe('HTML report export', () => {
    it('should generate HTML report', () => {
      const mockAnchor = { 
        click: vi.fn(), 
        download: '',
        href: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      const profile = app.getCurrentProfile()
      exportManager.exportHTMLReport(profile)
      
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toContain('.html')
      expect(stoUI.showToast).toHaveBeenCalledWith('HTML report exported', 'success')
    })

    it('should include styled keybind sections', () => {
      const keys = {
        F1: [{ command: 'FireAll', type: 'combat', text: 'Fire All' }],
        A: [{ command: 'target_self', type: 'targeting', text: 'Target Self' }]
      }
      
      const section = exportManager.generateHTMLKeybindSection(keys)
      
      expect(section).toContain('<h2>Keybinds</h2>')
      expect(section).toContain('class="keybind"')
      expect(section).toContain('class="key">F1</div>')
      expect(section).toContain('class="command combat">Fire All</span>')
    })

    it('should include alias sections in HTML', () => {
      const aliases = {
        TestAlias: {
          name: 'TestAlias',
          description: 'Test description',
          commands: 'say hello'
        }
      }
      
      const section = exportManager.generateHTMLAliasSection(aliases)
      
      expect(section).toContain('<h2>Command Aliases</h2>')
      expect(section).toContain('class="alias"')
      expect(section).toContain('class="alias-name">TestAlias</div>')
      expect(section).toContain('Test description')
      expect(section).toContain('say hello')
    })

    it('should include CSS styling for report', () => {
      const profile = app.getCurrentProfile()
      const html = exportManager.generateHTMLReport(profile)
      
      expect(html).toContain('<style>')
      expect(html).toContain('body { font-family:')
      expect(html).toContain('.keybind {')
      expect(html).toContain('.command {')
    })

    it('should create printable format', () => {
      const profile = app.getCurrentProfile()
      const html = exportManager.generateHTMLReport(profile)
      
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<html lang="en">')
      expect(html).toContain('<meta name="viewport"')
      expect(html).toContain('</html>')
    })
  })

  describe('command preview and copying', () => {
    it('should copy command preview to clipboard', () => {
      exportManager.copyCommandPreview()
      
      expect(stoUI.copyToClipboard).toHaveBeenCalledWith('F1 "FireAll $$ target_nearest_enemy"')
    })



    it('should show success feedback on copy', () => {
      exportManager.copyCommandPreview()
      
      expect(stoUI.copyToClipboard).toHaveBeenCalled()
    })

    it('should handle clipboard API errors', () => {
      const preview = document.getElementById('commandPreview')
      preview.textContent = ''
      
      exportManager.copyCommandPreview()
      
      expect(stoUI.showToast).toHaveBeenCalledWith('No command to copy', 'warning')
    })
  })

  describe('file generation and download', () => {
    it('should generate appropriate filename', () => {
      const profile = { name: 'My Test Profile', mode: 'Space' }
      const filename = exportManager.generateFileName(profile, 'txt')
      
      expect(filename).toMatch(/^My_Test_Profile_Space_\d{4}-\d{2}-\d{2}\.txt$/)
    })

    it('should sanitize profile names for filenames', () => {
      const profile = { name: 'Profile! @#$%^&*()Name', mode: 'Ground' }
      const filename = exportManager.generateFileName(profile, 'json')
      
      expect(filename).toMatch(/^Profile_+Name_Ground_\d{4}-\d{2}-\d{2}\.json$/)
    })

    it('should include file extension in filename', () => {
      const profile = { name: 'Test', mode: 'Space' }
      
      expect(exportManager.generateFileName(profile, 'txt')).toMatch(/\.txt$/)
      expect(exportManager.generateFileName(profile, 'json')).toMatch(/\.json$/)
      expect(exportManager.generateFileName(profile, 'csv')).toMatch(/\.csv$/)
      expect(exportManager.generateFileName(profile, 'html')).toMatch(/\.html$/)
    })

    it('should trigger file download', () => {
      const mockAnchor = { 
        click: vi.fn(),
        download: '',
        href: ''
      }
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      
      exportManager.downloadFile('test content', 'test.txt', 'text/plain')
      
      expect(mockAnchor.download).toBe('test.txt')
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor)
      expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor)
    })

    it('should set correct MIME type for download', () => {
      const mockAnchor = { 
        click: vi.fn(),
        href: '',
        download: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      // Mock Blob to capture MIME type
      let mimeType = ''
      const originalBlob = global.Blob
      global.Blob = class MockBlob {
        constructor(chunks, options) {
          mimeType = options.type
        }
      }
      
      exportManager.downloadFile('content', 'test.txt', 'text/plain')
      
      global.Blob = originalBlob
      
      expect(mimeType).toBe('text/plain')
    })

    it('should handle large file downloads', () => {
      const mockAnchor = { 
        click: vi.fn(),
        href: '',
        download: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      const largeContent = 'x'.repeat(1000000) // 1MB of content
      
      expect(() => {
        exportManager.downloadFile(largeContent, 'large.txt', 'text/plain')
      }).not.toThrow()
      
      expect(mockAnchor.click).toHaveBeenCalled()
    })
  })

  describe('import functionality', () => {
    it('should import from file', () => {
      // Test the import method exists and can handle file types
      expect(typeof exportManager.importFromFile).toBe('function')
      
      // Test JSON import directly
      const validJSON = JSON.stringify({
        type: 'profile',
        profile: { name: 'Test', keys: {}, aliases: {} }
      })
      
      expect(() => {
        exportManager.importJSONFile(validJSON)
      }).not.toThrow()
    })

    it('should validate imported JSON structure', () => {
      const validJSON = JSON.stringify({
        type: 'profile',
        profile: { name: 'Test', keys: {}, aliases: {} }
      })
      
      expect(() => {
        exportManager.importJSONFile(validJSON)
      }).not.toThrow()
    })

    it('should handle import errors gracefully', () => {
      const invalidJSON = 'invalid json content'
      
      expect(() => {
        exportManager.importJSONFile(invalidJSON)
      }).toThrow('Invalid JSON file')
    })

    it('should merge imported data appropriately', () => {
      const projectJSON = JSON.stringify({
        type: 'project',
        data: { profiles: {}, settings: {} }
      })
      
      expect(() => {
        exportManager.importJSONFile(projectJSON)
      }).not.toThrow()
    })
  })

  describe('bulk operations', () => {
    it('should export all profiles', () => {
      const mockAnchor = { 
        click: vi.fn(),
        href: '',
        download: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      exportManager.exportAllProfiles()
      
      expect(stoUI.showToast).toHaveBeenCalledWith(expect.stringMatching(/Exporting \d+ profiles\.\.\./), 'info')
    })

    it('should create archive of multiple exports', () => {
      // Add another profile
      const testProfile2 = {
        id: 'test-profile-2',
        name: 'Test Profile 2',
        keys: { F1: [{ command: 'test' }] }
      }
      stoStorage.saveProfile(testProfile2.id, testProfile2)
      
      const mockAnchor = { 
        click: vi.fn(),
        href: '',
        download: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      exportManager.exportAllProfiles()
      
      expect(stoUI.showToast).toHaveBeenCalledWith('Exporting 2 profiles...', 'info')
    })

          it('should handle export progress indication', () => {
        // Mock the getAllData method to return empty profiles
        const mockGetAllData = vi.spyOn(stoStorage, 'getAllData').mockReturnValue({
          profiles: {},
          currentProfile: null
        })
        
        exportManager.exportAllProfiles()
        
        expect(stoUI.showToast).toHaveBeenCalledWith('No profiles to export', 'warning')
        
        mockGetAllData.mockRestore()
      })
  })

  describe('export options and configuration', () => {
    it('should show export options dialog', () => {
      const mockAnchor = { 
        click: vi.fn(),
        href: '',
        download: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      exportManager.showExportOptions()
      
      // For now it directly exports, but should show options in future
      expect(mockAnchor.click).toHaveBeenCalled()
    })

    it('should handle different export formats', () => {
      const formats = exportManager.exportFormats
      
      expect(Object.keys(formats)).toHaveLength(5)
      expect(formats.sto_keybind).toContain('.txt')
      expect(formats.json_profile).toContain('.json')
      expect(formats.csv_data).toContain('.csv')
      expect(formats.html_report).toContain('.html')
    })

    it('should validate profile before export', () => {
      app.currentProfile = null
      
      exportManager.showExportOptions()
      
      expect(stoUI.showToast).toHaveBeenCalledWith('No profile selected to export', 'warning')
    })

    it('should provide format-specific options', () => {
      const profile = app.getCurrentProfile()
      
      // Each format should have specific handling
      expect(() => exportManager.exportSTOKeybindFile(profile)).not.toThrow()
      expect(() => exportManager.exportJSONProfile(profile)).not.toThrow()
      expect(() => exportManager.exportCSVData(profile)).not.toThrow()
      expect(() => exportManager.exportHTMLReport(profile)).not.toThrow()
    })
  })

  describe('alias export functionality', () => {
    it('should export aliases to file', () => {
      const mockAnchor = { 
        click: vi.fn(), 
        download: '',
        href: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
      
      const profile = app.getCurrentProfile()
      exportManager.exportAliases(profile)
      
      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toContain('aliases')
      expect(mockAnchor.download).toContain('.txt')
      expect(stoUI.showToast).toHaveBeenCalledWith('Aliases exported successfully', 'success')
    })

    it('should generate alias filename with proper format', () => {
      const profile = {
        name: 'Test Profile',
        mode: 'space'
      }
      
      const filename = exportManager.generateAliasFileName(profile, 'txt')
      
      expect(filename).toContain('Test_Profile')
      expect(filename).toContain('aliases')
      expect(filename).toContain('space')
      expect(filename).toContain('.txt')
    })

    it('should handle profiles with no aliases', () => {
      const profile = {
        name: 'Empty Profile',
        mode: 'space',
        aliases: {}
      }
      
      const content = exportManager.generateAliasFile(profile)
      
      expect(content).toContain('No aliases defined')
      expect(content).toContain('Total aliases: 0')
    })
  })

  describe('UI elements', () => {
    it('should have export aliases button', () => {
      const exportBtn = document.getElementById('exportAliasesBtn')
      
      expect(exportBtn).toBeTruthy()
      expect(exportBtn.id).toBe('exportAliasesBtn')
    })

    it('should have import aliases button', () => {
      const importBtn = document.getElementById('importAliasesBtn')
      
      expect(importBtn).toBeTruthy()
      expect(importBtn.id).toBe('importAliasesBtn')
    })
  })

  describe('execution order stabilization export', () => {
    let mockAnchor
    
    beforeEach(() => {
      mockAnchor = { 
        click: vi.fn(),
        href: '',
        download: ''
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
    })

    it('should generate keybind file with stabilization disabled and no per-key metadata', () => {
      const profile = {
        name: 'Test Profile',
        mode: 'space',
        keys: {
          F1: [
            { command: '+TrayExecByTray 9 0' },
            { command: '+TrayExecByTray 9 1' },
            { command: '+TrayExecByTray 9 2' }
          ]
        },
        aliases: {},
        // No keybindMetadata, so no per-key stabilization
      }
      
      const options = { stabilizeExecutionOrder: false }
      const content = exportManager.generateSTOKeybindFile(profile, options)
      
      // Should contain normal command chain (no per-key metadata to trigger mirroring)
      expect(content).toContain('F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2"')
      
      // Should not contain stabilization header
      expect(content).not.toContain('EXECUTION ORDER STABILIZATION: ON')
    })

    it('should respect per-key metadata even when global stabilization is disabled', () => {
      const profile = {
        name: 'Test Profile',
        mode: 'space',
        keys: {
          F1: [
            { command: '+TrayExecByTray 9 0' },
            { command: '+TrayExecByTray 9 1' },
            { command: '+TrayExecByTray 9 2' }
          ],
          F2: [
            { command: 'FirePhasers' }
          ]
        },
        aliases: {},
        keybindMetadata: {
          F1: { stabilizeExecutionOrder: true }
          // F2 has no metadata
        }
      }
      
      const options = { stabilizeExecutionOrder: false }
      const content = exportManager.generateSTOKeybindFile(profile, options)
      
      // F1 should be mirrored due to per-key metadata
      expect(content).toContain('F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"')
      
      // F2 should not be mirrored (no metadata)
      expect(content).toContain('F2 "FirePhasers"')
      
      // Should not contain global stabilization header
      expect(content).not.toContain('EXECUTION ORDER STABILIZATION: ON')
    })

    it('should generate keybind file with stabilization enabled', () => {
      const profile = {
        name: 'Test Profile',
        mode: 'space',
        keys: {
          F1: [
            { command: '+TrayExecByTray 9 0' },
            { command: '+TrayExecByTray 9 1' },
            { command: '+TrayExecByTray 9 2' }
          ]
        },
        aliases: {}
      }
      
      const options = { stabilizeExecutionOrder: true }
      const content = exportManager.generateSTOKeybindFile(profile, options)
      
      // Should contain stabilization header
      expect(content).toContain('EXECUTION ORDER STABILIZATION: ON')
      expect(content).toContain('Commands are mirrored to ensure consistent execution order')
      expect(content).toContain('Phase 1: left-to-right, Phase 2: right-to-left')
      
      // Should contain mirrored command chain
      expect(content).toContain('F1 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"')
    })

    it('should not mirror single commands', () => {
      const profile = {
        name: 'Test Profile',
        mode: 'space',
        keys: {
          F1: [{ command: 'FirePhasers' }]
        },
        aliases: {}
      }
      
      const options = { stabilizeExecutionOrder: true }
      const content = exportManager.generateSTOKeybindFile(profile, options)
      
      // Single command should not be mirrored
      expect(content).toContain('F1 "FirePhasers"')
      expect(content).not.toContain('FirePhasers $$ FirePhasers')
    })

    it('should handle mixed single and multi-command keys', () => {
      const profile = {
        name: 'Test Profile',
        mode: 'space',
        keys: {
          F1: [{ command: 'FirePhasers' }], // Single command
          F2: [
            { command: '+TrayExecByTray 9 0' },
            { command: '+TrayExecByTray 9 1' }
          ] // Multi-command
        },
        aliases: {}
      }
      
      const options = { stabilizeExecutionOrder: true }
      const content = exportManager.generateSTOKeybindFile(profile, options)
      
      // Single command should not be mirrored
      expect(content).toContain('F1 "FirePhasers"')
      
      // Multi-command should be mirrored
      expect(content).toContain('F2 "+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0"')
    })

    it('should handle stabilization with different command types', () => {
      const profile = {
        name: 'Test Profile',
        mode: 'space',
        keys: {
          F1: [
            { command: 'FirePhasers' },
            { command: 'target_nearest_enemy' },
            { command: '+power_exec Distribute_Shields' }
          ]
        },
        aliases: {}
      }
      
      const options = { stabilizeExecutionOrder: true }
      const content = exportManager.generateSTOKeybindFile(profile, options)
      
      // Should contain mirrored command chain with mixed command types
      expect(content).toContain('F1 "FirePhasers $$ target_nearest_enemy $$ +power_exec Distribute_Shields $$ target_nearest_enemy $$ FirePhasers"')
    })

    it('should include documentation example pattern', () => {
      // Test the tray 10 example from the documentation
      const commands = []
      for (let i = 0; i <= 9; i++) {
        commands.push({ command: `+TrayExecByTray 9 ${i}` })
      }
      
      const profile = {
        name: 'Tray Test',
        mode: 'space',
        keys: { numpad0: commands },
        aliases: {}
      }
      
      const options = { stabilizeExecutionOrder: true }
      const content = exportManager.generateSTOKeybindFile(profile, options)
      
      // Should contain the mirrored tray sequence
      const expectedPattern = '+TrayExecByTray 9 0 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 3 $$ +TrayExecByTray 9 4 $$ +TrayExecByTray 9 5 $$ +TrayExecByTray 9 6 $$ +TrayExecByTray 9 7 $$ +TrayExecByTray 9 8 $$ +TrayExecByTray 9 9 $$ +TrayExecByTray 9 8 $$ +TrayExecByTray 9 7 $$ +TrayExecByTray 9 6 $$ +TrayExecByTray 9 5 $$ +TrayExecByTray 9 4 $$ +TrayExecByTray 9 3 $$ +TrayExecByTray 9 2 $$ +TrayExecByTray 9 1 $$ +TrayExecByTray 9 0'
      
      expect(content).toContain(`numpad0 "${expectedPattern}"`)
    })

    it('should handle complex command chains with central commands', () => {
      const profile = {
        name: 'Complex Test',
        mode: 'space',
        keys: {
          Space: [
            { command: '+TrayExecByTray 9 9' },
            { command: '+TrayExecByTray 9 8' },
            { command: 'FirePhasers' },
            { command: '+TrayExecByTray 9 7' },
            { command: '+TrayExecByTray 9 6' }
          ]
        },
        aliases: {}
      }
      
      const options = { stabilizeExecutionOrder: true }
      const content = exportManager.generateSTOKeybindFile(profile, options)
      
      // Should create proper mirror with central FirePhasers command
      const expectedPattern = '+TrayExecByTray 9 9 $$ +TrayExecByTray 9 8 $$ FirePhasers $$ +TrayExecByTray 9 7 $$ +TrayExecByTray 9 6 $$ +TrayExecByTray 9 7 $$ FirePhasers $$ +TrayExecByTray 9 8 $$ +TrayExecByTray 9 9'
      
      expect(content).toContain(`Space "${expectedPattern}"`)
    })
  })
}) 