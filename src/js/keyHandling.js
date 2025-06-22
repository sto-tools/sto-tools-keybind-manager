import eventBus from "./eventBus.js"
export const keyHandling = {
  selectKey(keyName) {
    this.selectedKey = keyName

    const profile = this.getCurrentProfile()
    const stabilizeCheckbox = document.getElementById('stabilizeExecutionOrder')
    if (stabilizeCheckbox && profile && profile.keybindMetadata) {
      let flag = false
      if (profile.keybindMetadata[this.currentEnvironment]) {
        const envMeta = profile.keybindMetadata[this.currentEnvironment]
        flag = !!(envMeta[keyName] && envMeta[keyName].stabilizeExecutionOrder)
      }
      stabilizeCheckbox.checked = flag
    } else if (stabilizeCheckbox) {
      stabilizeCheckbox.checked = false
    }

    this.renderKeyGrid()
    this.renderCommandChain()
    this.updateChainActions()
  },

  addKey(keyName) {
    if (!this.isValidKeyName(keyName)) {
      stoUI.showToast(i18next.t('invalid_key_name'), 'error')
      return false
    }

    const fullProfile = stoStorage.getProfile(this.currentProfile)
    if (!fullProfile) {
      stoUI.showToast(i18next.t('no_profile_selected'), 'error')
      return false
    }

    if (!fullProfile.builds) {
      fullProfile.builds = {
        space: { keys: {} },
        ground: { keys: {} },
      }
    }

    if (!fullProfile.builds[this.currentEnvironment]) {
      fullProfile.builds[this.currentEnvironment] = { keys: {} }
    }

    if (!fullProfile.builds[this.currentEnvironment].keys[keyName]) {
      fullProfile.builds[this.currentEnvironment].keys[keyName] = []

      stoStorage.saveProfile(this.currentProfile, fullProfile)

      this.renderKeyGrid()
      this.selectKey(keyName)
      this.setModified(true)

      stoUI.showToast(i18next.t('key_added', { keyName }), 'success')
      return true
    }
    stoUI.showToast(i18next.t('key_already_exists', { keyName }), 'warning')
    return false
  },

  deleteKey(keyName) {
    const fullProfile = stoStorage.getProfile(this.currentProfile)
    if (!fullProfile) {
      stoUI.showToast(i18next.t('no_profile_selected'), 'error')
      return false
    }

    if (
      fullProfile.builds &&
      fullProfile.builds[this.currentEnvironment] &&
      fullProfile.builds[this.currentEnvironment].keys &&
      fullProfile.builds[this.currentEnvironment].keys[keyName]
    ) {
      delete fullProfile.builds[this.currentEnvironment].keys[keyName]

      stoStorage.saveProfile(this.currentProfile, fullProfile)

      if (this.selectedKey === keyName) {
        this.selectedKey = null
      }

      this.renderKeyGrid()
      this.renderCommandChain()
      this.setModified(true)

      stoUI.showToast(i18next.t('key_deleted', { keyName }), 'success')
      return true
    }

    return false
  },

  isValidKeyName(keyName) {
    return STO_DATA.validation.keyNamePattern.test(keyName) && keyName.length <= 20
  },

  addCommand(keyName, command) {
    if (this.currentEnvironment === 'alias') {
      const profile = this.getCurrentProfile()

      if (!profile.aliases) {
        profile.aliases = {}
      }
      if (!profile.aliases[keyName]) {
        profile.aliases[keyName] = { description: '', commands: '' }
      }

      const currentCommands = profile.aliases[keyName].commands
      const newCommand = Array.isArray(command)
        ? command.map((cmd) => cmd.command).join(' $$ ')
        : command.command

      if (currentCommands) {
        profile.aliases[keyName].commands = currentCommands + ' $$ ' + newCommand
      } else {
        profile.aliases[keyName].commands = newCommand
      }

      stoStorage.saveProfile(this.currentProfile, profile)
      stoUI.showToast(i18next.t('command_added_to_alias'), 'success')
    } else {
      const fullProfile = stoStorage.getProfile(this.currentProfile)
      if (!fullProfile) {
        stoUI.showToast(i18next.t('no_profile_selected'), 'error')
        return
      }

      if (!fullProfile.builds) {
        fullProfile.builds = {
          space: { keys: {} },
          ground: { keys: {} },
        }
      }

      if (!fullProfile.builds[this.currentEnvironment]) {
        fullProfile.builds[this.currentEnvironment] = { keys: {} }
      }

      if (!fullProfile.builds[this.currentEnvironment].keys[keyName]) {
        fullProfile.builds[this.currentEnvironment].keys[keyName] = []
      }

      if (Array.isArray(command)) {
        command.forEach((cmd) => {
          if (!cmd.id) {
            cmd.id = this.generateCommandId()
          }
          fullProfile.builds[this.currentEnvironment].keys[keyName].push(cmd)
        })
        stoUI.showToast(i18next.t('commands_added', { count: command.length }), 'success')
      } else {
        if (!command.id) {
          command.id = this.generateCommandId()
        }
        fullProfile.builds[this.currentEnvironment].keys[keyName].push(command)
        stoUI.showToast(i18next.t('command_added'), 'success')
      }

      stoStorage.saveProfile(this.currentProfile, fullProfile)
    }

    this.renderCommandChain()
    if (this.currentEnvironment === 'alias') {
      this.renderAliasGrid()
    } else {
      this.renderKeyGrid()
    }
    this.setModified(true)

    eventBus.emit('command-modified', { keyName, command, action: 'add' })
  },

  deleteCommand(keyName, commandIndex) {
    if (this.currentEnvironment === 'alias') {
      const profile = this.getCurrentProfile()

      const alias = profile.aliases && profile.aliases[keyName]
      if (alias && alias.commands) {
        const commands = alias.commands.split('$$').map((cmd) => cmd.trim())
        if (commandIndex >= 0 && commandIndex < commands.length) {
          const deletedCommand = commands[commandIndex]
          commands.splice(commandIndex, 1)
          profile.aliases[keyName].commands = commands.join(' $$ ')

          stoStorage.saveProfile(this.currentProfile, profile)
          this.renderCommandChain()
          this.renderAliasGrid()
          this.setModified(true)

          stoUI.showToast(i18next.t('command_deleted_from_alias'), 'success')

          eventBus.emit('command-modified', {
            keyName,
            command: { command: deletedCommand },
            action: 'delete',
          })
        }
      }
    } else {
      const fullProfile = stoStorage.getProfile(this.currentProfile)
      if (!fullProfile) {
        stoUI.showToast(i18next.t('no_profile_selected'), 'error')
        return
      }

      if (
        fullProfile.builds &&
        fullProfile.builds[this.currentEnvironment] &&
        fullProfile.builds[this.currentEnvironment].keys &&
        fullProfile.builds[this.currentEnvironment].keys[keyName] &&
        fullProfile.builds[this.currentEnvironment].keys[keyName][commandIndex]
      ) {
        const deletedCommand = fullProfile.builds[this.currentEnvironment].keys[keyName][commandIndex]
        fullProfile.builds[this.currentEnvironment].keys[keyName].splice(commandIndex, 1)

        stoStorage.saveProfile(this.currentProfile, fullProfile)
        this.renderCommandChain()
        this.renderKeyGrid()
        this.setModified(true)

        stoUI.showToast(i18next.t('command_deleted'), 'success')

        eventBus.emit('command-modified', { keyName, command: deletedCommand, action: 'delete' })
      }
    }
  },

  moveCommand(keyName, fromIndex, toIndex) {
    if (this.currentEnvironment === 'alias') {
      const profile = this.getCurrentProfile()

      const alias = profile.aliases && profile.aliases[keyName]
      if (alias && alias.commands) {
        const commands = alias.commands.split('$$').map((cmd) => cmd.trim())

        if (
          fromIndex >= 0 &&
          fromIndex < commands.length &&
          toIndex >= 0 &&
          toIndex < commands.length
        ) {
          const [command] = commands.splice(fromIndex, 1)
          commands.splice(toIndex, 0, command)

          profile.aliases[keyName].commands = commands.join(' $$ ')
          stoStorage.saveProfile(this.currentProfile, profile)
          this.renderCommandChain()
          this.setModified(true)

          eventBus.emit('command-modified', {
            keyName,
            command: { command },
            action: 'move',
            fromIndex,
            toIndex,
          })
        }
      }
    } else {
      const fullProfile = stoStorage.getProfile(this.currentProfile)
      if (!fullProfile) {
        stoUI.showToast(i18next.t('no_profile_selected'), 'error')
        return
      }

      const commands =
        fullProfile.builds &&
        fullProfile.builds[this.currentEnvironment] &&
        fullProfile.builds[this.currentEnvironment].keys &&
        fullProfile.builds[this.currentEnvironment].keys[keyName]

      if (
        commands &&
        fromIndex >= 0 &&
        fromIndex < commands.length &&
        toIndex >= 0 &&
        toIndex < commands.length
      ) {
        const [command] = commands.splice(fromIndex, 1)
        commands.splice(toIndex, 0, command)

        stoStorage.saveProfile(this.currentProfile, fullProfile)
        this.renderCommandChain()
        this.setModified(true)

        eventBus.emit('command-modified', { keyName, command, action: 'move', fromIndex, toIndex })
      }
    }
  },

  async confirmDeleteKey(keyName) {
    const confirmed = await stoUI.confirm(
      i18next.t('confirm_delete_key', { keyName }),
      i18next.t('delete_key'),
      'danger'
    )

    if (confirmed) {
      this.deleteKey(keyName)
    }
  },

  async confirmClearChain(keyName) {
    const confirmed = await stoUI.confirm(
      i18next.t('confirm_clear_commands', { keyName }),
      i18next.t('clear_commands'),
      'warning'
    )

    if (confirmed) {
      const profile = this.getCurrentProfile()
      profile.keys[keyName] = []
      this.saveCurrentBuild()
      this.renderCommandChain()
      this.renderKeyGrid()
      this.setModified(true)

      stoUI.showToast(
        i18next.t('commands_cleared_for_key', { keyName: keyName }),
        'success'
      )
    }
  },

  duplicateKey(keyName) {
    const profile = this.getCurrentProfile()
    const commands = profile.keys[keyName]

    if (!commands || commands.length === 0) {
      stoUI.showToast(i18next.t('no_commands_to_duplicate'), 'warning')
      return
    }

    let newKeyName = keyName + '_copy'
    let counter = 1

    while (profile.keys[newKeyName]) {
      newKeyName = `${keyName}_copy_${counter}`
      counter++
    }

    const clonedCommands = commands.map((cmd) => ({
      ...cmd,
      id: this.generateCommandId(),
    }))

    profile.keys[newKeyName] = clonedCommands
    stoStorage.saveProfile(this.currentProfile, profile)
    this.renderKeyGrid()
    this.setModified(true)

    stoUI.showToast(
      i18next.t('key_duplicated', { keyName: keyName, newKeyName: newKeyName }),
      'success'
    )
  },

  validateCurrentChain() {
    if (!this.selectedKey) {
      stoUI.showToast(i18next.t('no_key_selected'), 'warning')
      return
    }

    const profile = this.getCurrentProfile()
    const commands = profile.keys[this.selectedKey] || []

    if (commands.length === 0) {
      stoUI.showToast(i18next.t('no_commands_to_validate'), 'warning')
      return
    }

    const validation = stoKeybinds.validateKeybind(this.selectedKey, commands)

    if (validation.valid) {
      stoUI.showToast(i18next.t('command_chain_is_valid'), 'success')
    } else {
      const errorMsg = 'Validation errors:\n' + validation.errors.join('\n')
      stoUI.showToast(i18next.t('error_message', { error: errorMsg }), 'error', 5000)
    }
  },

  generateCommandId() {
    return 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  },
}
