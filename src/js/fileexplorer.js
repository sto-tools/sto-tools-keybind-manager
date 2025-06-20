// STO Tools Keybind Manager - File Explorer Modal
// Provides a tree view of profiles/builds/aliases and preview of export files
import eventBus from './eventBus.js'
import i18next from 'i18next'

const STO_PATHS = [
  'C:/Program Files (x86)/Steam/steamapps/common/Star Trek Online/Star Trek Online/Live',
  'C:/Program Files/Steam/steamapps/common/Star Trek Online/Star Trek Online/Live',
  'C:/Program Files/Perfect World Entertainment/Star Trek Online_en/Star Trek Online/Live',
  'C:/Program Files (x86)/Perfect World Entertainment/Star Trek Online_en/Star Trek Online/Live',
  'C:/Program Files/Epic Games/StarTrekOnline/Star Trek Online/Live',
]

export default class STOFileExplorer {
  constructor() {
    this.modalId = 'fileExplorerModal'
    this.treeId = 'fileTree'
    this.contentId = 'fileContent'
    this.stoDirectoryHandle = null
    this.currentExportContent = ''
    this.currentExportFilename = ''
  }

  async init() {
    this.setupEventListeners()
    await this.detectSTOPath()
  }

  // ---------------------------------------------------------------------
  // Event Handling
  // ---------------------------------------------------------------------
  setupEventListeners() {
    // Open Explorer button
    eventBus.onDom('fileExplorerBtn', 'click', 'fileExplorer-open', () => {
      this.openExplorer()
    })

    // Delegate clicks on tree nodes
    eventBus.onDom(this.treeId, 'click', 'fileExplorer-tree-click', (e) => {
      const node = e.target.closest('.tree-node')
      if (!node) return
      this.selectNode(node)
    })

    // Copy file content
    eventBus.onDom('copyFileContentBtn', 'click', 'copyFileContent', () => {
      const contentEl = document.getElementById(this.contentId)
      if (!contentEl) return
      const text = contentEl.textContent || ''
      if (!text.trim()) {
        stoUI.showToast('Nothing to copy', 'warning')
        return
      }
      stoUI.copyToClipboard(text)
      stoUI.showToast('Content copied to clipboard', 'success')
    })

    eventBus.onDom('copyToStoBtn', 'click', 'copyToSto', () => {
      this.copyToSTO()
    })

    eventBus.onDom('browseStoFolderBtn', 'click', 'browseStoFolder', () => {
      this.browseStoFolder()
    })
  }

  // ---------------------------------------------------------------------
  // UI Actions
  // ---------------------------------------------------------------------
  openExplorer() {
    this.buildTree()
    // Reset preview
    const contentEl = document.getElementById(this.contentId)
    if (contentEl) {
      contentEl.textContent = 'Select an item on the left to preview export'
    }
    this.updateFolderStatus()
    this.refreshStoFileList()
    stoUI.showModal(this.modalId)
  }

  buildTree() {
    const treeEl = document.getElementById(this.treeId)
    if (!treeEl) return
    treeEl.innerHTML = ''

    const data = stoStorage.getAllData()
    const profiles = data.profiles || {}

    Object.entries(profiles).forEach(([profileId, profile]) => {
      const profileNode = this.createNode('profile', profile.name, {
        profileId,
      })

      // Child container
      const childrenContainer = document.createElement('div')
      childrenContainer.className = 'tree-children'

      // Space Build
      if (profile.builds && profile.builds.space) {
        const spaceNode = this.createNode('build', 'Space Build', {
          profileId,
          environment: 'space',
        })
        childrenContainer.appendChild(spaceNode)
      }

      // Ground Build
      if (profile.builds && profile.builds.ground) {
        const groundNode = this.createNode('build', 'Ground Build', {
          profileId,
          environment: 'ground',
        })
        childrenContainer.appendChild(groundNode)
      }

      // Aliases node (aggregated)
      const aliasNode = this.createNode('aliases', 'Aliases', {
        profileId,
      })
      childrenContainer.appendChild(aliasNode)

      profileNode.appendChild(childrenContainer)
      treeEl.appendChild(profileNode)
    })
  }

  createNode(type, label, dataset = {}) {
    const node = document.createElement('div')
    node.className = `tree-node ${type}`
    node.textContent = label
    node.dataset.type = type
    Object.entries(dataset).forEach(([k, v]) => {
      // Use setAttribute for better test environment compatibility
      node.setAttribute(`data-${k}`, v)
    })
    return node
  }

  selectNode(node) {
    // Remove previous selection
    const prevSel = document.querySelector('.tree-node.selected')
    if (prevSel) prevSel.classList.remove('selected')
    node.classList.add('selected')

    const type = node.dataset.type || node.getAttribute('data-type')
    const profileid = node.getAttribute('data-profileid')
    const environment = node.getAttribute('data-environment')

    if (!profileid) return
    try {
      let exportContent = ''
      if (type === 'build') {
        exportContent = this.generateBuildExport(profileid, environment)
        this.currentExportFilename = `${profileid}_${environment}.txt`
      } else if (type === 'aliases') {
        exportContent = this.generateAliasExport(profileid)
        this.currentExportFilename = `${profileid}_aliases.txt`
      } else {
        // Root profile node selected – no export preview
        exportContent =
          'Select a Space/Ground build or Aliases to preview export.'
      }
      const contentEl = document.getElementById(this.contentId)
      if (contentEl) {
        contentEl.textContent = exportContent || 'No content available.'
      }
      this.currentExportContent = exportContent
    } catch (err) {
      console.error('Failed to generate export content:', err)
      stoUI.showToast('Failed to generate export', 'error')
    }
  }

