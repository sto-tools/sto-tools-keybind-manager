import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest'
import { createServiceFixture, createLocalStorageFixture } from '../../fixtures/index.js'
import { respond } from '../../../src/js/core/requestResponse.js'
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
  let fixture, eventBusFixture, eventBus, ui, dom, storageFixture

  beforeEach(() => {
    dom = createDomFixture()
    fixture = createServiceFixture()
    eventBusFixture = fixture.eventBusFixture
    eventBus = fixture.eventBus
    storageFixture = createLocalStorageFixture()

    vi.stubGlobal('requestAnimationFrame', (cb) => cb())

    // Mock KeyBrowserService endpoints that the UI now delegates to
    respond(eventBus, 'key:sort', ({ keys }) => {
      return keys ? keys.sort() : []
    })
    
    respond(eventBus, 'key:filter', ({ keys, filter }) => {
      if (!keys) return []
      if (!filter) return keys
      return keys.filter(key => key.toLowerCase().includes(filter.toLowerCase()))
    })
    
    respond(eventBus, 'key:categorize-by-command', ({ keysWithCommands, allKeys }) => {
      return {
        unknown: { name: 'Unknown', icon: 'fas fa-question-circle', keys: allKeys || [], priority: 0 }
      }
    })
    
    respond(eventBus, 'key:categorize-by-type', ({ keysWithCommands, allKeys }) => {
      return {
        function: { name: 'Function Keys', icon: 'fas fa-keyboard', keys: [], priority: 1 },
        alphanumeric: { name: 'Letters & Numbers', icon: 'fas fa-font', keys: [], priority: 2 },
        other: { name: 'Other Keys', icon: 'fas fa-question-circle', keys: allKeys || [], priority: 9 }
      }
    })
    
    respond(eventBus, 'key:compare', ({ keyA, keyB }) => {
      return keyA.localeCompare(keyB)
    })
    
    respond(eventBus, 'key:detect-types', ({ keyName }) => {
      if (/^F[0-9]+$/.test(keyName)) return ['function']
      if (/^[A-Z0-9]$/.test(keyName)) return ['alphanumeric']
      return ['other']
    })
    
    respond(eventBus, 'key:toggle-category', ({ categoryId, mode }) => {
      return Math.random() > 0.5 // Mock toggle behavior
    })
    
    respond(eventBus, 'key:get-category-state', ({ categoryId, mode }) => {
      return false // Mock collapsed state
    })

    ui = new KeyBrowserUI({ eventBus: eventBus, document })
    ui.init()
  })

  afterEach(() => {
    dom.cleanup()
    fixture.destroy()
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