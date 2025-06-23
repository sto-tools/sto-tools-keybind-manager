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
  constructor ({ i18n } = {}) {
    super(eventBus)
    this.i18n = i18n
    this.currentEnvironment = 'space'
    this.selectedKey = null
    this.commands = [] // array of command objects
  }

  onInit () {
    this.setupEventListeners()
  }

  setupEventListeners () {
    // Receive broadcasts from existing components
    this.addEventListener('command-chain:update', ({ commands }) => {
      this.commands = Array.isArray(commands) ? commands : []
      // forward to UI listeners that might care
      this.emit('chain-data-changed', { commands: this.commands })
    })

    // Keep environment/key in sync – other components should emit these.
    this.addEventListener('command-chain:select', ({ key, environment }) => {
      this.selectedKey = key
      if (environment) this.currentEnvironment = environment
    })

    this.addEventListener('environment:changed', (env) => {
      this.currentEnvironment = env
      this.selectedKey = null
      this.commands = []
      this.emit('chain-data-changed', { commands: this.commands })
    })
  }
} 