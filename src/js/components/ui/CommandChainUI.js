import UIComponentBase from '../UIComponentBase.js'
import { enrichForDisplay, normalizeToString } from '../../lib/commandDisplayAdapter.js'
import i18next from 'i18next'

export default class CommandChainUI extends UIComponentBase {
  constructor ({ eventBus, ui = null, document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    super(eventBus)
    this.componentName = 'CommandChainUI'
    this.ui = ui || (typeof stoUI !== 'undefined' ? stoUI : null)
    this.document = document

  }

  async onInit () {
    // Store detach functions for cleanup
    this._detachFunctions = []
    
    // Listen for chain-data updates broadcast by service
    this._detachFunctions.push(
      this.eventBus.on('chain-data-changed', ({ commands }) => {
        console.log('[CommandChainUI] chain-data-changed received with', commands.length, 'commands')
        this.render(commands)
      })
    )

    // Listen for environment or key/alias changes for button state and caching
    this._detachFunctions.push(
      this.eventBus.on('environment:changed', (data) => {
        const env = typeof data === 'string' ? data : data?.environment

        if (env) {
          this.updateChainActions()
          this.updatePreviewLabel()
          this.setupBindsetDropdown().catch(() => {})
          // Re-render to show correct empty state info for new environment
          this.render().catch(() => {})
        }
      })
    )

    // Listen for key selection
    this._detachFunctions.push(
      this.eventBus.on('key-selected', async (data) => {
        const selectedKey = data.key !== undefined ? data.key : data.name
        this.updateChainActions()

        // Update bindset selector with selected key first (can be null)
        this.emit('bindset-selector:set-selected-key', { key: selectedKey })

        // Reset to Primary Bindset when selecting a different key (unless already on Primary)
        // Only do this if a key was actually selected (not null)
        if (selectedKey && this.cache.activeBindset !== 'Primary Bindset') {
          this.cache.activeBindset = 'Primary Bindset'
          this.emit('bindset-selector:set-active-bindset', { bindset: 'Primary Bindset' })
          this.updateBindsetBanner()
        }
      })
    )

    // Listen for profile switching to clear cached state and show empty state
    this._detachFunctions.push(
      this.eventBus.on('profile:switched', (data) => {
        console.log('[CommandChainUI] Profile switched, clearing cached state')
        // Reset to Primary Bindset when switching profiles
        this.cache.activeBindset = 'Primary Bindset'
        this.emit('bindset-selector:set-active-bindset', { bindset: 'Primary Bindset' })
        this.updateBindsetBanner()
        this.updateChainActions()
        
        // Render immediately to show empty state (don't wait for key selection)
        this.render().catch(() => {})
      })
    )

    // Listen for language changes to re-render command items with new translations
    this._detachFunctions.push(
      this.eventBus.on('language:changed', () => {
        this.render()
      })
    )

    // Listen for bindset selector active changes
    this._detachFunctions.push(
      this.eventBus.on('bindset-selector:active-changed', ({ bindset }) => {
        this.cache.activeBindset = bindset
        this.updateBindsetBanner()
        this.updateChainActions()
        this.render()
      })
    )

    // Listen for key added to bindset - should switch to that bindset and show empty chain
    console.log('[CommandChainUI] Setting up bindset-selector:key-added event listener')
    this._detachFunctions.push(
      this.eventBus.on('bindset-selector:key-added', ({ key, bindset }) => {
        console.log(`[CommandChainUI] *** bindset-selector:key-added received: key=${key}, bindset=${bindset}, selectedKey=${this.cache.selectedKey} ***`)
        if (key === this.cache.selectedKey) {
          console.log(`[CommandChainUI] *** Key added to bindset: ${bindset} (bindset switching already handled) ***`)
          // NOTE: The BindsetSelectorService now switches to the bindset immediately when adding the key
          // So we don't need to call setActiveBindset again here - it's already done
          // The bindset-selector:active-changed event will have already fired
        } else {
          console.log(`[CommandChainUI] *** Event key ${key} does not match selectedKey ${this.cache.selectedKey}, ignoring ***`)
        }
      })
    )
    console.log('[CommandChainUI] bindset-selector:key-added event listener registered')

    // Listen for key removed from bindset - switch to Primary if it was the active bindset
    this._detachFunctions.push(
      this.eventBus.on('bindset-selector:key-removed', ({ key, bindset }) => {
        if (key === this.cache.selectedKey && this.cache.activeBindset === bindset) {
          // Switch to Primary Bindset since the key was removed from the active bindset
          this.cache.activeBindset = 'Primary Bindset'
          this.emit('bindset-selector:set-active-bindset', { bindset: 'Primary Bindset' })
          this.updateBindsetBanner()
          this.updateChainActions()
          this.render()
        }
      })
    )

    // Listen for preferences loaded event so we can initialize bindset UI based on saved settings
    this._detachFunctions.push(
      this.eventBus.on('preferences:loaded', async ({ settings }) => {
        if (settings && typeof settings.bindsetsEnabled !== 'undefined') {
          // Use centralized cache instead of local variable
          if (!!this.cache.preferences.bindsetsEnabled && !this._bindsetDropdownReady) {
            await this.setupBindsetDropdown()
          }
        }
      })
    )

    // Listen for bindset changes
    this._detachFunctions.push(
      this.eventBus.on('bindsets:changed', async (data) => {
        console.log('[CommandChainUI] bindsets:changed received with', data.names.length, 'bindsets')
        this._bindsetNames = data.names
        await this.setupBindsetDropdown()
      })
    )

    // Listen for stabilization button click
    const stabilizeBtn = this.document.getElementById('stabilizeExecutionOrderBtn')
    if (stabilizeBtn && !this._stabilizeListenerAttached) {
      stabilizeBtn.addEventListener('click', async () => {
        await this.toggleStabilize()
      })
      this._stabilizeListenerAttached = true
    }

    // Listen for copy alias button click
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

    // Setup drag/drop
    this.setupDragAndDrop()

    this.updateChainActions()
    
    // UIComponentBase will handle initial render when data dependencies are ready

    // Listen for preference changes that toggle bindsets at runtime
    this._detachFunctions.push(
      this.eventBus.on('preferences:changed', async (data) => {
        const changes = data.changes || { [data.key]: data.value }
        let needsDropdownUpdate = false
        let needsRender = false
        
        for (const [key, value] of Object.entries(changes)) {
          if (key === 'bindsetsEnabled') {
            // Use centralized cache instead of local variable
            needsDropdownUpdate = true
            if (!value && this._bindsetDropdownReady) {
              const sel = this.document.getElementById('bindsetSelect')
              if (sel) sel.style.display = 'none'
            }
          } else if (key === 'bindToAliasMode') {
            console.log(`[CommandChainUI] Preference changed: bindToAliasMode = ${value}`)
            // ComponentBase handles this.cache.preferences.bindToAliasMode automatically
            needsDropdownUpdate = true
            needsRender = true
          }
        }
        
        if (needsDropdownUpdate) {
          await this.setupBindsetDropdown()
        }
        
        if (needsRender) {
          this.render().catch(() => {})
        }
      })
    )

    this.cache.activeBindset = this.cache.activeBindset || 'Primary Bindset'
    
    this.emit('bindset:active-changed', { bindset: this.cache.activeBindset })
  }

  // Render the command chain
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
      const bindToAliasMode = this.cache.preferences.bindToAliasMode
      console.log(`[CommandChainUI] render: bindToAliasMode = ${bindToAliasMode} (type: ${typeof bindToAliasMode})`)
      console.log(`[CommandChainUI] render: full preferences cache:`, this.cache.preferences)

      // When render is called with explicit commands (from chain-data-changed),
      // use those. When called without commands (from environment:changed),
      // only render if we have a selected key/alias to avoid race conditions
      // during initialization.
      let commands = commandsArg
      if (!commands) {
        const selectedKeyName = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
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
      const selectedKeyName = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey

      if (!selectedKeyName || commands.length === 0) {
        // Empty state - use empty state info for title and preview
        titleEl.textContent   = emptyStateInfo.title
        if (countSpanEl) countSpanEl.textContent = emptyStateInfo.commandCount

        // Update previews for bind-to-alias mode (handles empty commands case)
        await this.updateBindToAliasMode(bindToAliasMode, selectedKeyName, commands)

        // Create new container content atomically
        const newContent = this.document.createElement('div')
        newContent.innerHTML = `
          <div class="empty-state ${commands.length === 0 ? 'show' : ''}" id="emptyState">
            <i class="${emptyStateInfo.icon}"></i>
            <h4>${emptyStateInfo.emptyTitle}</h4>
            <p>${emptyStateInfo.emptyDesc}</p>
          </div>`
        
        // Atomic replacement
        container.replaceChildren(...newContent.children)

        try {
          const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
          const stabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
          const isAlias = this.cache.currentEnvironment === 'alias'
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
      
      if (bindToAliasMode && selectedKeyName && this.cache.currentEnvironment !== 'alias') {
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
      if (!bindToAliasMode && selectedKeyName && this.cache.currentEnvironment !== 'alias') {
        try {
          const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
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
        const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
        const stabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
        const isAlias = this.cache.currentEnvironment === 'alias'
        this.emit('command-chain:validate', { key: selectedKeyName, stabilized, isAlias })
      } catch (_) {
        // best-effort – ignore if service not available yet
      }

      // Update / insert bindset banner (always do this early so header is correct)
      this.updateBindsetBanner()
  }

  // Create a command element
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



  // Update previews for bind-to-alias mode
  updatePreviewLabel() {
    const labelEl = this.document.querySelector('.generated-command label[data-i18n]')
    if (labelEl) {
      const newKey = this.cache.currentEnvironment === 'alias' ? 'generated_alias' : 'generated_command'
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

    console.log(`[CommandChainUI] updateBindToAliasMode: bindToAliasMode=${bindToAliasMode}, selectedKeyName=${selectedKeyName}, environment=${this.cache.currentEnvironment}, activeBindset=${this.cache.activeBindset}`)
    
    if (!generatedAlias || !aliasPreviewEl || !previewEl) {
      console.log(`[CommandChainUI] Missing UI elements: generatedAlias=${!!generatedAlias}, aliasPreviewEl=${!!aliasPreviewEl}, previewEl=${!!previewEl}`)
      return
    }

    if (bindToAliasMode && selectedKeyName && this.cache.currentEnvironment !== 'alias') {
      // Show generated alias section
      generatedAlias.style.display = ''
      
      try {
        // Generate alias name using CommandChainService
        const aliasName = await this.request('command-chain:generate-alias-name', {
          environment: this.cache.currentEnvironment,
          keyName: selectedKeyName,
          bindsetName: this.cache.activeBindset
        })
        
        if (aliasName) {
          // Generate alias preview using CommandChainService (with mirroring support)
          let aliasPreview = await this.request('command-chain:generate-alias-preview', {
            aliasName,
            commands
          })
          
          // Apply mirroring when stabilized
          try {
            const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
            const stabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
            if (stabilized && commands.length > 1) {
              const commandStrings = commands.map(cmd => 
                typeof cmd === 'string' ? cmd : (cmd.command || cmd)
              ).filter(Boolean)
              const mirroredStr = await this.request('fileops:generate-mirrored-commands', { commands: commandStrings.map(c=>({command:c})) })
              if (mirroredStr) {
                aliasPreview = `alias ${aliasName} <& ${mirroredStr} &>`
              }
            }
          } catch (error) {
            console.warn('[CommandChainUI] Failed to apply mirroring:', error)
          }
          
          // Update alias preview to show the generated alias definition
          aliasPreviewEl.textContent = aliasPreview
          
          // Update main preview to show keybind that calls the alias
          previewEl.textContent = `${selectedKeyName} "${aliasName}"`
        } else {
          aliasPreviewEl.textContent = 'Invalid key name for alias generation'
          previewEl.textContent = `${selectedKeyName} "..."`
        }
      } catch (error) {
        console.error('[CommandChainUI] Failed to generate alias preview:', error)
        aliasPreviewEl.textContent = 'Error generating alias preview'
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
        const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
        const stabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
        if (stabilized && commandStrings.length > 1) {
          const mirroredStr = await this.request('fileops:generate-mirrored-commands', { commands: commandStrings.map(c=>({command:c})) })
          if (mirroredStr) previewString = mirroredStr
        }
      } catch {}

      // Format preview based on current environment
      if (selectedKeyName) {
        if (this.cache.currentEnvironment === 'alias') {
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

  // Enable/disable chain-related buttons depending on environment & selection.
  async updateChainActions () {
    // Use cached state from event listeners
    const hasSelectedKey = !!(this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey)

    // Always enable stabilize button only when a chain is selected
    const stabBtn = this.document.getElementById('stabilizeExecutionOrderBtn')
    if (stabBtn) {
      stabBtn.disabled = !hasSelectedKey
      // Update active state from metadata
      if (hasSelectedKey) {
        const name = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
        try {
          const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
          // Check button state for stabilization
          const isActive = await this.request('command:is-stabilized', { name, bindset })
          // Update button visual state
          stabBtn.classList.toggle('active', !!isActive)
        } catch {}
      } else {
        stabBtn.classList.remove('active')
      }
    }

    if (this.cache.currentEnvironment === 'alias') {
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

  // Toggle stabilization flag for the current selection
  async toggleStabilize () {
    const name = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
    if (!name) return

    const stabBtn = this.document.getElementById('stabilizeExecutionOrderBtn')
    const currentlyActive = stabBtn?.classList.contains('active')

    try {
      // Pass the current bindset when not in alias mode
      const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
      // Toggle stabilization state
      const result = await this.request('command:set-stabilize', { name, stabilize: !currentlyActive, bindset })
      if (result && result.success) {
        // Stabilization toggled successfully
        // Don't manually toggle the button - let updateChainActions set the correct state
        // from the actual backend data to avoid race conditions
        await this.updateChainActions()
        // Re-render preview after change
        this.render()
      } else {
        // Stabilization toggle failed
      }
    } catch (err) {
      console.error('[CommandChainUI] Failed to toggle stabilization', err)
    }
  }

  // Clean up event listeners when component is destroyed
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

  // Late-join: sync environment if InterfaceModeService broadcasts its snapshot before we registered our listeners.
  handleInitialState (sender, state) {
    if (!state) return
   
    // Restore selection from SelectionService late-join
    if (sender === 'SelectionService') {
      this.render().catch(() => {})
      return
    }

    // Only accept environment updates from authoritative sources
    const canUpdateEnvironment = sender === 'InterfaceModeService' || sender === 'DataCoordinator'
    
    if ((state.environment || state.currentEnvironment) && canUpdateEnvironment) {
      const env = state.environment || state.currentEnvironment
      // ComponentBase automatically handles environment caching
      this.updateChainActions()
      // Render to show appropriate empty state for the environment
      this.render().catch(() => {})
    }

    // Pick up bindset info from late-join broadcasts
    if (state.bindsets) {
      this._bindsetNames = Array.isArray(state.bindsets) ? state.bindsets : [...state.bindsets]
    }

    // ComponentBase now handles PreferencesService late-join automatically
    if (sender === 'PreferencesService' && this.cache.preferences) {
      console.log(`[CommandChainUI] Late-join preferences received, checking bindset setup`)
      if (!!this.cache.preferences.bindsetsEnabled && !this._bindsetDropdownReady) {
        // preferences arrive before onInit resolved
        this.setupBindsetDropdown().catch(()=>{})
      }
    }
    
  }

  // Bindset helpers
  async setupBindsetDropdown() {
    const bindToAliasMode = this.cache.preferences.bindToAliasMode
    const container = this.document.getElementById('bindsetSelectorContainer')
    
    // Hide bindset selector in alias mode since bindsets don't apply to aliases
    if (this.cache.currentEnvironment === 'alias' || !this.cache.preferences.bindsetsEnabled || !bindToAliasMode) {
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
    if (!this.cache.activeBindset) {
      this.cache.activeBindset = 'Primary Bindset'
      this.emit('bindset:active-changed', { bindset: this.cache.activeBindset })
    }
    
    this._bindsetDropdownReady = true
  }

  async getCommandsForCurrentSelection() {
    const hasAliasEnv = this.cache.currentEnvironment === 'alias'
    if (hasAliasEnv) {
      return await this.request('command:get-for-selected-key', {
        key: this.cache.selectedAlias,
        environment: this.cache.currentEnvironment
      })
    }

    const keyName = this.cache.selectedKey
    if (!keyName) return []

    if (!this.cache.activeBindset || this.cache.activeBindset === 'Primary Bindset') {
      // Use DataCoordinator directly for primary bindset
      return await this.request('data:get-key-commands', {
        environment: this.cache.currentEnvironment,
        key: keyName,
      })
    }

    // For user-defined bindsets, ask BindsetService
    const cmds = await this.request('bindset:get-key-commands', {
      bindset: this.cache.activeBindset,
      environment: this.cache.currentEnvironment,
      key: keyName,
    })
    return cmds
  }

  // Ensure a banner element exists beneath the chain header content showing the currently-active bindset
  updateBindsetBanner() {
    try {
      const header = this.document.querySelector('.chain-header')
      if (!header) return

      let banner = this.document.getElementById('bindsetBanner')

      // Conditions to show banner
      const shouldShow = this.cache.preferences.bindsetsEnabled && this.cache.activeBindset && this.cache.activeBindset !== 'Primary Bindset'

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

      banner.textContent = this.cache.activeBindset
    } catch (err) {
      console.error('[CommandChainUI] Failed to update bindset banner', err)
    }
  }

  /**
   * UIComponentBase: Check if component has required data for rendering
   * CommandChainUI needs basic cache data to render properly
   */
  hasRequiredData() {
    // We need at least some basic environment data to render
    // The component can render empty state without specific key/alias selection
    return this.cache && this.cache.currentEnvironment
  }

  /**
   * UIComponentBase: Perform initial render when data dependencies are ready
   * This replaces the setTimeout pattern
   */
  performInitialRender() {
    this.render().catch((error) => {
      console.error('[CommandChainUI] Initial render failed:', error)
    })
  }
} 