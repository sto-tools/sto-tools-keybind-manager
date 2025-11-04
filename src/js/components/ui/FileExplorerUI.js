import UIComponentBase from '../UIComponentBase.js'
import FileSystemService, { KEY_SYNC_FOLDER } from '../services/FileSystemService.js'

/*
* FileExplorerUI – a UI component for managing file operations in the browser's file system.
*
* Responsibilities:
* 1. Provide a file explorer interface for users to navigate and preview files.
* 2. Provide a preview of the selected file's content.
* 3. Provide a download button for the selected file.
*/

export default class FileExplorerUI extends UIComponentBase {
  constructor ({
    eventBus,
    storage,
    ui,
    fileSystem,
    document = window.document,
  } = {}) {
    super(eventBus)
    this.componentName = 'FileExplorerUI'

    this.storage       = storage       || window.storageService || null
    this.ui            = ui            || window.stoUI          || null
    this.fileSystem    = fileSystem    || FileSystemService._getInstance()
    this.document      = document

    this.modalId   = 'fileExplorerModal'
    this.treeId    = 'fileTree'
    this.contentId = 'fileContent'

    this.selectedNode       = null
    this.currentDirectory   = null
  }

  // Lifecycle hooks
  onInit () {
    this.setupEventListeners()
  }

  // Event handling – DOM & app-bus
  setupEventListeners () {
    // Listen for file-explorer:open event from HeaderMenuUI
    this.eventBus.on('file-explorer:open', () => {
      this.openExplorer()
    })

    // Open Explorer button (toolbar)
    this.onDom('fileExplorerBtn', 'click', 'fileExplorer-open', () => {
      this.openExplorer()
    })

    // Delegate clicks on tree nodes
    this.onDom(this.treeId, 'click', 'fileExplorer-tree-click', (e) => {
      const node = e.target.closest('.tree-node')
      if (!node) return
      this.selectNode(node)
    })

    // Copy preview content → clipboard
    this.onDom('copyFileContentBtn', 'click', 'fileExplorer-copy-content', async () => {
      const contentEl = this.document.getElementById(this.contentId)
      if (!contentEl) return
      const text = contentEl.textContent || ''
      if (!text.trim()) {
        this.showToast(i18next.t('nothing_to_copy'), 'warning')
        return
      }
      const result = await this.request('utility:copy-to-clipboard', { text })
      if (result?.success) {
        this.showToast(i18next.t?.(result?.message), 'success')
      } else {
        this.showToast(i18next.t?.(result?.message), 'error')
      }
    })

    // Download preview file
    this.onDom('downloadFileBtn', 'click', 'fileExplorer-download', async () => {
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
            filename = await this.request('export:generate-filename', {
              profile,
              extension: 'txt',
              environment
            })
          } else if (type === 'aliases') {
            filename = await this.request('export:generate-alias-filename', {
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
  }

  // UI actions
  openExplorer () {
    this.buildTree()
    // Reset preview
    const contentEl = this.document.getElementById(this.contentId)
    if (contentEl) {
      contentEl.textContent = i18next.t('select_an_item_on_the_left_to_preview_export')
    }
    this.emit('modal:show', { modalId: this.modalId })
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

  // Export helpers – use request/response to ExportService
  async generateBuildExport (profileId, environment) {
    const profile = this.storage.getProfile(profileId)
    if (!profile || !profile.builds || !profile.builds[environment]) return ''

    return await this.request('export:generate-keybind-file', {
      profileId,
      environment
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
    
    return await this.request('export:generate-alias-file', { profileId })
      .catch((error) => {
        console.error('Failed to generate alias export via ExportService:', error)
        return `; Failed to generate export: ${error.message}`
      })
  }

  // File operations – via FileSystemService
  async ensureDirectoryHandle () {
    if (this.currentDirectory) return this.currentDirectory
    // Attempt to load previously saved user-selected dir
    this.currentDirectory = await this.fileSystem.getDirectoryHandle(KEY_SYNC_FOLDER)
    return this.currentDirectory
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