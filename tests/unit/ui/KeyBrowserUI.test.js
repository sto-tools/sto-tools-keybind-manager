import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createEventBusFixture, createLocalStorageFixture } from '../../fixtures/index.js'
import KeyBrowserUI from '../../../src/js/components/ui/KeyBrowserUI.js'

function createDomFixture () {
  document.body.innerHTML = `
    <div class="key-selector-container">
      <button id="toggleKeyViewBtn"><i></i></button>
      <div id="keyGrid"></div>
    </div>
  `
  return { cleanup: () => (document.body.innerHTML = '') }
}

describe('KeyBrowserUI', () => {
  let eventBusFixture, ui, dom, storageFixture

  beforeEach(() => {
    dom = createDomFixture()
    eventBusFixture = createEventBusFixture()
    storageFixture = createLocalStorageFixture()

    vi.stubGlobal('requestAnimationFrame', (cb) => cb())

    ui = new KeyBrowserUI({ eventBus: eventBusFixture.eventBus, document })
    ui.init()
  })

  afterEach(() => {
    dom.cleanup()
    eventBusFixture.destroy()
    storageFixture.destroy()
    vi.restoreAllMocks()
  })

  it('toggleKeyView should cycle view modes and store in localStorage', () => {
    const btn = document.getElementById('toggleKeyViewBtn')

    expect(localStorage.getItem('keyViewMode') || 'grid').toBe('grid')

    ui.toggleKeyView() // grid -> categorized
    expect(localStorage.getItem('keyViewMode')).toBe('categorized')
    expect(btn.querySelector('i').className).toContain('fa-sitemap')

    ui.toggleKeyView() // categorized -> key-types
    expect(localStorage.getItem('keyViewMode')).toBe('key-types')

    ui.toggleKeyView() // key-types -> grid
    expect(localStorage.getItem('keyViewMode')).toBe('grid')
  })

  it('toggleVisibility should hide and show container based on environment', async () => {
    const container = document.querySelector('.key-selector-container')

    ui.toggleVisibility('alias')
    // Wait for rAF
    await new Promise(r => setTimeout(r, 0))
    expect(container.style.display).toBe('none')

    ui.toggleVisibility('space')
    await new Promise(r => setTimeout(r, 0))
    expect(container.style.display).not.toBe('none')
  })
}) 