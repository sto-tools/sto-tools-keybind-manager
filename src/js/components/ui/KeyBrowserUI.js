import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'

/**
 * KeyBrowserUI – responsible for rendering the key grid (#keyGrid).
 * For the initial migration it simply delegates to the legacy
 * renderKeyGrid implementation hanging off the global `app` instance.
 */
export default class KeyBrowserUI extends ComponentBase {
  constructor ({ service, app, document = window.document }) {
    super(eventBus)
    this.service  = service
    this.app      = app
    this.document = document
  }

  /* ============================================================
   * Lifecycle
   * ========================================================== */
  onInit () {
    if (!this.service) return

    // Re-render whenever keys change or selection updates.
    this.service.addEventListener('keys-changed', () => this.render())
    this.service.addEventListener('key-selected', () => this.render())

    // Also re-render on view-mode toggle or theme change via dedicated events.
    this.addEventListener('key-view:mode-changed', () => this.render())

    // Initial paint
    this.render()
  }

  render () {
    // Delegate to existing legacy renderer until full rewrite is ready
    if (this.app && typeof this.app.renderKeyGrid === 'function') {
      this.app.renderKeyGrid()
    }
  }
} 