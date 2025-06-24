import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'

/**
 * CommandChainService – owns the data for the command-chain editor (the pane
 * inside .command-chain-container).  In phase-1 it merely mirrors the updates
 * coming from CommandLibraryUI so we can wire up the new component without
 * breaking anything.  In phase-2 it will become the single source of truth
 * for chain operations.
 */
export default class CommandChainService extends ComponentBase {
  constructor ({ i18n, commandLibraryService } = {}) {
    super(eventBus)
    this.i18n = i18n
    this.currentEnvironment = 'space'
    this.selectedKey = null
    this.commands = [] // array of command objects

    // Underlying authoritative service (legacy)
    this.commandLibraryService = commandLibraryService || null
  }

  onInit () {
    this.setupEventListeners()
  }

  setupEventListeners () {
    // Receive broadcasts from existing components
    this.addEventListener('command-chain:update', (payload = {}) => {
      const { commands, selectedKey, environment } = payload

      this.commands = Array.isArray(commands) ? commands : []

      // Sync key/environment either from payload or authoritative service
      if (selectedKey !== undefined) this.selectedKey = selectedKey
      if (environment !== undefined) this.currentEnvironment = environment

      if (this.commandLibraryService) {
        this.selectedKey = this.selectedKey || this.commandLibraryService.selectedKey
        this.currentEnvironment = this.currentEnvironment || this.commandLibraryService.currentEnvironment
      }

      // forward to UI listeners that might care
      this.emit('chain-data-changed', { commands: this.commands })
    })

    // Keep environment/key in sync – other components should emit these.
    this.addEventListener('command-chain:select', ({ key, environment }) => {
      this.selectedKey = key
      if (environment) this.currentEnvironment = environment
    })

    this.addEventListener('environment-changed', (env) => {
      this.currentEnvironment = env
      this.selectedKey = null
      this.commands = []
      this.emit('chain-data-changed', { commands: this.commands })
    })

    // Maintain selected alias/key in sync with higher-level services so that
    // the command-chain UI always knows what it should be displaying.
    this.addEventListener('key-selected', ({ key, name }) => {
      this.selectedKey = key || name || null
    })
  }

  /* ------------------------------------------------------------------
   * Proxy helpers – delegate to underlying CommandLibraryService while we
   * transition. This keeps the existing public contract intact for UI and
   * tests.
   * ------------------------------------------------------------------ */

  getCommandsForSelectedKey () {
    if (this.commandLibraryService && typeof this.commandLibraryService.getCommandsForSelectedKey === 'function') {
      return this.commandLibraryService.getCommandsForSelectedKey()
    }
    return Array.isArray(this.commands) ? this.commands : []
  }

  getEmptyStateInfo () {
    if (this.commandLibraryService && typeof this.commandLibraryService.getEmptyStateInfo === 'function') {
      return this.commandLibraryService.getEmptyStateInfo()
    }
    return {
      title: '',
      preview: '',
      commandCount: 0,
      icon: '',
      emptyTitle: '',
      emptyDesc: '',
    }
  }

  findCommandDefinition (command) {
    if (this.commandLibraryService && typeof this.commandLibraryService.findCommandDefinition === 'function') {
      return this.commandLibraryService.findCommandDefinition(command)
    }
    return null
  }

  getCommandWarning (command) {
    if (this.commandLibraryService && typeof this.commandLibraryService.getCommandWarning === 'function') {
      return this.commandLibraryService.getCommandWarning(command)
    }
    return null
  }
} 