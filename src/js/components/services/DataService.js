import ComponentBase from '../ComponentBase.js'
import { respond } from '../../core/requestResponse.js'

/**
 * DataService - Centralizes access to STO_DATA using request/response pattern
 * Eliminates direct globalThis.STO_DATA references throughout the codebase
 * All communication happens via event bus request/response
 */
export default class DataService extends ComponentBase {
  constructor({ eventBus, data = null } = {}) {
    super(eventBus)
    this.componentName = 'DataService'
    
    // REFACTORED: Strict dependency injection - no global fallbacks
    this.data = data || {}
    
    // Track response handlers for cleanup
    this.responseHandlers = []
  }

  onInit() {
    // Set up request/response handlers for data access
    this.responseHandlers.push(
      this.respond('data:get-commands', () => {
        return this.data.commands || {}
      })
    )

    this.responseHandlers.push(
      this.respond('data:get-command-category', ({ categoryId }) => {
        return this.data.commands?.[categoryId] || null
      })
    )

    this.responseHandlers.push(
      this.respond('data:get-command-definition', ({ categoryId, commandId }) => {
        return this.data.commands?.[categoryId]?.commands?.[commandId] || null
      })
    )

    this.responseHandlers.push(
      this.respond('data:find-command-by-name', ({ command }) => {
        if (!this.data.commands || !command) return null
        
        // Special debug logging for Holster commands
        if (command.toLowerCase().includes('holster')) {
          console.log(`[DEBUG] DataService searching for command: "${command}"`)
        }
        
        // Search through all categories to find the command
        for (const [categoryId, category] of Object.entries(this.data.commands)) {
          if (category.commands) {
            for (const [commandId, commandDef] of Object.entries(category.commands)) {
              if (commandDef.command === command) {
                if (command.toLowerCase().includes('holster')) {
                  console.log(`[DEBUG] DataService found command "${command}" in ${categoryId}.${commandId}:`, commandDef)
                }
                return {
                  ...commandDef,
                  categoryId,
                  commandId
                }
              }
            }
          }
        }
        
        if (command.toLowerCase().includes('holster')) {
          console.log(`[DEBUG] DataService command "${command}" NOT FOUND in library`)
        }
        return null
      })
    )

    this.responseHandlers.push(
      this.respond('data:get-validation-patterns', () => {
        return this.data.validation || {}
      })
    )

    this.responseHandlers.push(
      this.respond('data:get-key-name-pattern', () => {
        // Use STO_KEY_NAMES list for validation instead of regex pattern
        return this.data.validation?.keyNamePattern || 'USE_STO_KEY_NAMES'
      })
    )

    this.responseHandlers.push(
      this.respond('data:get-alias-name-pattern', () => {
        return this.data.validation?.aliasNamePattern || /^[A-Za-z0-9_]+$/
      })
    )

    this.responseHandlers.push(
      this.respond('data:has-commands', () => {
        return !!(this.data && this.data.commands)
      })
    )

    this.responseHandlers.push(
      this.respond('data:get-tray-category', () => {
        return this.data.commands?.tray || null
      })
    )

    this.responseHandlers.push(
      this.respond('data:get-communication-category', () => {
        return this.data.commands?.communication || null
      })
    )

    this.responseHandlers.push(
      this.respond('data:get-combat-category', () => {
        return this.data.commands?.combat || null
      })
    )

    this.responseHandlers.push(
      this.respond('data:get-default-profiles', () => {
        return this.data.defaultProfiles || {}
      })
    )

    this.responseHandlers.push(
      this.respond('data:get-default-profile', ({ profileId }) => {
        return this.data.defaultProfiles?.[profileId] || null
      })
    )
  }

  onDestroy() {
    // Clean up response handlers
    this.responseHandlers.forEach(detach => {
      if (typeof detach === 'function') {
        detach()
      }
    })
    this.responseHandlers = []
  }

  /**
   * Update the data source (for testing or dynamic updates)
   */
  updateData(newData) {
    this.data = newData || {}
    this.emit('data:updated', { data: this.data })
  }

  /**
   * Provide current state for late-join handshake
   */
  getCurrentState() {
    return {
      defaultProfiles: this.data.defaultProfiles || {},
      hasCommands: !!(this.data && this.data.commands),
      dataAvailable: Object.keys(this.data).length > 0
    }
  }
} 