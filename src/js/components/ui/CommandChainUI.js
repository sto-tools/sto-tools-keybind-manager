import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'

export default class CommandChainUI extends ComponentBase {
  constructor ({ service, document = window.document }) {
    super(eventBus)
    this.service = service
    this.document = document
  }

  onInit () {
    if (!this.service) return
    // Listen for service-level change broadcast
    this.service.addEventListener('chain-data-changed', ({ commands }) => {
      this.render(commands)
    })
  }

  render (commands = []) {
    const container = this.document.getElementById('commandList')
    const title     = this.document.getElementById('chainTitle')
    const preview   = this.document.getElementById('commandPreview')
    const countSpan = this.document.getElementById('commandCount')
    if (!container || !title || !preview) return

    if (!commands.length) {
      // fall back to existing empty-state rendering done by CommandLibraryUI
      return
    }
    // For phase-1 just let CommandLibraryUI own the real DOM; we keep minimal placeholder
    // Later we'll replace this block with full rendering logic.
  }
} 