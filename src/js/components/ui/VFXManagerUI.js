import UIComponentBase from '../UIComponentBase.js'

export default class VFXManagerUI extends UIComponentBase {
  constructor({ eventBus, modalManager } = {}) {
    super(eventBus)
    this.componentName = 'VFXManagerUI'
    this.modalManager = modalManager
    this.domListenersSetup = false
    this.vfxManager = null
  }

  // Component lifecycle hook - called by ComponentBase.init()
  onInit() {
    this.setupEventListeners()
  }

  setupEventListeners() {
    // Listen for modal population event from service
    this.eventBus.on('vfx:modal-populate', this.handleModalPopulate.bind(this))
    
    // Setup DOM event listeners once
    this.setupDOMEventListeners()
  }

  handleModalPopulate({ vfxManager }) {
    // Populating VFX modal with effects
    this.vfxManager = vfxManager
    this.populateModal()
    this.modalManager.show('vertigoModal')
    // Ensure the preview reflects current selections after translations may have reset text content
    this.updatePreview()
  }

  populateModal() {
    if (!this.vfxManager) return

    // Populate space effects
    const spaceList = document.getElementById('spaceEffectsList')
    if (spaceList) {
      spaceList.innerHTML = ''
      // Explicitly access VFX_EFFECTS from window object for clarity
      window.VFX_EFFECTS.space.forEach((effect) => {
        const effectItem = this.createEffectItem('space', effect)
        spaceList.appendChild(effectItem)
      })
    }

    // Populate ground effects
    const groundList = document.getElementById('groundEffectsList')
    if (groundList) {
      groundList.innerHTML = ''
      // Explicitly access VFX_EFFECTS from window object for clarity
      window.VFX_EFFECTS.ground.forEach((effect) => {
        const effectItem = this.createEffectItem('ground', effect)
        groundList.appendChild(effectItem)
      })
    }

    // Update UI state based on loaded data
    this.updateCheckboxes('space')
    this.updateCheckboxes('ground')

    // Update PlayerSay checkbox
    const playerSayCheckbox = document.getElementById('vertigoShowPlayerSay')
    if (playerSayCheckbox) {
      playerSayCheckbox.checked = this.vfxManager.showPlayerSay
    }

    // Update effect counts and preview
    this.updateEffectCounts()
    this.updatePreview()
  }

  createEffectItem(environment, effect) {
    const effectItem = document.createElement('div')
    effectItem.className = 'effect-item'
    
    const isSelected = this.vfxManager.isEffectSelected(environment, effect.effect)
    
    effectItem.innerHTML = `
      <label class="effect-label">
        <input type="checkbox" 
               class="effect-checkbox" 
               data-environment="${environment}" 
               data-effect="${effect.effect}"
               ${isSelected ? 'checked' : ''}>
        <span class="effect-name">${effect.label}</span>
      </label>
    `
    
    return effectItem
  }

  updateCheckboxes(environment) {
    const checkboxes = document.querySelectorAll(`input[data-environment="${environment}"]`)
    checkboxes.forEach(checkbox => {
      const effectName = checkbox.dataset.effect
      checkbox.checked = this.vfxManager.isEffectSelected(environment, effectName)
    })
  }

  updateEffectCounts() {
    // Update space count
    const spaceCount = this.vfxManager.getEffectCount('space')
    const spaceCountEl = document.getElementById('spaceEffectCount')
    if (spaceCountEl) {
      spaceCountEl.textContent = spaceCount
    }

    // Update ground count
    const groundCount = this.vfxManager.getEffectCount('ground')
    const groundCountEl = document.getElementById('groundEffectCount')
    if (groundCountEl) {
      groundCountEl.textContent = groundCount
    }
  }

  updatePreview() {
    // Update space preview
    const spacePreviewEl = document.getElementById('spaceAliasCommand')
    if (spacePreviewEl && this.vfxManager) {
      const spaceAlias = this.vfxManager.generateAlias('space')
      if (spaceAlias) {
        spacePreviewEl.textContent = spaceAlias
      } else {
        spacePreviewEl.textContent = this.i18n?.t?.('no_space_effects_selected') || 'No space effects selected'
      }
    }

    // Update ground preview
    const groundPreviewEl = document.getElementById('groundAliasCommand')
    if (groundPreviewEl && this.vfxManager) {
      const groundAlias = this.vfxManager.generateAlias('ground')
      if (groundAlias) {
        groundPreviewEl.textContent = groundAlias
      } else {
        groundPreviewEl.textContent = this.i18n?.t?.('no_ground_effects_selected') || 'No ground effects selected'
      }
    }
  }

  setupDOMEventListeners() {
    if (this.domListenersSetup) {
      return
    }

    // Effect checkbox changes - using automatic cleanup pattern
    this.onDom(
      '.effect-checkbox',
      'change',
      'vfx-effect-change',
      (e) => {
        const environment = e.target.dataset.environment
        const effectName = e.target.dataset.effect

        if (this.vfxManager) {
          this.vfxManager.toggleEffect(environment, effectName)
          this.updateEffectCounts()
          this.updatePreview()
        }
      }
    )

    // PlayerSay checkbox - using automatic cleanup pattern
    this.onDom(
      '#vertigoShowPlayerSay',
      'change',
      'vfx-playersay-change',
      (e) => {
        if (this.vfxManager) {
          this.vfxManager.showPlayerSay = e.target.checked
          this.updatePreview()
        }
      }
    )

    // VFX specific buttons using automatic cleanup pattern
    this.onDom('spaceSelectAll', 'click', 'vfx-space-select-all', () => {
      if (this.vfxManager) {
        this.vfxManager.selectAllEffects('space')
        this.updateCheckboxes('space')
        this.updateEffectCounts()
        this.updatePreview()
      }
    })

    this.onDom('spaceClearAll', 'click', 'vfx-space-clear-all', () => {
      if (this.vfxManager) {
        this.vfxManager.selectedEffects.space.clear()
        this.updateCheckboxes('space')
        this.updateEffectCounts()
        this.updatePreview()
      }
    })

    this.onDom('groundSelectAll', 'click', 'vfx-ground-select-all', () => {
      if (this.vfxManager) {
        this.vfxManager.selectAllEffects('ground')
        this.updateCheckboxes('ground')
        this.updateEffectCounts()
        this.updatePreview()
      }
    })

    this.onDom('groundClearAll', 'click', 'vfx-ground-clear-all', () => {
      if (this.vfxManager) {
        this.vfxManager.selectedEffects.ground.clear()
        this.updateCheckboxes('ground')
        this.updateEffectCounts()
        this.updatePreview()
      }
    })

    this.onDom('saveVertigoBtn', 'click', 'vfx-save', () => {
      this.emit('vfx:save-effects')
    })

    this.domListenersSetup = true
  }

  // Component lifecycle hook - called by ComponentBase
  onDestroy() {
    // Reset flags
    this.domListenersSetup = false
    this.vfxManager = null
    // Note: DOM event listeners are automatically cleaned up by ComponentBase
  }
} 