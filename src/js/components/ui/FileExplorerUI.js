import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import FileSystemService, { KEY_SYNC_FOLDER } from '../services/FileSystemService.js'
import { request } from '../../core/requestResponse.js'

// NOTE: The FileExplorerUI is a refactor of the legacy src/js/ui/fileexplorer.js implementation.
// It follows the modern Component pattern:  
//   * Extends ComponentBase for a unified lifecycle & event-bus handling  
//   * Receives its dependencies via the constructor (with sane fallbacks for legacy globals)  
//   * Contains ONLY presentation / DOM logic – all persistence is delegated to FileSystemService.

export default class FileExplorerUI extends ComponentBase {
  constructor ({
    storage,          // StorageService (profile data)
    ui,               // STOUIManager (toast, modal helpers)
    fileSystem,       // FileSystemService (FS-API helpers)
    document = window.document,
  } = {}) {
    super(eventBus)
    this.componentName = 'FileExplorerUI'

    // ----- Dependencies & fallbacks (for tests/legacy code) -----
    this.storage       = storage       || window.storageService || null
    this.ui            = ui            || window.stoUI          || null
    this.fileSystem    = fileSystem    || FileSystemService._getInstance()
    this.document      = document

    // ----- UI element ids -----
    this.modalId   = 'fileExplorerModal'
    this.treeId    = 'fileTree'
    this.contentId = 'fileContent'

    this.selectedNode       = null
    this.currentDirectory   = null  // Handle to user-chosen folder (sync-dir or manual)
  }

  /* ============================================================
   * Lifecycle hooks
   * ========================================================== */
  onInit () {
    this.setupEventListeners()
  }

  /* ============================================================
   * Event handling – DOM & app-bus
   * ========================================================== */
  setupEventListeners () {
    // Listen for file-explorer:open event from HeaderMenuUI
    this.eventBus.on('file-explorer:open', () => {
      this.openExplorer()
    })

    // Open Explorer button (toolbar)
    eventBus.onDom('fileExplorerBtn', 'click', 'fileExplorer-open', () => {
      this.openExplorer()
    })

    // Delegate clicks on tree nodes
    eventBus.onDom(this.treeId, 'click', 'fileExplorer-tree-click', (e) => {
      const node = e.target.closest('.tree-node')
      if (!node) return
      this.selectNode(node)
    })

    // Copy preview content → clipboard
    eventBus.onDom('copyFileContentBtn', 'click', 'fileExplorer-copy-content', () => {
      const contentEl = this.document.getElementById(this.contentId)
      if (!contentEl) return
      const text = contentEl.textContent || ''
      if (!text.trim()) {
        this.ui?.showToast(i18next.t('nothing_to_copy'), 'warning')
        return
      }
      this.ui?.copyToClipboard(text)
      this.ui?.showToast(i18next.t('content_copied_to_clipboard'), 'success')
    })

    // Download preview file
    eventBus.onDom('downloadFileBtn', 'click', 'fileExplorer-download', async () => {
      if (!this.selectedNode) return
      const { type, profileId, environment } = this.selectedNode
      const contentEl = this.document.getElementById(this.contentId)
      if (!contentEl) return
      const text = contentEl.textContent || ''
      if (!text.trim()) return

      let filename = i18next.t('default_export_filename')
      if (this.storage) {
        const profile = this.storage.getProfile(profileId)
        try {
          if (type === 'build') {
            filename = await request(this.eventBus, 'export:generate-filename', {
              profile,
              extension: 'txt',
              environment
            })
          } else if (type === 'aliases') {
            filename = await request(this.eventBus, 'export:generate-alias-filename', {
              profile,
              extension: 'txt'
            })
          }
        } catch (error) {
          console.error('Failed to generate filename via ExportService:', error)
          // Keep default filename
        }
      }
      this.downloadFile(text, filename, 'text/plain')
    })

    // Listen for external file-operations (other components)
    this.addEventListener('file-explorer:open',   (data) => this.openFile(data.path))
    this.addEventListener('file-explorer:save',   (data) => this.saveFile(data.path, data.content))
  }

  /* ============================================================
   * UI actions
   * ========================================================== */
  openExplorer () {
    this.buildTree()
    // Reset preview
    const contentEl = this.document.getElementById(this.contentId)
    if (contentEl) {
      contentEl.textContent = i18next.t('select_an_item_on_the_left_to_preview_export')
    }
    this.ui?.showModal(this.modalId)
  }

