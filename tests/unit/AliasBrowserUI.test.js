import { describe, it, expect, beforeEach, vi } from 'vitest'
import AliasBrowserUI from '../../src/js/components/ui/AliasBrowserUI.js'
import eventBus from '../../src/js/core/eventBus.js'

// Mock i18next
vi.mock('i18next', () => ({
  default: {
    t: vi.fn(key => key)
  }
}))

// Mock request responder
vi.mock('../../src/js/core/requestResponse.js', async () => {
  // Original module to re-export types
  const mod = await vi.importActual('../../src/js/core/requestResponse.js')
  return {
    ...mod,
    request: vi.fn(async (bus, topic) => {
      if (topic === 'alias:get-all') return {}
      if (topic === 'alias:get-selected-name') return null
      if (topic === 'state:current-environment') return 'space'
      return undefined
    })
  }
})

describe('AliasBrowserUI', () => {
  let ui
  let mockDocument

  beforeEach(() => {
    mockDocument = {
      getElementById: vi.fn(() => ({
        innerHTML: '',
        classList: {
          remove: vi.fn(),
          add: vi.fn(),
          toggle: vi.fn()
        },
        querySelectorAll: vi.fn(() => [])
      }))
    }

    ui = new AliasBrowserUI({ eventBus, document: mockDocument })
  })

  describe('createAliasElement', () => {
    it('should handle empty commands string correctly', async () => {
      const element = ui.createAliasElement('test', { commands: '' })
      expect(element).toContain('0 <span data-i18n="commands">commands</span>')
    })

    it('should handle whitespace-only commands string correctly', () => {
      const element = ui.createAliasElement('test', { commands: '   ' })
      expect(element).toContain('0 <span data-i18n="commands">commands</span>')
    })

    it('should handle undefined commands correctly', () => {
      const element = ui.createAliasElement('test', {})
      expect(element).toContain('0 <span data-i18n="commands">commands</span>')
    })

    it('should handle non-string commands value correctly', () => {
      const element = ui.createAliasElement('test', { commands: true })
      expect(element).toContain('0 <span data-i18n="commands">commands</span>')
    })

    it('should count commands correctly for valid command string', () => {
      const element = ui.createAliasElement('test', { commands: 'cmd1$$cmd2$$cmd3' })
      expect(element).toContain('3 <span data-i18n="commands">commands</span>')
    })

    it('should handle commands with surrounding whitespace correctly', () => {
      const element = ui.createAliasElement('test', { commands: '  cmd1  $$  cmd2  $$  cmd3  ' })
      expect(element).toContain('3 <span data-i18n="commands">commands</span>')
    })
  })
}) 