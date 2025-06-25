import { describe, it, expect, beforeEach, vi } from 'vitest'
import AliasBrowserUI from '../../src/js/components/ui/AliasBrowserUI.js'
import i18next from 'i18next'

// Mock i18next
vi.mock('i18next', () => ({
  default: {
    t: vi.fn(key => key)
  }
}))

describe('AliasBrowserUI', () => {
  let ui
  let mockService
  let mockDocument

  beforeEach(() => {
    mockService = {
      addEventListener: vi.fn(),
      getAliases: vi.fn(),
      selectAlias: vi.fn(),
      selectedAliasName: null
    }

    mockDocument = {
      getElementById: vi.fn(() => ({
        innerHTML: '',
        classList: {
          remove: vi.fn()
        },
        querySelectorAll: vi.fn(() => [])
      }))
    }

    ui = new AliasBrowserUI({ service: mockService, document: mockDocument })
  })

  describe('createAliasElement', () => {
    it('should handle empty commands string correctly', () => {
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