import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import AliasBrowserUI from '../../../src/js/components/ui/AliasBrowserUI.js'
import { createUIComponentFixture } from '../../fixtures/ui/component.js'

function createDocumentMock() {
  const aliasGrid = {
    querySelectorAll: vi.fn(() => []),
    querySelector: vi.fn(() => null),
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    innerHTML: '',
    style: {}
  }

  const duplicateAliasInput = {
    value: 'copyAlias',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }

  const duplicateAliasConfirmBtn = {
    disabled: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }

  const duplicateAliasValidation = {
    textContent: '',
    style: { display: 'none' }
  }

  const duplicateModal = {
    querySelector: vi.fn((selector) => {
      if (selector === '#duplicateAliasNameInput') return duplicateAliasInput
      if (selector === '#confirmDuplicateAliasBtn') return duplicateAliasConfirmBtn
      if (selector === '#duplicateAliasValidation') return duplicateAliasValidation
      return null
    })
  }

  return {
    getElementById: vi.fn((id) => {
      if (id === 'aliasGrid') {
        return aliasGrid
      }
      if (id === 'aliasDuplicateModal') {
        return duplicateModal
      }
      return null
    }),
    createElement: vi.fn(() => ({
      value: '',
      textContent: '',
      innerHTML: '',
      className: '',
      id: '',
      style: {},
      classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      click: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
      appendChild: vi.fn(),
      removeChild: vi.fn(),
      querySelector: vi.fn(),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn()
    })),
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
      querySelector: vi.fn(),
      createElement: vi.fn(() => ({
        value: '',
        textContent: '',
        innerHTML: '',
        className: '',
        id: '',
        style: {},
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        click: vi.fn(),
        focus: vi.fn(),
        blur: vi.fn(),
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        querySelector: vi.fn(),
        setAttribute: vi.fn(),
        removeAttribute: vi.fn()
      }))
    }
  }
}

const noopModalManager = {
  show: vi.fn(),
  hide: vi.fn()
}

describe('AliasBrowserUI Duplicate Flow', () => {
  let fixture, component

beforeEach(() => {
  fixture = createUIComponentFixture(AliasBrowserUI, {
    i18n: {
      t: vi.fn((key, params) => {
        if (key === 'alias_duplicated_successfully') return `Alias copied from "${params.from}" to "${params.to}"`
        if (key === 'duplicate_failed_error') return `Failed to duplicate alias "${params.sourceName}": ${params.reason}`
        return key
        })
      },
      document: createDocumentMock(),
      autoInit: false
    })

    component = fixture.component
    component.modalManager = noopModalManager
    component.confirmDialog = { confirm: vi.fn(() => Promise.resolve(true)) }
    component.cache = component.cache || {}
    component.cache.aliases = {
      testAlias: { commands: ['FireAll'], description: 'desc' }
    }

    fixture.mockResponse('alias:get-all', async () => ({ aliases: { testAlias: { commands: ['FireAll'], description: 'desc' } } }))
    fixture.mockResponse('alias:duplicate-with-name', async ({ sourceName, newName }) => ({
      success: true,
      message: 'alias_duplicated_successfully',
      params: { from: sourceName, to: newName }
    }))

    component.init()
  })

afterEach(() => {
  fixture.cleanup()
  vi.restoreAllMocks()
})

  it('duplicates alias using modal name and refreshes cache', async () => {
    const renderSpy = vi.spyOn(component, 'render').mockResolvedValue()
    await component.duplicateAlias('testAlias')

    const modal = fixture.document.getElementById('aliasDuplicateModal')
    const confirmBtn = modal.querySelector('#confirmDuplicateAliasBtn')
    await confirmBtn.onclick()

    expect(component.cache.aliases).toHaveProperty('testAlias_copy')
    expect(renderSpy).toHaveBeenCalled()
  })
})