  // ---------------------------------------------------------------------
  // Export Generators
  // ---------------------------------------------------------------------
  generateBuildExport(profileId, environment) {
    const rootProfile = stoStorage.getProfile(profileId)
    if (!rootProfile || !rootProfile.builds || !rootProfile.builds[environment])
      return ''
    const build = rootProfile.builds[environment]
    const tempProfile = {
      name: `${rootProfile.name} ${environment}`,
      mode: environment,
      keys: build.keys || {},
      // carry over full keybind metadata for stabilization preview
      keybindMetadata: rootProfile.keybindMetadata || {},
      // include build-specific aliases if present so users can see them in file (optional)
      aliases: build.aliases || {},
    }
    return stoExport.generateSTOKeybindFile(tempProfile, { environment })
  }

  generateAliasExport(profileId) {
    const rootProfile = stoStorage.getProfile(profileId)
    if (!rootProfile) return ''
    // Aggregate aliases from profile-level and both builds
    const aggregatedAliases = {
      ...(rootProfile.aliases || {}),
      ...(rootProfile.builds?.space?.aliases || {}),
      ...(rootProfile.builds?.ground?.aliases || {}),
    }
    const tempProfile = {
      name: rootProfile.name,
      mode: rootProfile.currentEnvironment || 'space',
      aliases: aggregatedAliases,
    }
    return stoExport.generateAliasFile(tempProfile)
  }

  async detectSTOPath() {
    if (typeof process !== 'undefined' && process.versions?.node) {
      try {
        const fs = (await import('fs')).default || (await import('fs'))
        for (const p of STO_PATHS) {
          if (fs.existsSync(p)) {
            this.stoDirectoryHandle = { path: p, fs }
            break
          }
        }
      } catch {}
    }
    this.updateFolderStatus()
    this.refreshStoFileList()
  }

  async browseStoFolder() {
    if (window.showDirectoryPicker) {
      try {
        this.stoDirectoryHandle = await window.showDirectoryPicker()
        this.updateFolderStatus()
        await this.refreshStoFileList()
      } catch (err) {
        console.error('Failed to pick folder', err)
        stoUI.showToast(i18next.t('sto_folder_not_found'), 'error')
      }
    } else {
      stoUI.showToast('File system access not supported', 'error')
    }
  }

  updateFolderStatus() {
    const statusEl = document.getElementById('stoFolderStatus')
    if (!statusEl) return
    if (this.stoDirectoryHandle) {
      statusEl.textContent = i18next.t('sto_folder_connected')
      statusEl.classList.remove('disconnected')
      statusEl.classList.add('connected')
    } else {
      statusEl.textContent = i18next.t('sto_folder_not_found')
      statusEl.classList.remove('connected')
      statusEl.classList.add('disconnected')
    }
  }

  async refreshStoFileList() {
    const listEl = document.getElementById('stoFileList')
    if (!listEl) return
    listEl.innerHTML = ''
    if (!this.stoDirectoryHandle) return
    try {
      if (this.stoDirectoryHandle.path && this.stoDirectoryHandle.fs) {
        const files = this.stoDirectoryHandle.fs.readdirSync(
          this.stoDirectoryHandle.path
        )
        files.forEach((f) => {
          const li = document.createElement('li')
          li.textContent = f
          listEl.appendChild(li)
        })
      } else if (this.stoDirectoryHandle.values) {
        for await (const entry of this.stoDirectoryHandle.values()) {
          if (entry.kind === 'file') {
            const li = document.createElement('li')
            li.textContent = entry.name
            listEl.appendChild(li)
          }
        }
      }
    } catch (err) {
      console.error('Failed to list STO directory', err)
    }
  }

  async copyToSTO() {
    if (!this.currentExportContent) return
    if (!this.stoDirectoryHandle) {
      await this.browseStoFolder()
      if (!this.stoDirectoryHandle) return
    }
    await this.writeFileToSTO(
      this.stoDirectoryHandle,
      this.currentExportFilename,
      this.currentExportContent
    )
  }

  async writeFileToSTO(directoryHandle, filename, content) {
    try {
      if (directoryHandle.getFileHandle) {
        const fileHandle = await directoryHandle.getFileHandle(filename, {
          create: true,
        })
        const writable = await fileHandle.createWritable()
        await writable.write(content)
        await writable.close()
      } else if (directoryHandle.path && directoryHandle.fs) {
        const pathMod = (await import('path')).default || (await import('path'))
        directoryHandle.fs.writeFileSync(
          pathMod.join(directoryHandle.path, filename),
          content,
          'utf-8'
        )
      }
      stoUI.showToast(
        i18next.t('file_copied_to_sto', { filename }),
        'success'
      )
      this.refreshStoFileList()
    } catch (err) {
      console.error('Failed to write file', err)
      stoUI.showToast(err.message, 'error')
    }
  }
}

// Create global instance and initialize when dependencies are ready
