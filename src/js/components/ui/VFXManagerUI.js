import ComponentBase from '../ComponentBase.js'

export default class VFXManagerUI extends ComponentBase {
  constructor({ eventBus, modalManager } = {}) {
    super(eventBus)
    this.componentName = 'VFXManagerUI'
    this.modalManager = modalManager
    this.isInitialized = false
    this.vfxManager = null
  }

  async init() {
    if (this.isInitialized) {
      // Component already initialized
      return
    }

    this.setupEventListeners()
    this.isInitialized = true
    // VFXManagerUI initialized successfully
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
      VFX_EFFECTS.space.forEach((effect) => {
        const effectItem = this.createEffectItem('space', effect)
        spaceList.appendChild(effectItem)
      })
    }

    // Populate ground effects
    const groundList = document.getElementById('groundEffectsList')
    if (groundList) {
      groundList.innerHTML = ''
      VFX_EFFECTS.ground.forEach((effect) => {
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
        spacePreviewEl.textContent = 'No space effects selected'
      }
    }

    // Update ground preview
    const groundPreviewEl = document.getElementById('groundAliasCommand')
    if (groundPreviewEl && this.vfxManager) {
      const groundAlias = this.vfxManager.generateAlias('ground')
      if (groundAlias) {
        groundPreviewEl.textContent = groundAlias
      } else {
        groundPreviewEl.textContent = 'No ground effects selected'
      }
    }
  }

  setupDOMEventListeners() {
    // Effect checkbox changes
    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('effect-checkbox')) {
        const environment = e.target.dataset.environment
        const effectName = e.target.dataset.effect
        
        if (this.vfxManager) {
          this.vfxManager.toggleEffect(environment, effectName)
          this.updateEffectCounts()
          this.updatePreview()
        }
      }
    })

    // PlayerSay checkbox
    document.addEventListener('change', (e) => {
      if (e.target.id === 'vertigoShowPlayerSay') {
        if (this.vfxManager) {
          this.vfxManager.showPlayerSay = e.target.checked
          this.updatePreview()
        }
      }
    })

    // VFX specific buttons using eventBus.onDom
    this.eventBus.onDom('spaceSelectAll', 'click', 'vfx-space-select-all', () => {
      if (this.vfxManager) {
        this.vfxManager.selectAllEffects('space')
        this.updateCheckboxes('space')
        this.updateEffectCounts()
        this.updatePreview()
      }
    })

    this.eventBus.onDom('spaceClearAll', 'click', 'vfx-space-clear-all', () => {
      if (this.vfxManager) {
        this.vfxManager.selectedEffects.space.clear()
        this.updateCheckboxes('space')
        this.updateEffectCounts()
        this.updatePreview()
      }
    })

    this.eventBus.onDom('groundSelectAll', 'click', 'vfx-ground-select-all', () => {
      if (this.vfxManager) {
        this.vfxManager.selectAllEffects('ground')
        this.updateCheckboxes('ground')
        this.updateEffectCounts()
        this.updatePreview()
      }
    })

    this.eventBus.onDom('groundClearAll', 'click', 'vfx-ground-clear-all', () => {
      if (this.vfxManager) {
        this.vfxManager.selectedEffects.ground.clear()
        this.updateCheckboxes('ground')
        this.updateEffectCounts()
        this.updatePreview()
      }
    })

    this.eventBus.onDom('saveVertigoBtn', 'click', 'vfx-save', () => {
      this.emit('vfx:save-effects')
    })
  }
} 