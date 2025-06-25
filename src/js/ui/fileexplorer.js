// STO Tools Keybind Manager - File Explorer Modal
// Provides a tree view of profiles/builds/aliases and preview of export files
import eventBus from '../core/eventBus.js'

export default class STOFileExplorer {
  constructor() {
    this.modalId = 'fileExplorerModal'
    this.treeId = 'fileTree'
    this.contentId = 'fileContent'
    this.selectedNode = null
    this.currentDirectory = null
    this.fileHandles = new Map()
  }

  init() {
    this.setupEventListeners()
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
        stoUI.showToast(i18next.t('nothing_to_copy'), 'warning')
        return
      }
      stoUI.copyToClipboard(text)
      stoUI.showToast(i18next.t('content_copied_to_clipboard'), 'success')
    })

    eventBus.onDom('downloadFileBtn', 'click', 'download-file', () => {
      if (!this.selectedNode) return
      const { type, profileId, environment } = this.selectedNode
      const contentEl = document.getElementById(this.contentId)
      if (!contentEl) return
      const text = contentEl.textContent || ''
      if (!text.trim()) return
      let filename = i18next.t('default_export_filename')
      const profile = storageService.getProfile(profileId)
      if (type === 'build') {
        filename = stoExport.generateFileName(profile, 'txt', environment)
      } else if (type === 'aliases') {
        filename = stoExport.generateAliasFileName(profile, 'txt')
      }
      stoExport.downloadFile(text, filename, 'text/plain')
    })

    // Listen for file operations
    eventBus.on('file-explorer:open', (data) => {
      this.openFile(data.path)
    })

    eventBus.on('file-explorer:save', (data) => {
      this.saveFile(data.path, data.content)
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
      contentEl.textContent = i18next.t('select_an_item_on_the_left_to_preview_export')
    }
    stoUI.showModal(this.modalId)
  }

  buildTree() {
    const treeEl = document.getElementById(this.treeId)
    if (!treeEl) return
    treeEl.innerHTML = ''

    const data = storageService.getAllData()
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

    this.selectedNode = { type, profileId: profileid, environment }

    if (!profileid) return
    try {
      let exportContent = ''
      if (type === 'build') {
        exportContent = this.generateBuildExport(profileid, environment)
      } else if (type === 'aliases') {
        exportContent = this.generateAliasExport(profileid)
      } else {
        // Root profile node selected – no export preview
        exportContent = i18next.t('select_a_space_ground_build_or_aliases_to_preview_export')
      }
      const contentEl = document.getElementById(this.contentId)
      if (contentEl) {
        contentEl.textContent = exportContent || 'No content available.'
      }
    } catch (err) {
      console.error('Failed to generate export content:', err)
      stoUI.showToast(i18next.t('failed_to_generate_export'), 'error')
    }
  }

  // ---------------------------------------------------------------------
  // Export Generators
  // ---------------------------------------------------------------------
  generateBuildExport(profileId, environment) {
    const rootProfile = storageService.getProfile(profileId)
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
    const rootProfile = storageService.getProfile(profileId)
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

  async openFile(path) {
    try {
      // Implementation for opening files
      console.log('Opening file:', path)
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }

  async saveFile(path, content) {
    try {
      // Implementation for saving files
      console.log('Saving file:', path)
    } catch (error) {
      console.error('Failed to save file:', error)
    }
  }

  async exportProfile(profileId) {
    try {
      const profile = storageService.getProfile(profileId)
      if (!profile) {
        throw new Error('Profile not found')
      }

      const data = {
        profile,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${profile.name}-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      return { success: true, data }
    } catch (error) {
      console.error('Failed to export profile:', error)
      return { success: false, error: error.message }
    }
  }

  async importProfile(file) {
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data.profile) {
        throw new Error('Invalid profile file format')
      }

      const profile = data.profile
      const profileId = this.generateProfileId(profile.name)

      // Check if profile already exists
      const existingData = storageService.getAllData()
      if (existingData.profiles[profileId]) {
        // Generate unique name
        profile.name = `${profile.name} (Imported)`
      }

      // Save the imported profile
      storageService.saveProfile(profileId, profile)

      // Add to profiles list if not already there
      existingData.profiles[profileId] = profile
      storageService.saveAllData(existingData)

      return { success: true, profileId, profile }
    } catch (error) {
      console.error('Failed to import profile:', error)
      return { success: false, error: error.message }
    }
  }

  async exportAllProfiles() {
    try {
      const data = storageService.getAllData()
      
      const exportData = {
        profiles: data.profiles,
        currentProfile: data.currentProfile,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `all-profiles-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      return { success: true, data: exportData }
    } catch (error) {
      console.error('Failed to export all profiles:', error)
      return { success: false, error: error.message }
    }
  }

  async importAllProfiles(file) {
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data.profiles || typeof data.profiles !== 'object') {
        throw new Error('Invalid profiles file format')
      }

      // Import all profiles
      const importedProfiles = {}
      for (const [profileId, profile] of Object.entries(data.profiles)) {
        const newProfileId = this.generateProfileId(profile.name)
        importedProfiles[newProfileId] = profile
        storageService.saveProfile(newProfileId, profile)
      }

      // Update main data structure
      const existingData = storageService.getAllData()
      existingData.profiles = { ...existingData.profiles, ...importedProfiles }
      
      // Set current profile if none exists
      if (!existingData.currentProfile && Object.keys(importedProfiles).length > 0) {
        existingData.currentProfile = Object.keys(importedProfiles)[0]
      }

      storageService.saveAllData(existingData)

      return { success: true, profiles: importedProfiles }
    } catch (error) {
      console.error('Failed to import all profiles:', error)
      return { success: false, error: error.message }
    }
  }

  generateProfileId(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now()
  }
}

// Create global instance and initialize when dependencies are ready
