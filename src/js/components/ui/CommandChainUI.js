import ComponentBase from '../ComponentBase.js'
import eventBus from '../../core/eventBus.js'
import { request } from '../../core/requestResponse.js'
import { enrichForDisplay, normalizeToString } from '../../lib/commandDisplayAdapter.js'
import BindsetSelectorService from '../services/BindsetSelectorService.js'
import BindsetSelectorUI from './BindsetSelectorUI.js'
import i18next from 'i18next'

export default class CommandChainUI extends ComponentBase {
  constructor ({ eventBus: bus = eventBus, ui = null, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(bus)
    this.componentName = 'CommandChainUI'
    this.ui = ui || (typeof stoUI !== 'undefined' ? stoUI : null)
    this.document = document
    this._selectedKey = null
    this._currentEnvironment = 'space'

    // Initialize bindset selector components
    this.bindsetSelectorService = null
    this.bindsetSelectorUI = null
    this.activeBindset = 'Primary Bindset'

    // Initialize cached selection state (but preserve environment from late-join)
    this._selectedKey = null
    this._selectedAlias = null
    // Don't reset _currentEnvironment as it may have been set by late-join handshake
    
    // Initialize cached preferences (will be populated by late-join handshake)
    this._bindToAliasMode = false

  }

  async onInit () {
    
    // Store detach functions for cleanup
    this._detachFunctions = []
    
    // Initialize bindset selector components
    await this.initializeBindsetSelector()
    
    // Listen for chain-data updates broadcast by service
    this._detachFunctions.push(
      this.eventBus.on('chain-data-changed', ({ commands }) => {
        console.log('[CommandChainUI] chain-data-changed received with', commands.length, 'commands')
        this.render(commands)
      })
    )

    // Command lifecycle events are handled via chain-data-changed
    // No need to listen to individual command events

    // Listen for environment or key/alias changes for button state and caching
    this._detachFunctions.push(
      this.eventBus.on('environment:changed', (data) => {
        const env = typeof data === 'string' ? data : data?.environment
        if (env) {
          this._currentEnvironment = env
          
          // Clear cached selections when switching environments
          // The KeyBrowserService will handle restoring/auto-selecting the appropriate key/alias
          // and fire key-selected or alias-selected event which will trigger our render
          this._selectedKey = null
          this._selectedAlias = null
          
          this.updateChainActions()
          
          // Update label if preview is currently visible (fixes race condition on initial load)
          this.updatePreviewLabel()
          
          // Update bindset selector visibility based on new environment
          this.setupBindsetDropdown().catch(() => {})
          
          // Don't render immediately - wait for key-selected or alias-selected event
          // which will be emitted by KeyBrowserService after it finishes its selection logic
        }
      })
    )
    this._detachFunctions.push(
      this.eventBus.on('key-selected', async (data) => {
        this._selectedKey = data.key || data.name
        this._selectedAlias = null
        this.updateChainActions()
        
        // Update bindset selector with selected key first (can be null)
        if (this.bindsetSelectorService) {
          this.bindsetSelectorService.setSelectedKey(this._selectedKey)
        }
        
        // Reset to Primary Bindset when selecting a different key (unless already on Primary)
        // Only do this if a key was actually selected (not null)
        if (this._selectedKey && this.activeBindset !== 'Primary Bindset') {
          this.activeBindset = 'Primary Bindset'
          if (this.bindsetSelectorService) {
            this.bindsetSelectorService.setActiveBindset('Primary Bindset')
          }
          this.updateBindsetBanner()
        }
        
        // Render to show the newly selected key's command chain
        this.render().catch(() => {})
      })
    )
    this._detachFunctions.push(
      this.eventBus.on('alias-selected', (data) => {
        this._selectedAlias = data.name
        this._selectedKey = null
        this.updateChainActions()
        
        // Render to show the newly selected alias's command chain
        this.render().catch(() => {})
      })
    )

    // Listen for language changes to re-render command items with new translations
    this._detachFunctions.push(
      this.eventBus.on('language:changed', () => {
        this.render()
      })
    )

    // Note: Preference changes are now handled by the main preferences:changed listener below

    // Listen for bindset selector active changes
    this._detachFunctions.push(
      this.eventBus.on('bindset-selector:active-changed', ({ bindset }) => {
        this.activeBindset = bindset
        this.updateBindsetBanner()
        this.updateChainActions()
        this.render()
      })
    )

    // Listen for key added to bindset - should switch to that bindset and show empty chain
    console.log('[CommandChainUI] Setting up bindset-selector:key-added event listener')
    this._detachFunctions.push(
      this.eventBus.on('bindset-selector:key-added', ({ key, bindset }) => {
        console.log(`[CommandChainUI] *** bindset-selector:key-added received: key=${key}, bindset=${bindset}, selectedKey=${this._selectedKey} ***`)
        if (key === this._selectedKey) {
          console.log(`[CommandChainUI] *** Key added to bindset: ${bindset} (bindset switching already handled) ***`)
          // NOTE: The BindsetSelectorService now switches to the bindset immediately when adding the key
          // So we don't need to call setActiveBindset again here - it's already done
          // The bindset-selector:active-changed event will have already fired
        } else {
          console.log(`[CommandChainUI] *** Event key ${key} does not match selectedKey ${this._selectedKey}, ignoring ***`)
        }
      })
    )
    console.log('[CommandChainUI] bindset-selector:key-added event listener registered')

    // Listen for key removed from bindset - switch to Primary if it was the active bindset
    this._detachFunctions.push(
      this.eventBus.on('bindset-selector:key-removed', ({ key, bindset }) => {
        if (key === this._selectedKey && this.activeBindset === bindset) {
          // Switch to Primary Bindset since the key was removed from the active bindset
          this.activeBindset = 'Primary Bindset'
          if (this.bindsetSelectorService) {
            this.bindsetSelectorService.setActiveBindset('Primary Bindset')
          }
          this.updateBindsetBanner()
          this.updateChainActions()
          this.render()
        }
      })
    )

    // NEW: Listen for preferences loaded event so we can initialize bindset UI based on saved settings
    this._detachFunctions.push(
      this.eventBus.on('preferences:loaded', async ({ settings }) => {
        if (settings && typeof settings.bindsetsEnabled !== 'undefined') {
          this._bindsetsEnabled = !!settings.bindsetsEnabled
          if (this._bindsetsEnabled && !this._bindsetDropdownReady) {
            await this.setupBindsetDropdown()
          }
        }
      })
    )

    this._detachFunctions.push(
      this.eventBus.on('bindsets:changed', async (data) => {
        console.log('[CommandChainUI] bindsets:changed received with', data.names.length, 'bindsets')
        this._bindsetNames = data.names
        await this.setupBindsetDropdown()
      })
    )

    // Setup stabilization button logic
    const stabilizeBtn = this.document.getElementById('stabilizeExecutionOrderBtn')
    if (stabilizeBtn && !this._stabilizeListenerAttached) {
      stabilizeBtn.addEventListener('click', async () => {
        await this.toggleStabilize()
      })
      this._stabilizeListenerAttached = true
    }

    // Setup copy alias button logic  
    const copyAliasBtn = this.document.getElementById('copyAliasBtn')
    if (copyAliasBtn && !this._copyAliasListenerAttached) {
      copyAliasBtn.addEventListener('click', async () => {
        const aliasPreviewEl = this.document.getElementById('aliasPreview')
        if (aliasPreviewEl && aliasPreviewEl.textContent) {
          try {
            await navigator.clipboard.writeText(aliasPreviewEl.textContent)
            if (this.ui?.showToast) {
              this.ui.showToast('Alias copied to clipboard', 'success')
            }
          } catch (error) {
            console.error('Failed to copy alias to clipboard:', error)
            if (this.ui?.showToast) {
              this.ui.showToast('Failed to copy to clipboard', 'error')
            }
          }
        }
      })
      this._copyAliasListenerAttached = true
    }

    // Drag/drop
    this.setupDragAndDrop()

    // Defer the first render until we have at least the initial environment
    // (and potentially a key/alias selection) to avoid showing the generic
    // key-mode empty-state when the application actually starts in alias
    // mode.  Rendering will now occur when one of the listeners below sets
    // the necessary state and explicitly calls `this.render()`.

    this.updateChainActions()
    
    // Schedule an initial render to show empty state when no keys/aliases exist
    // This ensures the command chain window is not blank on initial load
    setTimeout(() => {
      this.render().catch(() => {})
    }, 100)

    // Listen for preference changes that toggle bindsets at runtime (or when
    // bindsetsEnabled itself flips)
    this._detachFunctions.push(
      this.eventBus.on('preferences:changed', async (data) => {
        // Handle both single-setting changes and bulk changes
        const changes = data.changes || { [data.key]: data.value }
        let needsDropdownUpdate = false
        let needsRender = false
        
        for (const [key, value] of Object.entries(changes)) {
          if (key === 'bindsetsEnabled') {
            this._bindsetsEnabled = !!value
            needsDropdownUpdate = true
            if (!value && this._bindsetDropdownReady) {
              const btn = this.document.getElementById('bindsetDropdownBtn')
              const sel = this.document.getElementById('bindsetSelect')
              if (btn) btn.style.display = 'none'
              if (sel) sel.style.display = 'none'
            }
          } else if (key === 'bindToAliasMode') {
            console.log(`[CommandChainUI] Preference changed: bindToAliasMode = ${value}`)
            this._bindToAliasMode = !!value
            console.log(`[CommandChainUI] After preference change: _bindToAliasMode = ${this._bindToAliasMode}`)
            needsDropdownUpdate = true
            needsRender = true
          }
        }
        
        // Update dropdown once after processing all changes
        if (needsDropdownUpdate) {
          await this.setupBindsetDropdown()
        }
        
        // Re-render once after processing all changes
        if (needsRender) {
          this.render().catch(() => {})
        }
      })
    )

    // Default selection
    this.activeBindset = this.activeBindset || 'Primary Bindset'
    
    // Broadcast initial active bindset so other components know the current state
    this.emit('bindset:active-changed', { bindset: this.activeBindset })
  }

  async render (commandsArg = null) {
      
      const container   = this.document.getElementById('commandList')
      const titleEl     = this.document.getElementById('chainTitle')
      const previewEl   = this.document.getElementById('commandPreview')
      const countSpanEl = this.document.getElementById('commandCount')
      const emptyState  = this.document.getElementById('emptyState')
      const generatedAlias = this.document.getElementById('generatedAlias')
      const aliasPreviewEl = this.document.getElementById('aliasPreview')

      if (!container || !titleEl || !previewEl) return

      // Check if bind-to-alias mode is enabled
      const bindToAliasMode = this.getBindToAliasMode()

      // When render is called with explicit commands (from chain-data-changed),
      // use those. When called without commands (from environment:changed),
      // only render if we have a selected key/alias to avoid race conditions
      // during initialization.
      let commands = commandsArg
      if (!commands) {
        const selectedKeyName = this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey
        if (!selectedKeyName) {
          // No selection yet - just show empty state and return
          const emptyStateInfo = await this.request('command:get-empty-state-info')
          titleEl.textContent   = emptyStateInfo.title
          previewEl.textContent = emptyStateInfo.preview
          if (countSpanEl) countSpanEl.textContent = emptyStateInfo.commandCount

          // Create new container content atomically
          const newContent = this.document.createElement('div')
          newContent.innerHTML = `
            <div class="empty-state show" id="emptyState">
              <i class="${emptyStateInfo.icon}"></i>
              <h4>${emptyStateInfo.emptyTitle}</h4>
              <p>${emptyStateInfo.emptyDesc}</p>
            </div>`
          
          // Atomic replacement
          container.replaceChildren(...newContent.children)
          return
        }
        // We have a selection, so request the commands
        commands = await this.getCommandsForCurrentSelection()
      }

      const emptyStateInfo = await this.request('command:get-empty-state-info')

      // Use cached selection state from event listeners
      const selectedKeyName = this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey

      if (!selectedKeyName || commands.length === 0) {
        // Empty state - use empty state info for title and preview
        titleEl.textContent   = emptyStateInfo.title
        if (countSpanEl) countSpanEl.textContent = emptyStateInfo.commandCount

        // Update previews for bind-to-alias mode (handles empty commands case)
        await this.updateBindToAliasMode(bindToAliasMode, selectedKeyName, commands)

        // Create new container content atomically
        const newContent = this.document.createElement('div')
        newContent.innerHTML = `
          <div class="empty-state ${!selectedKeyName ? 'show' : ''}" id="emptyState">
            <i class="${emptyStateInfo.icon}"></i>
            <h4>${emptyStateInfo.emptyTitle}</h4>
            <p>${emptyStateInfo.emptyDesc}</p>
          </div>`
        
        // Atomic replacement
        container.replaceChildren(...newContent.children)

        try {
          const bindset = this._currentEnvironment === 'alias' ? null : this.activeBindset
          const stabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
          const isAlias = this._currentEnvironment === 'alias'
          this.emit('command-chain:validate', { key: selectedKeyName, stabilized, isAlias })
        } catch (_) {
          // best-effort – ignore if service not available yet
        }
  
        return
      }

      // Non-empty state - use emptyStateInfo which actually contains the correct title/preview for selected keys
      titleEl.textContent   = emptyStateInfo.title
      
      // Update command counts based on bind-to-alias mode
      const aliasCountSpanEl = this.document.getElementById('aliasCommandCount')
      const commandCountDisplay = this.document.getElementById('commandCountDisplay')
      const aliasCommandCountDisplay = this.document.getElementById('aliasCommandCountDisplay')
      
      if (bindToAliasMode && selectedKeyName && this._currentEnvironment !== 'alias') {
        // Show count on Generated Alias section
        if (aliasCountSpanEl) aliasCountSpanEl.textContent = commands.length.toString()
        if (aliasCommandCountDisplay) aliasCommandCountDisplay.style.display = ''
        if (commandCountDisplay) commandCountDisplay.style.display = 'none'
      } else {
        // Show count on Generated Command section (normal mode)
        if (countSpanEl) countSpanEl.textContent = commands.length.toString()
        if (commandCountDisplay) commandCountDisplay.style.display = ''
        if (aliasCommandCountDisplay) aliasCommandCountDisplay.style.display = 'none'
      }

      // Update previews based on bind-to-alias mode
      await this.updateBindToAliasMode(bindToAliasMode, selectedKeyName, commands)

      // For non-bind-to-alias mode, ensure key preview shows mirrored commands when stabilized
      if (!bindToAliasMode && selectedKeyName && this._currentEnvironment !== 'alias') {
        try {
          const bindset = this._currentEnvironment === 'alias' ? null : this.activeBindset
          const stabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
          if (stabilized && commands.length > 1) {
            const cmdParts = commands.map(c => (typeof c === 'string' ? { command: c } : c))
            const mirroredStr = await this.request('fileops:generate-mirrored-commands', { commands: cmdParts })
            if (mirroredStr) {
              previewEl.textContent = `${selectedKeyName} "${mirroredStr}"`
            }
          }
        } catch (err) {
          console.warn('[CommandChainUI] Failed to generate mirrored preview', err)
        }
      }

      // Hide any existing empty state
      if (emptyState) emptyState.classList.remove('show')

      // Build the complete new command list structure atomically
      const newCommandElements = []
      for (let i = 0; i < commands.length; i++) {
        const el = await this.createCommandElement(commands[i], i, commands.length)
        newCommandElements.push(el)
      }

      // Atomic replacement - this is the only DOM mutation that affects the command list
      container.replaceChildren(...newCommandElements)

      // After rendering, automatically validate current chain so the status beacon stays up-to-date
      try {
        const bindset = this._currentEnvironment === 'alias' ? null : this.activeBindset
        const stabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
        const isAlias = this._currentEnvironment === 'alias'
        this.emit('command-chain:validate', { key: selectedKeyName, stabilized, isAlias })
      } catch (_) {
        // best-effort – ignore if service not available yet
      }

      // Update / insert bindset banner (always do this early so header is correct)
      this.updateBindsetBanner()
  }

  /**
   * Adapted from legacy CommandLibraryUI implementation.
   */
  async createCommandElement (command, index, total) {
    const element = this.document.createElement('div') || {}
    if (!element.dataset) {
      element.dataset = {}
    }
    element.className = 'command-item-row'
    element.dataset.index = index
    element.draggable = true

    // Convert canonical string command to rich object for display
    const commandString = typeof command === 'string' ? command : normalizeToString(command)
    
    // Get i18n object for translations
    const i18n = typeof i18next !== 'undefined' ? i18next : null
    
    // Enrich command for display
    const richCommand = await enrichForDisplay(commandString, i18n, { eventBus: this.eventBus })
    console.log('[CommandChainUI] enriched command:', richCommand)

    // Look up definition for display helpers
    const commandDef = await this.request('command:find-definition', { command: commandString })
    // Determine if this command should expose parameter editing
    const isCustomCmd = richCommand.type === 'custom' || richCommand.category === 'custom'
    const isParameterized = (commandDef && commandDef.customizable) || isCustomCmd

    // Helper function to format display text from i18n objects
    const formatDisplayText = (displayText) => {
      if (typeof displayText === 'string') {
        return displayText
      }
      if (typeof displayText === 'object' && displayText) {
        // Handle i18n structure with key/params/fallback
        if (displayText.key && displayText.fallback) {
          // Try to get i18n translation if available
          if (typeof i18next !== 'undefined' && i18next.t) {
            const translated = i18next.t(displayText.key, displayText.params || {})
            if (translated && translated !== displayText.key) {
              return translated
            }
          }
          // Fall back to the fallback text
          return displayText.fallback
        }
        // Handle simple fallback structure
        if (displayText.fallback) {
          return displayText.fallback
        }
        // Handle direct object with text properties
        if (displayText.text) {
          return displayText.text
        }
        // Handle object that might be a direct string value
        const baseName = displayText.name || displayText.displayText
        if (baseName) {
          return baseName
        }
      }
      return commandString // Fallback to command string
    }

    let displayName = formatDisplayText(richCommand.displayText) || richCommand.text || commandString
    let displayIcon = richCommand.icon

    if (isParameterized) {
      element.dataset.parameters = 'true'
      element.classList.add('customizable')

      element.addEventListener('dblclick', (e) => {
        console.log('[CommandChainUI] DOUBLE-CLICK on command element:', {
          index,
          target: e.target,
          targetClass: e.target.className
        })
        this.emit('commandchain:edit', { index })
      })
    }

    // Pass the command string (not object) to get-warning
    const warningInfo = await this.request('command:get-warning', { command: commandString })

    // Resolve tooltip text using the central i18n service so that dynamic language switching works
    let warningText = null
    if (warningInfo) {
      try {
        const translated = await this.request('i18n:translate', { key: warningInfo })
        // Use translated value if available; otherwise fall back to original (may already be natural language)
        warningText = translated && translated !== warningInfo ? translated : warningInfo
      } catch {
        warningText = warningInfo
      }
    }

    const warningIcon = warningText
      ? `<span class="command-warning-icon" title="${warningText}" data-i18n-title="${warningInfo}"><i class="fas fa-exclamation-triangle"></i></span>`
      : ''
    const parameterInd = isParameterized ? ' <span class="param-indicator" title="Editable parameters">⚙️</span>' : ''

    console.log('[CommandChainUI] command', command)
    console.log('[CommandChainUI] commandDef', commandDef)
    // Determine the actual command type from the definition, not from the parsed command
    let commandType = richCommand.type || richCommand.category
    // Preserve VFX alias type, don't override it with command definition categoryId
    // Also preserve other specific alias types like 'alias' or 'vfx-alias'
    if (commandDef && commandDef.categoryId && 
        !['vfx-alias', 'alias'].includes(richCommand.type) && 
        !['vfx-alias', 'alias'].includes(richCommand.category)) {
      commandType = commandDef.categoryId
    }

    element.innerHTML = `
      <div class="command-number">${index + 1}</div>
      <div class="command-content">
        <span class="command-icon">${displayIcon}</span>
        <span class="command-text">${displayName}${parameterInd}</span>
        ${warningIcon}
      </div>
      <span class="command-type ${commandType}">${commandType}</span>
      <div class="command-actions">
        ${isParameterized ? `<button class="command-action-btn btn-edit" title="Edit Command"><i class="fas fa-edit"></i></button>` : `<button class="command-action-btn btn-edit btn-placeholder" disabled aria-hidden="true" style="visibility:hidden"><i class="fas fa-edit"></i></button>`}
        <button class="command-action-btn command-action-btn-danger btn-delete" title="Delete Command"><i class="fas fa-times"></i></button>
        <button class="command-action-btn btn-up" title="Move Up" ${index === 0 ? 'disabled' : ''}><i class="fas fa-chevron-up"></i></button>
        <button class="command-action-btn btn-down" title="Move Down" ${index === total - 1 ? 'disabled' : ''}><i class="fas fa-chevron-down"></i></button>
      </div>`

    // Wire up action buttons via event bus
    const editBtn   = element.querySelector('.btn-edit')
    const deleteBtn = element.querySelector('.btn-delete')
    const upBtn     = element.querySelector('.btn-up')
    const downBtn   = element.querySelector('.btn-down')

    // Add unique IDs for debugging
    if (isParameterized && editBtn) {
      editBtn.id = `edit-btn-${index}`
      editBtn.addEventListener('click', (e) => {
        console.log('[CommandChainUI] EDIT BUTTON CLICKED:', {
          index,
          buttonId: e.target.id,
          buttonClass: e.target.className,
          buttonElement: e.target
        })
        e.preventDefault()
        e.stopPropagation()
        this.emit('commandchain:edit', { index })
      })
    }

    if (deleteBtn) {
      deleteBtn.id = `delete-btn-${index}`
      deleteBtn.addEventListener('click', (e) => {
        console.log('[CommandChainUI] DELETE BUTTON CLICKED:', {
          index,
          buttonId: e.target.id,
          buttonClass: e.target.className,
          buttonElement: e.target
        })
        e.preventDefault()
        e.stopPropagation()
        this.emit('commandchain:delete', { index })
      })
    }

    if (upBtn) {
      upBtn.addEventListener('click', () => {
        this.emit('commandchain:move', { fromIndex: index, toIndex: index - 1 })
      })
    }

    if (downBtn) {
      downBtn.addEventListener('click', () => {
        this.emit('commandchain:move', { fromIndex: index, toIndex: index + 1 })
      })
    }

    return element
  }

  /**
   * Setup drag-and-drop for command list re-ordering.
   */
  setupDragAndDrop () {
    if (!this.ui || typeof this.ui.initDragAndDrop !== 'function') return

    const commandList = this.document.getElementById('commandList')
    if (!commandList) return

    this.ui.initDragAndDrop(commandList, {
      draggableSelector: '.command-item-row',
      dropZoneSelector: '.command-item-row',
      onDrop: (e, dragState, dropZone) => {
        if (!dragState?.dragElement || !dropZone) return

        const fromIndex = parseInt(dragState.dragElement.dataset.index)
        const toIndex   = parseInt(dropZone.dataset.index)

        if (fromIndex !== toIndex && !Number.isNaN(fromIndex) && !Number.isNaN(toIndex)) {
          this.emit('commandchain:move', {
            fromIndex,
            toIndex,
          })
        }
      },
    })
  }

  /**
   * Get the current bind-to-alias mode setting from cached preferences
   */
  getBindToAliasMode() {
    console.log(`[CommandChainUI] getBindToAliasMode() returning: ${this._bindToAliasMode}`)
    return this._bindToAliasMode
  }

  /**
   * Update previews for bind-to-alias mode
   */
  /**
   * Updates the preview label based on current environment
   * Called when environment changes to fix race condition on initial load
   */
  updatePreviewLabel() {
    const labelEl = this.document.querySelector('.generated-command label[data-i18n]')
    if (labelEl) {
      const newKey = this._currentEnvironment === 'alias' ? 'generated_alias' : 'generated_command'
      labelEl.setAttribute('data-i18n', newKey)
      
      // Apply translation immediately using multiple fallback methods
      if (typeof window !== 'undefined' && window.applyTranslations) {
        window.applyTranslations(labelEl.parentElement)
      } else if (typeof i18next !== 'undefined' && i18next.t) {
        // Fallback: apply translation directly
        labelEl.textContent = i18next.t(newKey)
      } else {
        // Last resort: use English fallback
        labelEl.textContent = newKey === 'generated_alias' ? 'Generated Alias:' : 'Generated Command:'
      }
    }
  }

  async updateBindToAliasMode(bindToAliasMode, selectedKeyName, commands) {
    const generatedAlias = this.document.getElementById('generatedAlias')
    const aliasPreviewEl = this.document.getElementById('aliasPreview')
    const previewEl = this.document.getElementById('commandPreview')

    console.log(`[CommandChainUI] updateBindToAliasMode: bindToAliasMode=${bindToAliasMode}, selectedKeyName=${selectedKeyName}, environment=${this._currentEnvironment}, activeBindset=${this.activeBindset}`)
    
    if (!generatedAlias || !aliasPreviewEl || !previewEl) {
      console.log(`[CommandChainUI] Missing UI elements: generatedAlias=${!!generatedAlias}, aliasPreviewEl=${!!aliasPreviewEl}, previewEl=${!!previewEl}`)
      return
    }

    if (bindToAliasMode && selectedKeyName && this._currentEnvironment !== 'alias') {
      // Show generated alias section
      generatedAlias.style.display = ''
      
      // Generate alias name and preview
      const { generateBindToAliasName } = await import('../../lib/aliasNameValidator.js')
      const aliasName = generateBindToAliasName(this._currentEnvironment, selectedKeyName, this.activeBindset)
      
      if (aliasName) {
        // Show alias definition
        const commandStrings = commands.map(cmd => 
          typeof cmd === 'string' ? cmd : (cmd.command || cmd)
        ).filter(Boolean)
        let aliasCommandString = commandStrings.join(' $$ ')

        // Apply mirroring when stabilized
        try {
          const bindset = this._currentEnvironment === 'alias' ? null : this.activeBindset
          // TEMPORARY DEBUG: Log the actual values being used
          if (selectedKeyName && bindset && bindset !== 'Primary Bindset') {
            console.log(`[DEBUG] Checking stabilization for key "${selectedKeyName}" in bindset "${bindset}"`)
          }
          const stabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
          if (stabilized && commandStrings.length > 1) {
            const mirroredStr = await this.request('fileops:generate-mirrored-commands', { commands: commandStrings.map(c=>({command:c})) })
            if (mirroredStr) aliasCommandString = mirroredStr
          }
        } catch {}
        
        // Update alias preview to show the generated alias definition
        aliasPreviewEl.textContent = `alias ${aliasName} <& ${aliasCommandString} &>`
        
        // Update main preview to show keybind that calls the alias
        previewEl.textContent = `${selectedKeyName} "${aliasName}"`
      } else {
        aliasPreviewEl.textContent = 'Invalid key name for alias generation'
        previewEl.textContent = `${selectedKeyName} "..."`
      }
    } else {
      // Hide generated alias section
      generatedAlias.style.display = 'none'
      
      // Update label based on current environment
      this.updatePreviewLabel()
      
      // Show normal command preview
      const commandStrings = commands.map(cmd => 
        typeof cmd === 'string' ? cmd : (cmd.command || cmd)
      ).filter(Boolean)
      let previewString = commandStrings.join(' $$ ')

      // Apply mirroring when stabilized
      try {
        const bindset = this._currentEnvironment === 'alias' ? null : this.activeBindset
        const stabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
        if (stabilized && commandStrings.length > 1) {
          const mirroredStr = await this.request('fileops:generate-mirrored-commands', { commands: commandStrings.map(c=>({command:c})) })
          if (mirroredStr) previewString = mirroredStr
        }
      } catch {}

      // Format preview based on current environment
      if (selectedKeyName) {
        if (this._currentEnvironment === 'alias') {
          // In alias mode, show alias format: alias aliasName <& commands &>
          previewEl.textContent = `alias ${selectedKeyName} <& ${previewString} &>`
        } else {
          // In key mode, show keybind format: keyName "commands"
          previewEl.textContent = `${selectedKeyName} "${previewString}"`
        }
      } else {
        previewEl.textContent = ''
      }
    }
  }

  /**
   * Enable/disable chain-related buttons depending on environment & selection.
   */
  async updateChainActions () {
    // Use cached state from event listeners
    const hasSelectedKey = !!(this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey)

    // Always enable stabilize button only when a chain is selected
    const stabBtn = this.document.getElementById('stabilizeExecutionOrderBtn')
    if (stabBtn) {
      stabBtn.disabled = !hasSelectedKey
      // Update active state from metadata
      if (hasSelectedKey) {
        const name = this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey
        try {
          const bindset = this._currentEnvironment === 'alias' ? null : this.activeBindset
          // TEMPORARY DEBUG: Log the button state check
          if (name && bindset && bindset !== 'Primary Bindset') {
            console.log(`[DEBUG] Button state check for key "${name}" in bindset "${bindset}"`)
          }
          const isActive = await this.request('command:is-stabilized', { name, bindset })
          console.log(`[DEBUG] Button state result for "${name}": ${isActive}`)
          stabBtn.classList.toggle('active', !!isActive)
        } catch {}
      } else {
        stabBtn.classList.remove('active')
      }
    }

    if (this._currentEnvironment === 'alias') {
      // Alias mode – alias specific buttons
      const aliasButtons = ['deleteAliasChainBtn', 'duplicateAliasChainBtn']
      aliasButtons.forEach((id) => {
        const btn = this.document.getElementById(id)
        if (btn) btn.disabled = !hasSelectedKey
      })

      const addCommandBtn = this.document.getElementById('addCommandBtn')
      if (addCommandBtn) addCommandBtn.disabled = !hasSelectedKey

      const importBtn = this.document.getElementById('importFromKeyOrAliasBtn')
      if (importBtn) importBtn.disabled = !hasSelectedKey

      const keyButtons = ['deleteKeyBtn', 'duplicateKeyBtn']
      keyButtons.forEach((id) => {
        const btn = this.document.getElementById(id)
        if (btn) btn.disabled = true
      })
    } else {
      const keyButtons = ['addCommandBtn', 'importFromKeyOrAliasBtn', 'deleteKeyBtn', 'duplicateKeyBtn']
      keyButtons.forEach((id) => {
        const btn = this.document.getElementById(id)
        if (btn) btn.disabled = !hasSelectedKey
      })

      const aliasButtons = ['deleteAliasChainBtn', 'duplicateAliasChainBtn']
      aliasButtons.forEach((id) => {
        const btn = this.document.getElementById(id)
        if (btn) btn.disabled = true
      })
    }
  }

  /** Toggle stabilization flag for the current selection */
  async toggleStabilize () {
    const name = this._currentEnvironment === 'alias' ? this._selectedAlias : this._selectedKey
    if (!name) return

    const stabBtn = this.document.getElementById('stabilizeExecutionOrderBtn')
    const currentlyActive = stabBtn?.classList.contains('active')

    try {
      // Pass the current bindset when not in alias mode
      const bindset = this._currentEnvironment === 'alias' ? null : this.activeBindset
      console.log(`[DEBUG] Toggling stabilization for "${name}" in bindset "${bindset}" from ${currentlyActive} to ${!currentlyActive}`)
      const result = await this.request('command:set-stabilize', { name, stabilize: !currentlyActive, bindset })
      if (result && result.success) {
        console.log(`[DEBUG] Stabilization toggle successful, refreshing button state`)
        // Don't manually toggle the button - let updateChainActions set the correct state
        // from the actual backend data to avoid race conditions
        await this.updateChainActions()
        // Re-render preview after change
        this.render()
      } else {
        console.log(`[DEBUG] Stabilization toggle failed:`, result)
      }
    } catch (err) {
      console.error('[CommandChainUI] Failed to toggle stabilization', err)
    }
  }

  /**
   * Clean up event listeners when component is destroyed
   */
  destroy() {
    // Clean up event listeners to prevent memory leaks and duplicate handlers
    if (this._detachFunctions) {
      this._detachFunctions.forEach(detach => {
        if (typeof detach === 'function') {
          try {
            detach()
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      })
      this._detachFunctions = []
    }
  }

  /* ------------------------------------------------------------
   * Late-join: sync environment if InterfaceModeService broadcasts its
   * snapshot before we registered our listeners.
   * ---------------------------------------------------------- */
  handleInitialState (sender, state) {
    if (!state) return
   

    // Only accept environment updates from authoritative sources
    const canUpdateEnvironment = sender === 'InterfaceModeService' || sender === 'ProfileService' || sender === 'DataCoordinator'
    
    if ((state.environment || state.currentEnvironment) && canUpdateEnvironment) {
      const env = state.environment || state.currentEnvironment
      this._currentEnvironment = env
      this.updateChainActions()
      // Render to show appropriate empty state for the environment
      this.render().catch(() => {})
    }

    // Pick up bindset info from late-join broadcasts
    if (state.bindsets) {
      this._bindsetNames = Array.isArray(state.bindsets) ? state.bindsets : [...state.bindsets]
    }

    // Pick up preferences settings from late-join broadcast
    if (sender === 'PreferencesService' && state.settings) {
      console.log(`[CommandChainUI] Late-join state from PreferencesService:`, state.settings)
      this._bindsetsEnabled = !!state.settings.bindsetsEnabled
      this._bindToAliasMode = !!state.settings.bindToAliasMode
      console.log(`[CommandChainUI] Set bindToAliasMode = ${this._bindToAliasMode} from late-join`)
      if (this._bindsetsEnabled && !this._bindsetDropdownReady) {
        // preferences arrive before onInit resolved
        this.setupBindsetDropdown().catch(()=>{})
      }
    }
    
  }

  /* ------------------------------------------------------------ */
  /* Bindset Selector Initialization                             */
  /* ------------------------------------------------------------ */

  async initializeBindsetSelector() {
    try {
      // Initialize bindset selector service - it will handle its own service interactions via eventBus
      this.bindsetSelectorService = new BindsetSelectorService({
        eventBus: this.eventBus
      })
      
      // Initialize bindset selector UI
      this.bindsetSelectorUI = new BindsetSelectorUI({
        eventBus: this.eventBus,
        document: this.document
      })
      
      // Initialize components
      await this.bindsetSelectorService.init()
      await this.bindsetSelectorUI.init()
      
      console.log('[CommandChainUI] Bindset selector components initialized')
    } catch (error) {
      console.error('[CommandChainUI] Error initializing bindset selector:', error)
    }
  }

  /* ------------------------------------------------------------ */
  /* Bindset helpers                                              */
  /* ------------------------------------------------------------ */

  async setupBindsetDropdown() {
    // This method is now simplified - the new BindsetSelector components handle the UI
    const bindToAliasMode = this.getBindToAliasMode()
    const container = this.document.getElementById('bindsetSelectorContainer')
    
    // Hide bindset selector in alias mode since bindsets don't apply to aliases
    if (this._currentEnvironment === 'alias' || !this._bindsetsEnabled || !bindToAliasMode) {
      if (container) container.style.display = 'none'
      return
    }
    
    // Show the bindset selector container
    if (container) {
      container.style.display = 'block'
    }
    
    // Update bindset banner when enabled
    this.updateBindsetBanner()
    
    // Set initial active bindset if not already set
    if (!this.activeBindset) {
      this.activeBindset = 'Primary Bindset'
      this.emit('bindset:active-changed', { bindset: this.activeBindset })
    }
    
    this._bindsetDropdownReady = true
  }

  async getCommandsForCurrentSelection() {
    const hasAliasEnv = this._currentEnvironment === 'alias'
    if (hasAliasEnv) {
      return await this.request('command:get-for-selected-key', {
        key: this._selectedAlias,
        environment: this._currentEnvironment
      })
    }

    const keyName = this._selectedKey
    if (!keyName) return []

    if (!this.activeBindset || this.activeBindset === 'Primary Bindset') {
      // Use DataCoordinator directly for primary bindset
      return await this.request('data:get-key-commands', {
        environment: this._currentEnvironment,
        key: keyName,
      })
    }

    // For user-defined bindsets, ask BindsetService
    const cmds = await this.request('bindset:get-key-commands', {
      bindset: this.activeBindset,
      environment: this._currentEnvironment,
      key: keyName,
    })
    return cmds
  }

  /**
   * Ensure a banner element exists beneath the chain header content showing the
   * currently-active bindset (only when bindsets are enabled AND a non-primary
   * bindset is selected).
   */
  updateBindsetBanner() {
    try {
      const header = this.document.querySelector('.chain-header')
      if (!header) return

      let banner = this.document.getElementById('bindsetBanner')

      // Conditions to show banner
      const shouldShow = this._bindsetsEnabled && this.activeBindset && this.activeBindset !== 'Primary Bindset'

      if (!shouldShow) {
        if (banner) banner.remove()
        return
      }

      // Ensure header can wrap so banner goes to next line
      header.style.flexWrap = 'wrap'

      // Create banner lazily
      if (!banner) {
        banner = this.document.createElement('div')
        banner.id = 'bindsetBanner'
        banner.className = 'bindset-banner'
        // Basic inline styling; projects stylesheet can override
        Object.assign(banner.style, {
          marginTop: '4px',
          padding: '0.125rem 0.5rem',
          background: '#3a3d42',
          color: '#fff',
          borderRadius: '4px',
          fontSize: '0.85em',
          flex: '0 0 100%',
          textAlign: 'center',
        })
        header.appendChild(banner)
      }

      banner.textContent = this.activeBindset
    } catch (err) {
      console.error('[CommandChainUI] Failed to update bindset banner', err)
    }
  }
} 