  buildTree () {
    const treeEl = this.document.getElementById(this.treeId)
    if (!treeEl || !this.storage) return
    treeEl.innerHTML = ''

    const data = this.storage.getAllData()
    const profiles = data.profiles || {}

    Object.entries(profiles).forEach(([profileId, profile]) => {
      const profileNode = this.createNode('profile', profile.name, { profileId })

      // Child container
      const childrenContainer = this.document.createElement('div')
      childrenContainer.className = 'tree-children'

      // Space Build
      if (profile.builds && profile.builds.space) {
        const spaceNode = this.createNode('build', i18next.t('space_build') || 'Space Build', {
          profileId,
          environment: 'space',
        })
        childrenContainer.appendChild(spaceNode)
      }

      // Ground Build
      if (profile.builds && profile.builds.ground) {
        const groundNode = this.createNode('build', i18next.t('ground_build') || 'Ground Build', {
          profileId,
          environment: 'ground',
        })
        childrenContainer.appendChild(groundNode)
      }

      // Aliases node (aggregated)
      const aliasNode = this.createNode('aliases', i18next.t('aliases') || 'Aliases', { profileId })
      childrenContainer.appendChild(aliasNode)

      profileNode.appendChild(childrenContainer)
      treeEl.appendChild(profileNode)
    })
  }

  createNode (type, label, dataset = {}) {
    const node = this.document.createElement('div')
    node.className = `tree-node ${type}`
    node.textContent = label
    node.dataset.type = type
    Object.entries(dataset).forEach(([k,v]) => node.setAttribute(`data-${k}`, v))
    return node
  }

  async selectNode (node) {
    // Remove previous selection
    const prevSel = this.document.querySelector('.tree-node.selected')
    if (prevSel) prevSel.classList.remove('selected')
    node.classList.add('selected')

    const type        = node.dataset.type        || node.getAttribute('data-type')
    const profileId   = node.getAttribute('data-profileid')
    const environment = node.getAttribute('data-environment')

    this.selectedNode = { type, profileId, environment }

    if (!profileId || !this.storage) return

    try {
      let exportContent = ''
      if (type === 'build') {
        exportContent = await this.generateBuildExport(profileId, environment)
      } else if (type === 'aliases') {
        exportContent = await this.generateAliasExport(profileId)
      } else {
        exportContent = i18next.t('select_a_space_ground_build_or_aliases_to_preview_export')
      }

      const contentEl = this.document.getElementById(this.contentId)
      if (contentEl) contentEl.textContent = exportContent || i18next.t('no_content_available')

    } catch (err) {
      console.error('Failed to generate export content:', err)
      this.ui?.showToast(i18next.t('failed_to_generate_export'), 'error')
    }
  }

  /* ============================================================
   * Export helpers – use request/response to ExportService
   * ========================================================== */
  async generateBuildExport (profileId, environment) {
    const rootProfile = this.storage.getProfile(profileId)
    if (!rootProfile || !rootProfile.builds || !rootProfile.builds[environment]) return ''
    const build = rootProfile.builds[environment]

    const tempProfile = {
      name: `${rootProfile.name} ${environment}`,
      mode: environment,
      keybinds: {
        [environment]: build.keys || {}
      },
      keybindMetadata: rootProfile.keybindMetadata || {},
      aliases: build.aliases || {},
      currentEnvironment: environment
    }
    
    return await request(this.eventBus, 'export:generate-keybind-file', {
      profile: tempProfile,
      options: { environment }
    }).catch((error) => {
      console.error('Failed to generate keybind export via ExportService:', error)
      return `; Failed to generate export: ${error.message}`
    })
  }

  async generateAliasExport (profileId) {
    const rootProfile = this.storage.getProfile(profileId)
    if (!rootProfile) return ''

    const aggregatedAliases = {
      ...(rootProfile.aliases            || {}),
      ...(rootProfile.builds?.space?.aliases  || {}),
      ...(rootProfile.builds?.ground?.aliases || {}),
    }
    const tempProfile = {
      name: rootProfile.name,
      mode: rootProfile.currentEnvironment || 'space',
      aliases: aggregatedAliases,
    }
    
    return await request(this.eventBus, 'export:generate-alias-file', {
      profile: tempProfile
    }).catch((error) => {
      console.error('Failed to generate alias export via ExportService:', error)
      return `; Failed to generate export: ${error.message}`
    })
  }

  /* ============================================================
   * File operations – via FileSystemService
   * ========================================================== */
  async ensureDirectoryHandle () {
    if (this.currentDirectory) return this.currentDirectory
    // Attempt to load previously saved user-selected dir
    this.currentDirectory = await this.fileSystem.getDirectoryHandle(KEY_SYNC_FOLDER)
    return this.currentDirectory
  }

  async openFile (path) {
    // Reading files is not yet required by the application logic.
    // This stub exists to demonstrate the service usage and future extension.
    console.log('[FileExplorerUI] openFile – not implemented yet:', path)
  }

  async saveFile (relativePath, content) {
    try {
      let dirHandle = await this.ensureDirectoryHandle()
      if (!dirHandle) {
        console.warn('[FileExplorerUI] No directory handle available for saveFile')
        return
      }
      await this.fileSystem.writeFile(dirHandle, relativePath, content)
      this.ui?.showToast(i18next.t('file_saved_successfully'), 'success')
    } catch (error) {
      console.error('Failed to save file:', error)
      this.ui?.showToast(i18next.t('failed_to_save_file'), 'error')
    }
  }

  downloadFile (content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = this.document.createElement('a')
    a.href = url
    a.download = filename
    this.document.body.appendChild(a)
    a.click()
    this.document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
} 