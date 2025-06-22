import eventBus from "../core/eventBus.js"
export const profileManagement = {
  async loadData() {
    const data = stoStorage.getAllData()
    this.currentProfile = data.currentProfile

    const profileData = data.profiles[this.currentProfile]
    if (profileData) {
      this.currentEnvironment = profileData.currentEnvironment || 'space'
    } else {
      this.currentEnvironment = 'space'
    }

    if (!data.profiles[this.currentProfile]) {
      this.currentProfile = Object.keys(data.profiles)[0]
      this.saveCurrentProfile()
    }
  },

  saveProfile() {
    const virtualProfile = this.getCurrentProfile()

    if (!virtualProfile) {
      return
    }

    // Save current build data to the proper structure
    this.saveCurrentBuild()

    // Get the actual stored profile structure AFTER saveCurrentBuild
    const actualProfile = stoStorage.getProfile(this.currentProfile)
    if (!actualProfile) {
      return
    }

    // Update profile-level data (aliases, metadata, etc.) from virtual profile
    // but preserve the builds structure that was just saved
    const updatedProfile = {
      ...actualProfile, // Keep the actual structure with builds (now includes saved keybinds)
      // Update profile-level fields from virtual profile
      name: virtualProfile.name,
      description: virtualProfile.description || actualProfile.description,
      aliases: virtualProfile.aliases || {},
      keybindMetadata:
        virtualProfile.keybindMetadata || actualProfile.keybindMetadata,
      // Preserve existing profile fields
      created: actualProfile.created,
      lastModified: new Date().toISOString(),
      currentEnvironment: this.currentEnvironment,
    }

    stoStorage.saveProfile(this.currentProfile, updatedProfile)
  },

  saveData() {
    const data = stoStorage.getAllData()
    data.currentProfile = this.currentProfile
    data.lastModified = new Date().toISOString()

    if (stoStorage.saveAllData(data)) {
      this.setModified(false)
      return true
    }
    return false
  },

  saveCurrentProfile() {
    const data = stoStorage.getAllData()
    data.currentProfile = this.currentProfile
    return stoStorage.saveAllData(data)
  },

  setModified(modified = true) {
    this.isModified = modified
    const indicator = document.getElementById('modifiedIndicator')
    if (indicator) {
      indicator.style.display = modified ? 'inline' : 'none'
    }

    if (modified) {
      eventBus.emit('profile-modified')
    }
  },

  getCurrentProfile() {
    const profile = stoStorage.getProfile(this.currentProfile)
    if (!profile) return null

    return this.getCurrentBuild(profile)
  },

  getCurrentBuild(profile) {
    if (!profile) return null

    if (!profile.builds) {
      profile.builds = {
        space: { keys: {} },
        ground: { keys: {} },
      }
    }

    if (!profile.builds[this.currentEnvironment]) {
      profile.builds[this.currentEnvironment] = { keys: {} }
    }

    if (!profile.builds[this.currentEnvironment].keys) {
      profile.builds[this.currentEnvironment].keys = {}
    }

    return {
      ...profile,
      keys: profile.builds[this.currentEnvironment].keys,
      aliases: profile.aliases || {},
    }
  },

  switchProfile(profileId) {
    if (profileId !== this.currentProfile) {
      this.currentProfile = profileId
      this.selectedKey = null

      const profile = stoStorage.getProfile(profileId)
      if (profile) {
        this.currentEnvironment = profile.currentEnvironment || 'space'
      }

      this.saveCurrentProfile()
      this.renderKeyGrid()
      this.renderCommandChain()
      this.updateProfileInfo()

      const currentBuild = this.getCurrentProfile()
      stoUI.showToast(
        i18next.t('switched_to_profile', { name: currentBuild.name, environment: this.currentEnvironment }),
        'success'
      )
    }
  },

  createProfile(name, description = '', mode = 'space') {
    const profileId = this.generateProfileId(name)
    const profile = {
      name,
      description,
      currentEnvironment: mode,
      builds: {
        space: { keys: {} },
        ground: { keys: {} },
      },
      aliases: {},
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    }

    if (stoStorage.saveProfile(profileId, profile)) {
      this.switchProfile(profileId)
      this.renderProfiles()
      stoUI.showToast(i18next.t('profile_created', { name }), 'success')
      return profileId
    }

    stoUI.showToast(i18next.t('failed_to_create_profile'), 'error')
    return null
  },

  cloneProfile(sourceProfileId, newName) {
    const sourceProfile = stoStorage.getProfile(sourceProfileId)
    if (!sourceProfile) return null

    const profileId = this.generateProfileId(newName)
    const clonedProfile = {
      ...JSON.parse(JSON.stringify(sourceProfile)),
      name: newName,
      description: `Copy of ${sourceProfile.name}`,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    }

    if (stoStorage.saveProfile(profileId, clonedProfile)) {
      this.renderProfiles()
      stoUI.showToast(
        i18next.t('profile_created_from', { newName, sourceProfile: sourceProfile.name }),
        'success'
      )
      return profileId
    }

    stoUI.showToast(i18next.t('failed_to_clone_profile'), 'error')
    return null
  },

  deleteProfile(profileId) {
    const profile = stoStorage.getProfile(profileId)
    if (!profile) return false

    const data = stoStorage.getAllData()
    const profileCount = Object.keys(data.profiles).length

    if (profileCount <= 1) {
      stoUI.showToast(i18next.t('cannot_delete_the_last_profile'), 'warning')
      return false
    }

    if (stoStorage.deleteProfile(profileId)) {
      if (this.currentProfile === profileId) {
        const remaining = Object.keys(stoStorage.getAllData().profiles)
        this.switchProfile(remaining[0])
      }

      this.renderProfiles()
      stoUI.showToast(i18next.t('profile_deleted', { profileName: profile.name }), 'success')
      return true
    }

    stoUI.showToast(i18next.t('failed_to_delete_profile'), 'error')
    return false
  },

  saveCurrentBuild() {
    const profile = stoStorage.getProfile(this.currentProfile)
    const currentBuild = this.getCurrentProfile()

    if (profile && currentBuild) {
      if (!profile.builds) {
        profile.builds = {
          space: { keys: {} },
          ground: { keys: {} },
        }
      }

      profile.builds[this.currentEnvironment] = {
        keys: currentBuild.keys || {},
      }

      stoStorage.saveProfile(this.currentProfile, profile)
    }
  },

  generateProfileId(name) {
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '_')
    let id = base
    let counter = 1

    const data = stoStorage.getAllData()
    while (data.profiles[id]) {
      id = `${base}_${counter}`
      counter++
    }

    return id
  },
}
