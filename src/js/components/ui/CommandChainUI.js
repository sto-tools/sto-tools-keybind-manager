import UIComponentBase from '../UIComponentBase.js'
import { enrichForDisplay, normalizeToString } from '../../lib/commandDisplayAdapter.js'

export default class CommandChainUI extends UIComponentBase {
  constructor ({ eventBus, ui = null, document = (typeof window !== 'undefined' ? window.document : undefined), i18n }) {
    super(eventBus)
    this.componentName = 'CommandChainUI'
    this.ui = ui || (typeof stoUI !== 'undefined' ? stoUI : null)
    this.document = document
    this.i18n = i18n

  }

  async onInit () {
    await this.setupEventListeners()
    this.render()
  }

  async setupEventListeners() {
    if (this.eventListenersSetup) return
    this.eventListenersSetup = true
    
    // Listen for chain-data updates broadcast by service
    this.addEventListener('chain-data-changed', ({ commands }) => {
      console.log('[CommandChainUI] chain-data-changed received with', commands.length, 'commands')
      this.render(commands)
    })

    // Listen for environment or key/alias changes for button state and caching
    this.addEventListener('environment:changed', (data) => {
      const env = typeof data === 'string' ? data : data?.environment

      if (env) {
        this.updateChainActions()
        this.updatePreviewLabel()
        this.setupBindsetDropdown().catch(() => {})
        // Re-render to show correct empty state info for new environment
        this.render().catch(() => {})
      }
    })

    // Listen for key selection
    this.addEventListener('key-selected', async (data) => {
      const selectedKey = data.key !== undefined ? data.key : data.name
      if (selectedKey !== undefined) {
        this.cache.selectedKey = selectedKey
      }
      if (data?.environment) {
        this.cache.currentEnvironment = data.environment
      }

      this.updateChainActions()

      // Update bindset selector with selected key first (can be null)
      this.emit('bindset-selector:set-selected-key', { key: selectedKey })

      await this.refreshActiveBindset()
    })

    // Listen for profile switching to clear cached state and show empty state
    this.addEventListener('profile:switched', async (data) => {
      console.log('[CommandChainUI] Profile switched, clearing cached state')
      // Reset to Primary Bindset when switching profiles
      await this.request('bindset-selector:set-active-bindset', { bindset: 'Primary Bindset' })
      // updateBindsetBanner and updateChainActions will be called by the bindset-selector:active-changed listener

      // Render immediately to show empty state (don't wait for key selection)
      this.render().catch(() => {})
    })

    // Listen for language changes to re-render command items with new translations
    this.addEventListener('language:changed', () => {
      this.render()
    })

    // Listen for bindset selector active changes
    this.addEventListener('bindset-selector:active-changed', ({ bindset }) => {
      this.cache.activeBindset = bindset
      this.updateBindsetBanner()
      this.updateChainActions()
      this.render()
    })

    // Late-join state sync: ensure we have the current selection in cache even if the initial event fired before listeners were ready
    try {
      const currentSelectedKey = await this.request('key:get-selected')
      if (currentSelectedKey) {
        this.cache.selectedKey = currentSelectedKey
      }
    } catch (err) {
      console.warn('[CommandChainUI] Failed to sync initial selected key state', err)
    }

    if (!this.cache.currentEnvironment) {
      this.cache.currentEnvironment = 'space'
    }

    // Listen for key added to bindset - should switch to that bindset and show empty chain
    console.log('[CommandChainUI] Setting up bindset-selector:key-added event listener')
    this.addEventListener('bindset-selector:key-added', ({ key, bindset }) => {
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
    console.log('[CommandChainUI] bindset-selector:key-added event listener registered')

    // Listen for key removed from bindset - switch to Primary if it was the active bindset
    this.addEventListener('bindset-selector:key-removed', async ({ key, bindset }) => {
      if (key === this.cache.selectedKey && this.cache.activeBindset === bindset) {
        // Switch to Primary Bindset since the key was removed from the active bindset
        await this.request('bindset-selector:set-active-bindset', { bindset: 'Primary Bindset' })
        // updateBindsetBanner, updateChainActions, and render will be called by the bindset-selector:active-changed listener
      }
    })

    // Listen for preferences loaded event so we can initialize bindset UI based on saved settings
    this.addEventListener('preferences:loaded', async ({ settings }) => {
      if (settings && typeof settings.bindsetsEnabled !== 'undefined') {
        // Use centralized cache instead of local variable
        if (!!this.cache.preferences.bindsetsEnabled && !this._bindsetDropdownReady) {
          await this.setupBindsetDropdown()
        }
      }
    })

    // Listen for bindset changes
    this.addEventListener('bindsets:changed', async (data) => {
      console.log('[CommandChainUI] bindsets:changed received with', data.names.length, 'bindsets')
      this._bindsetNames = data.names
      await this.setupBindsetDropdown()
    })

    // Listen for stabilization button click
    this.onDom('stabilizeExecutionOrderBtn', 'click', 'commandchain-stabilize', async () => {
      await this.toggleStabilize()
    })

    // Listen for copy alias button click
    this.onDom('copyAliasBtn', 'click', 'commandchain-copy-alias', async () => {
      await this.copyAliasToClipboard()
    })

    // Listen for copy command preview button click
    this.onDom('copyPreviewBtn', 'click', 'commandchain-copy-preview', async () => {
      await this.copyCommandPreviewToClipboard()
    })

    // Listen for command action button clicks (using delegation)
    this.onDom('#commandList', 'click', 'commandchain-action', (e) => {
      const editBtn = e.target.closest('.btn-edit:not(.btn-placeholder)')
      const deleteBtn = e.target.closest('.btn-delete')
      const upBtn = e.target.closest('.btn-up')
      const downBtn = e.target.closest('.btn-down')

      if (editBtn && !editBtn.disabled) {
        const commandItem = editBtn.closest('.command-item-row')
        const index = parseInt(commandItem?.dataset?.index)
        if (!Number.isNaN(index)) {
          console.log('[CommandChainUI] EDIT BUTTON CLICKED:', {
            index,
            buttonId: editBtn.id,
            buttonClass: editBtn.className,
            buttonElement: editBtn
          })
          e.preventDefault()
          e.stopPropagation()
          this.emit('commandchain:edit', { index })
        }
      } else if (deleteBtn && !deleteBtn.disabled) {
        const commandItem = deleteBtn.closest('.command-item-row')
        const index = parseInt(commandItem?.dataset?.index)
        if (!Number.isNaN(index)) {
          console.log('[CommandChainUI] DELETE BUTTON CLICKED:', {
            index,
            buttonId: deleteBtn.id,
            buttonClass: deleteBtn.className,
            buttonElement: deleteBtn
          })
          e.preventDefault()
          e.stopPropagation()
          this.emit('commandchain:delete', { index })
        }
      } else if (upBtn && !upBtn.disabled) {
        const commandItem = upBtn.closest('.command-item-row')
        const index = parseInt(commandItem?.dataset?.index)
        const groupType = commandItem?.dataset?.group || null
        if (!Number.isNaN(index)) {
          const targetIndex = this.getMoveTarget(index, groupType, 'up')
          this.emit('commandchain:move', { fromIndex: index, toIndex: targetIndex })
        }
      } else if (downBtn && !downBtn.disabled) {
        const commandItem = downBtn.closest('.command-item-row')
        const index = parseInt(commandItem?.dataset?.index)
        const groupType = commandItem?.dataset?.group || null
        if (!Number.isNaN(index)) {
          const targetIndex = this.getMoveTarget(index, groupType, 'down')
          this.emit('commandchain:move', { fromIndex: index, toIndex: targetIndex })
        }
      }
    })

    // Listen for double-click on customizable commands
    this.onDom('#commandList', 'dblclick', 'commandchain-edit-customizable', (e) => {
      const commandItem = e.target.closest('.command-item-row.customizable')
      if (commandItem) {
        const index = parseInt(commandItem.dataset?.index)
        if (!Number.isNaN(index)) {
          console.log('[CommandChainUI] DOUBLE-CLICK on command element:', {
            index,
            target: e.target,
            targetClass: e.target.className
          })
          this.emit('commandchain:edit', { index })
        }
      }
    })

    // Listen for palindromic toggle button clicks
    this.onDom('#commandList', 'click', 'commandchain-palindromic-toggle', async (e) => {
      const palindromicBtn = e.target.closest('.btn-palindromic-toggle')
      if (palindromicBtn) {
        e.preventDefault()
        e.stopPropagation()
        const index = parseInt(palindromicBtn.dataset.commandIndex)
        if (!Number.isNaN(index)) {
          // Get the actual command to determine current state
          const commands = await this.getCommandsForCurrentSelection()
          if (commands && index >= 0 && index < commands.length) {
            const command = commands[index]
            // Determine current state: included if string or palindromicGeneration !== false
            const isCurrentlyIncluded = typeof command !== 'object' || command.palindromicGeneration !== false
            // Toggle: if currently included, exclude it (set to false)
            const newValue = !isCurrentlyIncluded
            console.log('[CommandChainUI] Toggling palindromic:', { index, command, isCurrentlyIncluded, newValue })
            await this.updateCommandPalindromicSetting(index, 'palindromicGeneration', newValue)
          }
        }
      }
    })

    // Listen for placement toggle button clicks
    this.onDom('#commandList', 'click', 'commandchain-placement-toggle', async (e) => {
      const placementBtn = e.target.closest('.btn-placement-toggle')
      if (placementBtn) {
        e.preventDefault()
        e.stopPropagation()
        const index = parseInt(placementBtn.dataset.commandIndex)
        if (!Number.isNaN(index)) {
          // Get the actual command to determine current state
          const commands = await this.getCommandsForCurrentSelection()
          if (commands && index >= 0 && index < commands.length) {
            const command = commands[index]
            // Determine current placement
            const currentPlacement = typeof command === 'object' && command.placement ? command.placement : 'before-pre-pivot'
            // Toggle: if in pivot group, move to before-pre-pivot, otherwise move to pivot group
            const newPlacement = currentPlacement === 'in-pivot-group' ? 'before-pre-pivot' : 'in-pivot-group'
            console.log('[CommandChainUI] Toggling placement:', { index, command, currentPlacement, newPlacement })
            await this.updateCommandPalindromicSetting(index, 'placement', newPlacement)
          }
        }
      }
    })

    // Listen for group header clicks to toggle collapse
    this.onDom('#commandList', 'click', 'commandchain-group-header', (e) => {
      const groupHeader = e.target.closest('.group-header')
      if (groupHeader) {
        const groupType = groupHeader.dataset.group
        if (groupType) {
          const isCollapsed = this.getGroupCollapsedState(groupType)
          this.setGroupCollapsedState(groupType, !isCollapsed)
          // Re-render to show updated state
          this.render()
        }
      }
    })

    // Setup drag/drop
    this.setupDragAndDrop()

    this.updateChainActions()

    // UIComponentBase will handle initial render when data dependencies are ready

    // Listen for preference changes that toggle bindsets at runtime
    this.addEventListener('preferences:changed', async (data) => {
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

    // Initialize active bindset if not already set (ComponentBase should handle this via state sync)
    if (!this.cache.activeBindset) {
      console.log('[CommandChainUI] No active bindset in cache, waiting for ComponentBase state sync')
      // REMOVED: await this.request('bindset-selector:set-active-bindset', { bindset: 'Primary Bindset' })
    }
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

        // CRITICAL: Add explicit profile validation to prevent undefined display during initialization
        if (!selectedKeyName || !this.cache.profile || !this.cache.currentProfile) {
          // No selection or profile data yet - show clean empty state without attempting to resolve undefined data
          const emptyStateInfo = await this.request('command:get-empty-state-info')
          titleEl.textContent = emptyStateInfo.title || ''
          previewEl.textContent = emptyStateInfo.preview || ''
          if (countSpanEl) countSpanEl.textContent = emptyStateInfo.commandCount || ''

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
        // We have a selection and profile data, so request the commands
        commands = await this.getCommandsForCurrentSelection()
      }

      const emptyStateInfo = await this.request('command:get-empty-state-info')

      // Use cached selection state from event listeners
      const selectedKeyName = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey

      // Bindset context is not guaranteed to be initialized on early renders; default to Primary
      if (!this.cache.activeBindset) {
        this.cache.activeBindset = 'Primary Bindset'
      }

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

      // Find the translation key spans for pluralization
      const commandTranslationSpan = commandCountDisplay?.querySelector('[data-i18n="commands"], [data-i18n="command_singular"]')
      const aliasCommandTranslationSpan = aliasCommandCountDisplay?.querySelector('[data-i18n="commands"], [data-i18n="command_singular"]')

      const commandCount = commands.length
      const translationKey = commandCount === 1 ? 'command_singular' : 'commands'

      if (bindToAliasMode && selectedKeyName && this.cache.currentEnvironment !== 'alias') {
        // Show count on Generated Alias section
        if (aliasCountSpanEl) aliasCountSpanEl.textContent = commandCount.toString()
        if (aliasCommandTranslationSpan) {
          aliasCommandTranslationSpan.setAttribute('data-i18n', translationKey)
          aliasCommandTranslationSpan.textContent = this.i18n.t(translationKey)
        }
        if (aliasCommandCountDisplay) aliasCommandCountDisplay.style.display = ''
        if (commandCountDisplay) commandCountDisplay.style.display = 'none'
      } else {
        // Show count on Generated Command section (normal mode)
        if (countSpanEl) countSpanEl.textContent = commandCount.toString()
        if (commandTranslationSpan) {
          commandTranslationSpan.setAttribute('data-i18n', translationKey)
          commandTranslationSpan.textContent = this.i18n.t(translationKey)
        }
        if (commandCountDisplay) commandCountDisplay.style.display = ''
        if (aliasCommandCountDisplay) aliasCommandCountDisplay.style.display = 'none'
      }

      // Update previews based on bind-to-alias mode
      await this.updateBindToAliasMode(bindToAliasMode, selectedKeyName, commands)

      // For non-bind-to-alias mode, ensure key preview shows mirrored commands when stabilized
      // CRITICAL: This should only apply when NOT in bind-to-alias mode to prevent conflicts
      // ADDITIONAL SAFEGUARD: Double-check bindToAliasMode to prevent race conditions
      const currentBindToAliasMode = this.cache.preferences?.bindToAliasMode ?? false
      if (!bindToAliasMode && !currentBindToAliasMode && selectedKeyName && this.cache.currentEnvironment !== 'alias') {
        console.log('[CommandChainUI] Applying mirroring for non-bind-to-alias mode')
        try {
          const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
          const stabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
          if (stabilized && commands.length > 1) {
            const cmdParts = commands.map(c => (typeof c === 'string' ? { command: c } : c))
            const mirroredStr = await this.request('command:generate-mirrored-commands', { commands: cmdParts })
            if (mirroredStr) {
              previewEl.textContent = `${selectedKeyName} "${mirroredStr}"`
            }
          }
        } catch (err) {
          console.warn('[CommandChainUI] Failed to generate mirrored preview', err)
        }
      } else if (bindToAliasMode || currentBindToAliasMode) {
        console.log('[CommandChainUI] Skipping mirroring logic - bind-to-alias mode is active')
      }

      // Hide any existing empty state
      if (emptyState) emptyState.classList.remove('show')

      // Check if chain is stabilized to determine rendering mode
      let isStabilized = false
      try {
        const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
        isStabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
      } catch (err) {
        console.warn('[CommandChainUI] Failed to check stabilization state:', err)
      }

      // Build the complete new command list structure atomically
      const newCommandElements = []

      if (isStabilized && commands.length > 0) {
        // Use grouped rendering for stabilized chains
        const groups = this.groupCommands(commands)
        // Store group structure for event handlers
        this.currentGroups = groups
        // Render groups in order: non-trayexec, palindromic, pivot
        const groupOrder = ['non-trayexec', 'palindromic', 'pivot']
        for (const groupType of groupOrder) {
          const groupData = groups[groupType]
          // Only render groups that have commands
          if (groupData && groupData.commands.length > 0) {
            // Render group separator
            const separator = this.renderGroupSeparator(groupType, groupData)
            if (separator) {
              const separatorEl = this.document.createElement('div')
              separatorEl.innerHTML = separator
              newCommandElements.push(...separatorEl.children)
            }
            
            // Render commands in group (if not collapsed)
            if (!groupData.isCollapsed) {
              for (let groupIndex = 0; groupIndex < groupData.commands.length; groupIndex++) {
                const { command, index } = groupData.commands[groupIndex]
                // Pass group-relative index (1-based) for display when stabilized
                const displayIndex = groupIndex + 1
                const el = await this.createCommandElement(command, index, commands.length, groupType, displayIndex)
                newCommandElements.push(el)
              }
            }
          }
        }
      } else {
        // Clear group structure for unstabilized mode
        this.currentGroups = null
        // Use flat rendering for unstabilized chains
        for (let i = 0; i < commands.length; i++) {
          const el = await this.createCommandElement(commands[i], i, commands.length)
          newCommandElements.push(el)
        }
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

  // Group commands into sections for stabilized chains
  groupCommands(commands) {
    const groups = {
      'non-trayexec': {
        title: this.i18n.t('command_group_non_trayexec'),
        commands: [],
        isCollapsed: this.getGroupCollapsedState('non-trayexec')
      },
      'palindromic': {
        title: this.i18n.t('command_group_palindromic'),
        commands: [],
        isCollapsed: this.getGroupCollapsedState('palindromic')
      },
      'pivot': {
        title: this.i18n.t('command_group_pivot'),
        commands: [],
        isCollapsed: this.getGroupCollapsedState('pivot')
      }
    }

    // Check if there are any commands explicitly in pivot group
    let hasExplicitPivotGroup = false
    commands.forEach((cmd, index) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.command
      const isTrayExec = cmdStr.match(/^(?:\+)?TrayExecByTray/)
      const isExcluded = typeof cmd === 'object' && cmd.palindromicGeneration === false
      const isInPivotGroup = typeof cmd === 'object' && cmd.placement === 'in-pivot-group'
      
      if (isInPivotGroup) {
        hasExplicitPivotGroup = true
      }
    })

    commands.forEach((cmd, index) => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.command
      const isTrayExec = cmdStr.match(/^(?:\+)?TrayExecByTray/)
      const isExcluded = typeof cmd === 'object' && cmd.palindromicGeneration === false
      const isInPivotGroup = typeof cmd === 'object' && cmd.placement === 'in-pivot-group'
      
      // Determine which group this command belongs to
      let targetGroup = null
      if (!isTrayExec) {
        targetGroup = 'non-trayexec'
      } else if (isExcluded && isInPivotGroup && hasExplicitPivotGroup) {
        // Only add to pivot group if there's an explicit pivot group
        targetGroup = 'pivot'
      } else if (isExcluded) {
        // Excluded but not in pivot group (or no explicit pivot group) - goes with non-TrayExec
        targetGroup = 'non-trayexec'
      } else {
        // Included in palindrome
        targetGroup = 'palindromic'
      }

      groups[targetGroup].commands.push({ command: cmd, index })
    })

    return groups
  }

  // Get collapsed state for a group from localStorage
  getGroupCollapsedState(groupType) {
    if (typeof window === 'undefined' || !window.localStorage) return false
    const storageKey = `commandGroup_${groupType}_collapsed`
    return localStorage.getItem(storageKey) === 'true'
  }

  // Set collapsed state for a group in localStorage
  setGroupCollapsedState(groupType, collapsed) {
    if (typeof window === 'undefined' || !window.localStorage) return
    const storageKey = `commandGroup_${groupType}_collapsed`
    if (collapsed) {
      localStorage.setItem(storageKey, 'true')
    } else {
      localStorage.removeItem(storageKey)
    }
  }

  // Render group separator with collapsible header
  renderGroupSeparator(groupType, groupData) {
    const reorderHint = this.getReorderHint(groupType)
    
    return `
      <div class="command-group-separator" data-group="${groupType}">
        <div class="group-header" data-group="${groupType}" data-action="commandchain-group-header">
          <div class="group-info">
            <i class="fas fa-chevron-right twisty ${groupData.isCollapsed ? 'collapsed' : ''}"></i>
            <span class="group-title">${groupData.title}</span>
            <span class="group-count">(${groupData.commands.length})</span>
          </div>
          ${reorderHint ? `
            <div class="group-hint">
              ${reorderHint}
            </div>
          ` : ''}
        </div>
      </div>
    `
  }

  // Get reorder hint for a group type
  getReorderHint(groupType) {
    switch (groupType) {
      case 'non-trayexec':
        return this.i18n.t('command_group_hint_fixed_order')
      case 'palindromic':
        return this.i18n.t('command_group_hint_palindromic')
      case 'pivot':
        return this.i18n.t('command_group_hint_pivot')
      default:
        return ''
    }
  }

  // Create a command element
  getButtonState (direction, index, total, groupType, displayIndex) {
    // Dual-mode logic: stabilized mode uses group-aware logic, unstabilized uses current behavior
    if (groupType && this.currentGroups && this.currentGroups[groupType]) {
      // Stabilized mode: use group-relative logic
      const groupData = this.currentGroups[groupType]
      const groupCommands = groupData.commands
      const groupSize = groupCommands.length

      // Find this command's position within its group
      const groupIndex = groupCommands.findIndex(cmd => cmd.index === index)

      // For single-item groups, show grayed out buttons (consistent with non-stabilized mode)
      if (groupSize <= 1) {
        return direction === 'up'
          ? '<button class="command-action-btn btn-up" title="Move Up" disabled><i class="fas fa-chevron-up"></i></button>'
          : '<button class="command-action-btn btn-down" title="Move Down" disabled><i class="fas fa-chevron-down"></i></button>'
      }

      // For multi-item groups, use group-relative boundaries
      if (direction === 'up') {
        const isFirstInGroup = groupIndex === 0
        return `<button class="command-action-btn btn-up" title="Move Up" ${isFirstInGroup ? 'disabled' : ''}><i class="fas fa-chevron-up"></i></button>`
      } else {
        const isLastInGroup = groupIndex === groupSize - 1
        return `<button class="command-action-btn btn-down" title="Move Down" ${isLastInGroup ? 'disabled' : ''}><i class="fas fa-chevron-down"></i></button>`
      }
    } else {
      // Unstabilized mode: use exact current logic to preserve existing behavior
      if (direction === 'up') {
        return `<button class="command-action-btn btn-up" title="Move Up" ${index === 0 ? 'disabled' : ''}><i class="fas fa-chevron-up"></i></button>`
      } else {
        return `<button class="command-action-btn btn-down" title="Move Down" ${index === total - 1 ? 'disabled' : ''}><i class="fas fa-chevron-down"></i></button>`
      }
    }
  }

  getMoveTarget (index, groupType, direction) {
    // Dual-mode logic: stabilized mode uses group-aware logic, unstabilized uses current behavior
    if (groupType && this.currentGroups && this.currentGroups[groupType]) {
      // Stabilized mode: calculate valid target within the same group
      const groupData = this.currentGroups[groupType]
      const groupCommands = groupData.commands
      const groupSize = groupCommands.length

      // Find this command's position within its group
      const groupIndex = groupCommands.findIndex(cmd => cmd.index === index)

      if (direction === 'up') {
        // Can't move up if already first in group
        if (groupIndex <= 0) {
          return index // No valid move, return same index
        }
        // Return the actual array index of the command above in the group
        return groupCommands[groupIndex - 1].index
      } else {
        // Can't move down if already last in group
        if (groupIndex >= groupSize - 1) {
          return index // No valid move, return same index
        }
        // Return the actual array index of the command below in the group
        return groupCommands[groupIndex + 1].index
      }
    } else {
      // Unstabilized mode: use exact current logic to preserve existing behavior
      if (direction === 'up') {
        return index - 1
      } else {
        return index + 1
      }
    }
  }

  async createCommandElement (command, index, total, groupType = null, displayIndex = null) {
    const element = this.document.createElement('div') || {}
    if (!element.dataset) {
      element.dataset = {}
    }
    element.className = 'command-item-row'
    element.dataset.index = index
    element.draggable = true
    if (groupType) {
      element.dataset.group = groupType
    }

    // Convert canonical string command to rich object for display
    const commandString = typeof command === 'string' ? command : normalizeToString(command)

    // Get i18n object for translations
    const i18n = this.i18n

    // Enrich command for display
    const richCommand = await enrichForDisplay(commandString, i18n, { eventBus: this.eventBus })
    console.log('[CommandChainUI] enriched command:', richCommand)

    // Check if stabilization is enabled for the current key/alias
    let isStabilized = false
    try {
      const selectedKeyName = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
      if (selectedKeyName) {
        const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
        isStabilized = await this.request('command-chain:is-stabilized', { name: selectedKeyName, bindset })
      }
    } catch (error) {
      console.warn('[CommandChainUI] Failed to check stabilization state:', error)
    }

    // Look up definition for display helpers
    const commandDef = await this.request('command:find-definition', { command: commandString })
    // Determine if this command should expose parameter editing
    const isCustomCmd = richCommand.type === 'custom' || richCommand.category === 'custom'
    const isParameterized = (commandDef && commandDef.customizable) || isCustomCmd

    // Determine if this is a TrayExec command for palindromic controls
    const isTrayExec = commandString.match(/^(?:\+)?TrayExecByTray/)

    // Extract palindromic settings from command object (if rich object)
    // Default is included (palindromicGeneration !== false), so active = included
    // If it's a string, it's included. If it's an object, it's included unless palindromicGeneration is explicitly false
    const isIncludedInPalindromic = typeof command !== 'object' || command.palindromicGeneration !== false
    const isExcluded = !isIncludedInPalindromic
    const placement = typeof command === 'object' && command.placement ? command.placement : 'before-pre-pivot'
    const isInPivotGroup = placement === 'in-pivot-group'

    // Generate palindromic toggle button (only show for TrayExec commands when stabilized)
    // Active = included in palindrome, Inactive = excluded
    let palindromicButton = ''
    if (isStabilized && isTrayExec) {
      const palindromicTooltip = isIncludedInPalindromic 
        ? this.i18n.t('palindromic_included_tooltip')
        : this.i18n.t('palindromic_excluded_tooltip')
      palindromicButton = `
        <button class="command-action-btn toolbar-toggle btn-palindromic-toggle ${isIncludedInPalindromic ? 'active' : ''}" 
                title="${palindromicTooltip}" 
                data-command-index="${index}"
                data-action="commandchain-palindromic-toggle">
          <i class="fas fa-balance-scale"></i>
        </button>
      `
    }

    // Generate placement toggle button (only show for excluded TrayExec commands when stabilized)
    // Active = in pivot group, Inactive = before pre-pivot
    let placementButton = ''
    if (isStabilized && isTrayExec && isExcluded) {
      const placementTooltip = isInPivotGroup
        ? this.i18n.t('placement_in_pivot_group_tooltip')
        : this.i18n.t('placement_before_palindromes_tooltip')
      placementButton = `
        <button class="command-action-btn toolbar-toggle btn-placement-toggle ${isInPivotGroup ? 'active' : ''}" 
                title="${placementTooltip}" 
                data-command-index="${index}"
                data-action="commandchain-placement-toggle">
          <i class="fas fa-arrows-left-right-to-line"></i>
        </button>
      `
    }

    // Helper function to format display text from i18n objects
    const formatDisplayText = (displayText) => {
      if (typeof displayText === 'string') {
        return displayText
      }
      if (typeof displayText === 'object' && displayText) {
        // Handle i18n structure with key/params/fallback
        if (displayText.key && displayText.fallback) {
          // Try to get i18n translation if available
          if (this.i18n && this.i18n.t) {
            const translated = this.i18n.t(displayText.key, displayText.params || {})
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
      // Double-click is now handled by EventBus delegation in setupEventListeners()
    }

    // Pass the command string (not object) to get-warning
    const warningInfo = await this.request('command:get-warning', { command: commandString })

    // Resolve tooltip text using the central i18n service so that dynamic language switching works
    let warningText = null
    if (warningInfo) {
      const translated = this.i18n.t(warningInfo)
      // Use translated value if available; otherwise fall back to original (may already be natural language)
      warningText = translated && translated !== warningInfo ? translated : warningInfo
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

    // Use displayIndex if provided (group-relative for stabilized), otherwise use global index
    const numberToDisplay = displayIndex !== null ? displayIndex : (index + 1)
    element.innerHTML = `
      <div class="command-number">${numberToDisplay}</div>
      <div class="command-content">
        <span class="command-icon">${displayIcon}</span>
        <span class="command-text">${displayName}${parameterInd}</span>
        ${warningIcon}
      </div>
      <span class="command-type ${commandType}">${commandType}</span>
      <div class="command-actions">
        ${isParameterized ? `<button class="command-action-btn btn-edit" title="Edit Command"><i class="fas fa-edit"></i></button>` : `<button class="command-action-btn btn-edit btn-placeholder" disabled aria-hidden="true" style="visibility:hidden"><i class="fas fa-edit"></i></button>`}
        <button class="command-action-btn command-action-btn-danger btn-delete" title="Delete Command"><i class="fas fa-times"></i></button>
        ${palindromicButton}
        ${placementButton}
        ${this.getButtonState('up', index, total, groupType, displayIndex)}
        ${this.getButtonState('down', index, total, groupType, displayIndex)}
      </div>`

    // Command action buttons are now handled by EventBus delegation in setupEventListeners()
    // No need for individual event listeners here

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
      } else if (this.i18n && this.i18n.t) {
        // Fallback: apply translation directly
        labelEl.textContent = this.i18n.t(newKey)
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

    // Double-check current bindToAliasMode preference to handle race conditions
    const currentBindToAliasMode = this.cache.preferences?.bindToAliasMode ?? false
    const effectiveBindToAliasMode = bindToAliasMode || currentBindToAliasMode

    console.log(`[CommandChainUI] updateBindToAliasMode: bindToAliasMode=${bindToAliasMode}, current=${currentBindToAliasMode}, effective=${effectiveBindToAliasMode}, selectedKeyName=${selectedKeyName}, environment=${this.cache.currentEnvironment}, activeBindset=${this.cache.activeBindset}`)
    
    if (!generatedAlias || !aliasPreviewEl || !previewEl) {
      console.log(`[CommandChainUI] Missing UI elements: generatedAlias=${!!generatedAlias}, aliasPreviewEl=${!!aliasPreviewEl}, previewEl=${!!previewEl}`)
      return
    }

    if (effectiveBindToAliasMode && selectedKeyName && this.cache.currentEnvironment !== 'alias') {
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
              const mirroredStr = await this.request('command:generate-mirrored-commands', { commands: commandStrings.map(c=>({command:c})) })
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
          // CRITICAL: In bind-to-alias mode, main preview should ALWAYS show alias name, never raw commands
          previewEl.textContent = `${selectedKeyName} "${aliasName}"`

          // ADDITIONAL SAFEGUARD: Ensure bind-to-alias mode takes precedence over any subsequent mirroring logic
          if (effectiveBindToAliasMode) {
            console.log('[CommandChainUI] Set main preview to alias name - bind-to-alias mode takes precedence')
          }
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
          const mirroredStr = await this.request('command:generate-mirrored-commands', { commands: commandStrings.map(c=>({command:c})) })
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

      
      const importBtn = this.document.getElementById('importFromKeyOrAliasBtn')
      if (importBtn) importBtn.disabled = !hasSelectedKey

      const keyButtons = ['deleteKeyBtn', 'duplicateKeyBtn']
      keyButtons.forEach((id) => {
        const btn = this.document.getElementById(id)
        if (btn) btn.disabled = true
      })
    } else {
      const keyButtons = ['importFromKeyOrAliasBtn', 'deleteKeyBtn', 'duplicateKeyBtn']
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
      
      // If disabling stabilization, extract original commands (before-pre-pivot + pre-pivot + pivot)
      if (currentlyActive) {
        const commands = await this.getCommandsForCurrentSelection()
        if (commands && commands.length > 0) {
          const originalCommands = this.extractOriginalFromMirrored(commands)
          
          // Save the extracted original commands
          const environment = this.cache.currentEnvironment
          let payload
          if (this.cache.currentEnvironment === 'alias') {
            payload = {
              modify: {
                aliases: {
                  [name]: { commands: originalCommands }
                }
              }
            }
          } else if (bindset && bindset !== 'Primary Bindset') {
            payload = {
              modify: {
                bindsets: {
                  [bindset]: {
                    [environment]: {
                      keys: { [name]: originalCommands }
                    }
                  }
                }
              }
            }
          } else {
            payload = {
              modify: {
                builds: {
                  [environment]: {
                    keys: { [name]: originalCommands }
                  }
                }
              }
            }
          }
          
          await this.request('data:update-profile', {
            profileId: this.cache.currentProfile,
            ...payload
          })
        }
      }
      
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

  // Extract original commands from a mirrored sequence using the same logic as mirrorCommands
  // but without the post-pivot mirror. This ensures consistency with the mirroring algorithm.
  extractOriginalFromMirrored(commands) {
    if (!Array.isArray(commands) || commands.length === 0) return commands

    // Use the same grouping logic as mirrorCommands, but work with command objects
    const beforePrePivot = []  // Non-TrayExec + excluded TrayExec (before)
    const palindromic = []     // TrayExec for mirroring (pre-pivot candidates)
    const pivotGroup = []      // Excluded TrayExec (in pivot)

    commands.forEach(cmd => {
      const cmdStr = typeof cmd === 'string' ? cmd : cmd.command
      const isTrayExec = cmdStr.match(/^(?:\+)?TrayExecByTray/)
      const isExcluded = typeof cmd === 'object' && cmd.palindromicGeneration === false

      if (!isTrayExec) {
        beforePrePivot.push(cmd)  // Non-TrayExec first
      } else if (isExcluded) {
        if (typeof cmd === 'object' && cmd.placement === 'in-pivot-group') {
          pivotGroup.push(cmd)
        } else {
          beforePrePivot.push(cmd)  // before-pre-pivot
        }
      } else {
        palindromic.push(cmd)  // Normal TrayExec palindrome
      }
    })

    // Determine pivot/pivot group + pre-pivot (same logic as mirrorCommands)
    let pivot = []
    let prePivot = palindromic

    if (pivotGroup.length > 0) {
      pivot = pivotGroup  // Use specified pivot group
    } else if (palindromic.length > 0) {
      pivot = [palindromic[palindromic.length - 1]]  // Last item becomes pivot
      prePivot = palindromic.slice(0, -1)  // All others are pre-pivot
    }

    // Return original sequence: before-pre-pivot + pre-pivot + pivot (no post-pivot)
    return [...beforePrePivot, ...prePivot, ...pivot]
  }

  // Update palindromic settings for a specific command using lazy rich object conversion
  async updateCommandPalindromicSetting(commandIndex, setting, value) {
    try {
      // Get current commands for the selected key/alias
      const commands = await this.getCommandsForCurrentSelection()
      if (!commands || commandIndex < 0 || commandIndex >= commands.length) {
        console.warn('[CommandChainUI] Invalid command index:', commandIndex)
        return
      }

      const command = commands[commandIndex]
      const commandString = typeof command === 'string' ? command : normalizeToString(command)

      console.log('[CommandChainUI] updateCommandPalindromicSetting:', {
        commandIndex,
        setting,
        value,
        currentCommand: command,
        commandString
      })

      // Apply lazy rich object conversion: only convert to rich object when user customizes
      if (typeof command === 'string') {
        // Convert string to rich object with palindromic settings
        commands[commandIndex] = {
          command: commandString,
          palindromicGeneration: value // Set to the new value (true or false)
        }
      } else {
        // Update existing rich object - always explicitly set the value
        const updatedCommand = { ...command, [setting]: value }
        commands[commandIndex] = updatedCommand
      }

      console.log('[CommandChainUI] Updated command:', commands[commandIndex])

      // Update the command chain with the modified commands using data:update-profile
      const selectedKeyName = this.cache.currentEnvironment === 'alias' ? this.cache.selectedAlias : this.cache.selectedKey
      if (selectedKeyName) {
        const bindset = this.cache.currentEnvironment === 'alias' ? null : this.cache.activeBindset
        const environment = this.cache.currentEnvironment
        
        // Build the update payload - preserve rich objects
        let payload
        if (this.cache.currentEnvironment === 'alias') {
          // For aliases, update the commands property
          payload = {
            modify: {
              aliases: {
                [selectedKeyName]: { commands }
              }
            }
          }
        } else if (bindset && bindset !== 'Primary Bindset') {
          // For bindsets, update in bindsets structure
          payload = {
            modify: {
              bindsets: {
                [bindset]: {
                  [environment]: {
                    keys: { [selectedKeyName]: commands }
                  }
                }
              }
            }
          }
        } else {
          // For primary bindset, update in builds structure
          payload = {
            modify: {
              builds: {
                [environment]: {
                  keys: { [selectedKeyName]: commands }
                }
              }
            }
          }
        }
        
        console.log('[CommandChainUI] Updating commands with payload:', payload)
        
        await this.request('data:update-profile', {
          profileId: this.cache.currentProfile,
          ...payload
        })
        
        // Re-fetch commands to ensure we have the saved state
        const updatedCommands = await this.getCommandsForCurrentSelection()
        console.log('[CommandChainUI] Commands after update:', updatedCommands)
        
        // Trigger re-render to show updated button state
        this.render(updatedCommands)
      }
    } catch (err) {
      console.error('[CommandChainUI] Failed to update command palindromic setting:', err)
    }
  }

  // Clean up event listeners when component is destroyed
  onDestroy() {
    // Event cleanup is now handled automatically by ComponentBase
    // Both this.addEventListener() and this.onDom() listeners are cleaned up automatically
    // Additional cleanup logic can be added here if needed
  }

  // Late-join: sync environment if InterfaceModeService broadcasts its snapshot before we registered our listeners.
  handleInitialState (sender, state) {
    if (!state) return

    // NEW: Handle BindsetSelectorService state
    if (sender === 'BindsetSelectorService') {
      console.log('[CommandChainUI] Received initial state from BindsetSelectorService:', state)
      // ComponentBase automatically updates this.cache.activeBindset and other common state
      // Update any UI-specific state if needed
      this.updateBindsetBanner()
      this.updateChainActions()
      this.render()
      return
    }

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
    
    await this.refreshActiveBindset()
    this._bindsetDropdownReady = true
  }

  async refreshActiveBindset(preferredBindset = undefined) {
    try {
      if (preferredBindset !== undefined) {
        const resolved = preferredBindset || 'Primary Bindset'
        this.cache.activeBindset = resolved
        this.updateBindsetBanner()
        return
      }

      // FIXED: State should be available via ComponentBase synchronization
      if (this.cache.activeBindset) {
        this.updateBindsetBanner()
      } else {
        console.warn('[CommandChainUI] No active bindset in cache - ComponentBase state sync may be incomplete')
      }
    } catch (error) {
      console.error('[CommandChainUI] Failed to refresh active bindset state', error)
    }
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

    const bindsetsEnabled = this.cache.preferences?.bindsetsEnabled === true
    if (!bindsetsEnabled || !this.cache.activeBindset || this.cache.activeBindset === 'Primary Bindset') {
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

      const shouldShow = this.cache.activeBindset && this.cache.activeBindset !== 'Primary Bindset'

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
   * Copy alias content to clipboard
   */
  async copyAliasToClipboard() {
    const aliasPreviewEl = this.document.getElementById('aliasPreview')
    const text = aliasPreviewEl?.textContent?.trim()
    if (!text) {
      this.showToast(this.i18n.t('nothing_to_copy'), 'warning')
      return
    }

    try {
      const result = await this.request('utility:copy-to-clipboard', { text })
      if (result?.success) {
        const successMessage = this.i18n.t(result?.message || 'content_copied_to_clipboard')
        this.showToast(successMessage, 'success')
      } else {
        const errorMessage = this.i18n.t(result?.message || 'failed_to_copy_to_clipboard')
        this.showToast(errorMessage, 'error')
      }
    } catch (error) {
      console.error('Failed to copy alias to clipboard:', error)
      this.showToast(this.i18n.t('failed_to_copy_to_clipboard'), 'error')
    }
  }

  async copyCommandPreviewToClipboard() {
    const commandPreviewEl = this.document.getElementById('commandPreview')
    const text = commandPreviewEl?.textContent?.trim()
    if (!text) {
      this.showToast(this.i18n.t('nothing_to_copy'), 'warning')
      return
    }

    try {
      const result = await this.request('utility:copy-to-clipboard', { text })
      if (result?.success) {
        const successMessage = this.i18n.t(result?.message || 'content_copied_to_clipboard')
        this.showToast(successMessage, 'success')
      } else {
        const errorMessage = this.i18n.t(result?.message || 'failed_to_copy_to_clipboard')
        this.showToast(errorMessage, 'error')
      }
    } catch (error) {
      console.error('Failed to copy command preview to clipboard:', error)
      const fallback = this.i18n.t('failed_to_copy_to_clipboard')
      this.showToast(fallback, 'error')
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
