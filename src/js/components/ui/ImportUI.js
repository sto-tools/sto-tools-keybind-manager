import UIComponentBase from '../UIComponentBase.js'

/**
 * ImportUI – Presents file-open dialogs for the "Import Keybinds / Import Aliases"
 * menu actions and delegates the actual import work to ImportService.
 */
export default class ImportUI extends UIComponentBase {
  constructor ({ eventBus, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'ImportUI'
    this.document = document
  }

  onInit () {
    // Listen for menu events dispatched by HeaderMenuUI
    this.addEventListener('keybinds:import', () => this.openFileDialog('keybinds'))
    this.addEventListener('aliases:import', () => this.openFileDialog('aliases'))
  }

  // Opens a hidden file input, waits for selection and forwards content to ImportService.
  async openFileDialog (type) {
    const input = this.document.createElement('input')
    input.type = 'file'
    input.accept = '.txt'
    input.style.display = 'none'

    // Append to body to ensure click works in all browsers
    this.document.body.appendChild(input)

    input.addEventListener('change', async (e) => {
      if (!e.target.files || e.target.files.length === 0) return
      const file = e.target.files[0]
      const reader = new FileReader()
      reader.onload = async (evt) => {
        try {
          const content = evt.target.result
          const state = await this.request('data:get-current-state')
          const profileId = state.currentProfile
          if (type === 'keybinds') {
            // Ask user which environment to import into
            const env = await this.promptEnvironment(state.currentEnvironment || 'space')
            if (!env) return // user cancelled

            await this.request('import:keybind-file', {
              content,
              profileId,
              environment: env
            })
          } else {
            await this.request('import:alias-file', {
              content,
              profileId
            })
          }
        } catch (error) {
          console.error(`[ImportUI] Failed to import file:`, error)
        }
        // Clean up
        this.document.body.removeChild(input)
      }
      reader.readAsText(file)
    })

    // Trigger dialog
    input.click()
  }

  // Show a simple modal asking user whether the import is for Space or Ground.
  // Returns chosen environment string or null if cancelled.
  promptEnvironment (defaultEnv = 'space') {
    return new Promise((resolve) => {
      // Create overlay
      const overlay = this.document.createElement('div')
      overlay.style.position = 'fixed'
      overlay.style.top = '0'
      overlay.style.left = '0'
      overlay.style.width = '100%'
      overlay.style.height = '100%'
      overlay.style.background = 'rgba(0,0,0,0.4)'
      overlay.style.display = 'flex'
      overlay.style.alignItems = 'center'
      overlay.style.justifyContent = 'center'
      overlay.style.zIndex = '9999'

      const modal = this.document.createElement('div')
      modal.style.background = '#fff'
      modal.style.padding = '20px'
      modal.style.borderRadius = '8px'
      modal.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
      modal.style.textAlign = 'center'
      modal.innerHTML = `<h3 style="margin-top:0">Select Environment</h3><p>Import keybinds into which environment?</p>`

      const btnSpace = this.createEnvButton('Space', 'space', defaultEnv === 'space')
      const btnGround = this.createEnvButton('Ground', 'ground', defaultEnv === 'ground')
      const btnCancel = this.createEnvButton('Cancel', null)

      modal.appendChild(btnSpace)
      modal.appendChild(btnGround)
      modal.appendChild(btnCancel)
      overlay.appendChild(modal)
      this.document.body.appendChild(overlay)

      const cleanup = (choice) => {
        this.document.body.removeChild(overlay)
        resolve(choice)
      }

      btnSpace.addEventListener('click', () => cleanup('space'))
      btnGround.addEventListener('click', () => cleanup('ground'))
      btnCancel.addEventListener('click', () => cleanup(null))
    })
  }

  createEnvButton (label, value, primary = false) {
    const btn = this.document.createElement('button')
    btn.textContent = label
    btn.style.margin = '6px'
    btn.style.padding = '8px 14px'
    btn.style.border = 'none'
    btn.style.borderRadius = '4px'
    btn.style.cursor = 'pointer'
    btn.style.fontSize = '14px'
    btn.style.background = primary ? '#007bff' : '#e0e0e0'
    btn.style.color = primary ? '#fff' : '#000'
    return btn
  }
} 