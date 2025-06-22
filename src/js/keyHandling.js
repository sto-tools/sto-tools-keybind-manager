import eventBus from "./eventBus.js"

// Helper function to get the application context
function getAppContext() {
  // Try to get the global app instance
  if (typeof global !== 'undefined' && global.app) {
    return global.app
  }
  // Try to get from window in browser environment
  if (typeof window !== 'undefined' && window.app) {
    return window.app
  }
  // Fallback to any available STOToolsKeybindManager instance
  if (typeof window !== 'undefined' && window.STOToolsKeybindManager) {
    return window.STOToolsKeybindManager
  }
  return null
}

// Helper function to ensure we have the required context
function ensureContext() {
  const context = getAppContext()
  if (!context) {
    throw new Error('keyHandling methods must be called within the application context. Use app.addKey() instead of keyHandling.addKey().')
  }
  return context
}

export const keyHandling = {
  selectKey(keyName) {
    const context = ensureContext()
    context.selectedKey = keyName

    const profile = context.getCurrentProfile()
    const stabilizeCheckbox = document.getElementById('stabilizeExecutionOrder')
    if (stabilizeCheckbox && profile && profile.keybindMetadata) {
      let flag = false
      if (profile.keybindMetadata[context.currentEnvironment]) {
        const envMeta = profile.keybindMetadata[context.currentEnvironment]
        flag = !!(envMeta[keyName] && envMeta[keyName].stabilizeExecutionOrder)
      }
      stabilizeCheckbox.checked = flag
    } else if (stabilizeCheckbox) {
      stabilizeCheckbox.checked = false
    }

    context.renderKeyGrid()
    context.renderCommandChain()
    context.updateChainActions()
  },

  addKey(keyName) {
    const context = ensureContext()
    
    if (!context.isValidKeyName(keyName)) {
      stoUI.showToast(i18next.t('invalid_key_name'), 'error')
      return false
    }

    const fullProfile = stoStorage.getProfile(context.currentProfile)
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

    if (!fullProfile.builds[context.currentEnvironment]) {
      fullProfile.builds[context.currentEnvironment] = { keys: {} }
    }

    if (!fullProfile.builds[context.currentEnvironment].keys[keyName]) {
      fullProfile.builds[context.currentEnvironment].keys[keyName] = []

      stoStorage.saveProfile(context.currentProfile, fullProfile)

      context.renderKeyGrid()
      // Call selectKey through the context to avoid recursion
      if (context.selectKey) {
        context.selectKey(keyName)
      } else {
        // Fallback: set selectedKey directly
        context.selectedKey = keyName
      }
      context.setModified(true)

      stoUI.showToast(i18next.t('key_added', { keyName }), 'success')
      return true
    }
    stoUI.showToast(i18next.t('key_already_exists', { keyName }), 'warning')
    return false
  },

  deleteKey(keyName) {
    const context = ensureContext()
    
    const fullProfile = stoStorage.getProfile(context.currentProfile)
    if (!fullProfile) {
      stoUI.showToast(i18next.t('no_profile_selected'), 'error')
      return false
    }

    if (
      fullProfile.builds &&
      fullProfile.builds[context.currentEnvironment] &&
      fullProfile.builds[context.currentEnvironment].keys &&
      fullProfile.builds[context.currentEnvironment].keys[keyName]
    ) {
      delete fullProfile.builds[context.currentEnvironment].keys[keyName]

      stoStorage.saveProfile(context.currentProfile, fullProfile)

      if (context.selectedKey === keyName) {
        context.selectedKey = null
      }

      context.renderKeyGrid()
      context.renderCommandChain()
      context.setModified(true)

      stoUI.showToast(i18next.t('key_deleted', { keyName }), 'success')
      return true
    }

    return false
  },

  isValidKeyName(keyName) {
    return STO_DATA.validation.keyNamePattern.test(keyName) && keyName.length <= 20
  },

  addCommand(keyName, command) {
    const context = ensureContext()
    
    if (context.currentEnvironment === 'alias') {
      const profile = context.getCurrentProfile()

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

      context.saveCurrentBuild()
      stoUI.showToast(i18next.t('command_added_to_alias'), 'success')
    } else {
      const fullProfile = stoStorage.getProfile(context.currentProfile)
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

      if (!fullProfile.builds[context.currentEnvironment]) {
        fullProfile.builds[context.currentEnvironment] = { keys: {} }
      }

      if (!fullProfile.builds[context.currentEnvironment].keys[keyName]) {
        fullProfile.builds[context.currentEnvironment].keys[keyName] = []
      }

      if (Array.isArray(command)) {
        command.forEach((cmd) => {
          if (!cmd.id) {
            cmd.id = context.generateCommandId()
          }
          fullProfile.builds[context.currentEnvironment].keys[keyName].push(cmd)
        })
        stoUI.showToast(i18next.t('commands_added', { count: command.length }), 'success')
      } else {
        if (!command.id) {
          command.id = context.generateCommandId()
        }
        fullProfile.builds[context.currentEnvironment].keys[keyName].push(command)
        stoUI.showToast(i18next.t('command_added'), 'success')
      }

      stoStorage.saveProfile(context.currentProfile, fullProfile)
    }

    context.renderCommandChain()
    if (context.currentEnvironment === 'alias') {
      context.renderAliasGrid()
    } else {
      context.renderKeyGrid()
    }
    context.setModified(true)

    eventBus.emit('command-modified', { keyName, command, action: 'add' })
  },

  deleteCommand(keyName, commandIndex) {
    const context = ensureContext()
    
    if (context.currentEnvironment === 'alias') {
      const profile = context.getCurrentProfile()

      const alias = profile.aliases && profile.aliases[keyName]
      if (alias && alias.commands) {
        const commands = alias.commands.split('$$').map((cmd) => cmd.trim())
        if (commandIndex >= 0 && commandIndex < commands.length) {
          const deletedCommand = commands[commandIndex]
          commands.splice(commandIndex, 1)
          profile.aliases[keyName].commands = commands.join(' $$ ')

          context.saveCurrentBuild()
          context.renderCommandChain()
          context.renderAliasGrid()
          context.setModified(true)

          stoUI.showToast(i18next.t('command_deleted_from_alias'), 'success')

          eventBus.emit('command-modified', {
            keyName,
            command: { command: deletedCommand },
            action: 'delete',
          })
        }
      }
    } else {
      const fullProfile = stoStorage.getProfile(context.currentProfile)
      if (!fullProfile) {
        stoUI.showToast(i18next.t('no_profile_selected'), 'error')
        return
      }

      if (
        fullProfile.builds &&
        fullProfile.builds[context.currentEnvironment] &&
        fullProfile.builds[context.currentEnvironment].keys &&
        fullProfile.builds[context.currentEnvironment].keys[keyName] &&
        fullProfile.builds[context.currentEnvironment].keys[keyName][commandIndex]
      ) {
        const deletedCommand = fullProfile.builds[context.currentEnvironment].keys[keyName][commandIndex]
        fullProfile.builds[context.currentEnvironment].keys[keyName].splice(commandIndex, 1)

        stoStorage.saveProfile(context.currentProfile, fullProfile)
        context.renderCommandChain()
        context.renderKeyGrid()
        context.setModified(true)

        stoUI.showToast(i18next.t('command_deleted'), 'success')

        eventBus.emit('command-modified', { keyName, command: deletedCommand, action: 'delete' })
      }
    }
  },

  moveCommand(keyName, fromIndex, toIndex) {
    const context = ensureContext()
    
    if (context.currentEnvironment === 'alias') {
      const profile = context.getCurrentProfile()

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
          context.saveCurrentBuild()
          context.renderCommandChain()
          context.setModified(true)

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
      const fullProfile = stoStorage.getProfile(context.currentProfile)
      if (!fullProfile) {
        stoUI.showToast(i18next.t('no_profile_selected'), 'error')
        return
      }

      const commands =
        fullProfile.builds &&
        fullProfile.builds[context.currentEnvironment] &&
        fullProfile.builds[context.currentEnvironment].keys &&
        fullProfile.builds[context.currentEnvironment].keys[keyName]

      if (
        commands &&
        fromIndex >= 0 &&
        fromIndex < commands.length &&
        toIndex >= 0 &&
        toIndex < commands.length
      ) {
        const [command] = commands.splice(fromIndex, 1)
        commands.splice(toIndex, 0, command)

        stoStorage.saveProfile(context.currentProfile, fullProfile)
        context.renderCommandChain()
        context.setModified(true)

        eventBus.emit('command-modified', { keyName, command, action: 'move', fromIndex, toIndex })
      }
    }
  },

  async confirmDeleteKey(keyName) {
    const context = ensureContext()
    
    const confirmed = await stoUI.confirm(
      i18next.t('confirm_delete_key', { keyName }),
      i18next.t('delete_key'),
      'danger'
    )

    if (confirmed) {
      // Ensure the context has the deleteKey method available
      if (!context.deleteKey) {
        throw new Error('Application context is missing deleteKey method. This indicates a configuration issue.')
      }
      
      // Call deleteKey through the context
      context.deleteKey(keyName)
    }
  },

  async confirmClearChain(keyName) {
    const context = ensureContext()
    
    const confirmed = await stoUI.confirm(
      i18next.t('confirm_clear_commands', { keyName }),
      i18next.t('clear_commands'),
      'warning'
    )

    if (confirmed) {
      const fullProfile = stoStorage.getProfile(context.currentProfile)
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

      if (!fullProfile.builds[context.currentEnvironment]) {
        fullProfile.builds[context.currentEnvironment] = { keys: {} }
      }

      if (fullProfile.builds[context.currentEnvironment].keys[keyName]) {
        fullProfile.builds[context.currentEnvironment].keys[keyName] = []
        stoStorage.saveProfile(context.currentProfile, fullProfile)
        context.renderCommandChain()
        context.renderKeyGrid()
        context.setModified(true)

        stoUI.showToast(
          i18next.t('commands_cleared_for_key', { keyName: keyName }),
          'success'
        )
      }
    }
  },

  duplicateKey(keyName) {
    const context = ensureContext()
    
    const fullProfile = stoStorage.getProfile(context.currentProfile)
    if (!fullProfile) {
      stoUI.showToast(i18next.t('no_profile_selected'), 'error')
      return
    }

    const commands = fullProfile.builds &&
      fullProfile.builds[context.currentEnvironment] &&
      fullProfile.builds[context.currentEnvironment].keys &&
      fullProfile.builds[context.currentEnvironment].keys[keyName]

    if (!commands || commands.length === 0) {
      stoUI.showToast(i18next.t('no_commands_to_duplicate'), 'warning')
      return
    }

    let newKeyName = keyName + '_copy'
    let counter = 1

    while (fullProfile.builds[context.currentEnvironment].keys[newKeyName]) {
      newKeyName = `${keyName}_copy_${counter}`
      counter++
    }

    const clonedCommands = commands.map((cmd) => ({
      ...cmd,
      id: context.generateCommandId(),
    }))

    fullProfile.builds[context.currentEnvironment].keys[newKeyName] = clonedCommands
    stoStorage.saveProfile(context.currentProfile, fullProfile)
    context.renderKeyGrid()
    context.setModified(true)

    stoUI.showToast(
      i18next.t('key_duplicated', { keyName: keyName, newKeyName: newKeyName }),
      'success'
    )
  },

  validateCurrentChain() {
    const context = ensureContext()
    
    if (!context.selectedKey) {
      stoUI.showToast(i18next.t('no_key_selected'), 'warning')
      return
    }

    const profile = context.getCurrentProfile()
    const commands = profile.keys[context.selectedKey] || []

    if (commands.length === 0) {
      stoUI.showToast(i18next.t('no_commands_to_validate'), 'warning')
      return
    }

    const validation = stoKeybinds.validateKeybind(context.selectedKey, commands)

    if (validation.valid) {
      stoUI.showToast(i18next.t('command_chain_is_valid'), 'success')
    } else {
      const errorMsg = 'Validation errors:\n' + validation.errors.join('\n')
      stoUI.showToast(i18next.t('error_message', { error: errorMsg }), 'error', 5000)
    }
  },

  generateCommandId() {
    const context = ensureContext()
    return 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  },
}
