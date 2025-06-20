import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import '../../src/js/data.js'
import '../../src/js/eventBus.js'
import STOUIManager from '../../src/js/ui.js'
import STOStorage from '../../src/js/storage.js'
import STOExportManager from '../../src/js/export.js'
import STOFileExplorer from '../../src/js/fileexplorer.js'

// Load real HTML
const htmlContent = readFileSync(resolve(__dirname, '../../src/index.html'), 'utf-8')

let stoFileExplorer
let stoUI
let stoStorage
let stoExport

describe('STOFileExplorer', () => {
  beforeEach(async () => {
    // Reset DOM
    document.documentElement.innerHTML = htmlContent

    // Ensure required containers exist (toastContainer & modalOverlay)
    if (!document.getElementById('toastContainer')) {
      const container = document.createElement('div')
      container.id = 'toastContainer'
      document.body.appendChild(container)
    }

    localStorage.clear()
    stoUI = new STOUIManager()
    stoStorage = new STOStorage()
    stoExport = new STOExportManager()
    Object.assign(global, { stoUI, stoStorage, stoExport })
    stoFileExplorer = new STOFileExplorer()
    global.stoFileExplorer = stoFileExplorer
    stoFileExplorer.init()
  })

  afterEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    vi.resetAllMocks()
  })

  it('should build tree with profile and build nodes', () => {
    stoFileExplorer.buildTree()

    // Check for default profiles that exist
    const profileNode = Array.from(document.querySelectorAll('.tree-node.profile')).find(n => n.textContent.startsWith('Default Space'))
    expect(profileNode).toBeTruthy()
    expect(profileNode.textContent.startsWith('Default Space')).toBe(true)

    // Child build nodes
    const spaceNode = Array.from(profileNode.querySelectorAll('.tree-node.build')).find(n => n.textContent.startsWith('Space'))
    const groundNode = Array.from(profileNode.querySelectorAll('.tree-node.build')).find(n => n.textContent.startsWith('Ground'))
    const aliasNode = profileNode.querySelector('.tree-node.aliases')

    expect(spaceNode).toBeTruthy()
    expect(groundNode).toBeTruthy()
    expect(aliasNode).toBeTruthy()
  })

  it('should generate keybind export preview for space build', () => {
    stoFileExplorer.openExplorer()

    // Click space build node - use default_space profile which already exists
    const spaceNode = Array.from(document.querySelectorAll('.tree-node.build')).find(n => 
      n.textContent.startsWith('Space') && n.getAttribute('data-profileid') === 'default_space'
    )
    expect(spaceNode).toBeTruthy()
    spaceNode.click()

    const preview = document.getElementById('fileContent')
    expect(preview.textContent).toContain('STO Keybind Configuration')
    expect(preview.textContent).toContain('Keys bound')
  })

  it('should generate alias export preview', () => {
    stoFileExplorer.openExplorer()

    // Use default_space profile which already exists
    const aliasNode = Array.from(document.querySelectorAll('.tree-node.aliases')).find(n => n.getAttribute('data-profileid') === 'default_space')
    expect(aliasNode).toBeTruthy()
    aliasNode.click()

    const preview = document.getElementById('fileContent')
    expect(preview.textContent).toContain('STO Alias Configuration')
    expect(preview.textContent).toContain('Alias Statistics')
  })

  it('should trigger clipboard copy when copy button clicked', async () => {
    stoFileExplorer.openExplorer()

    // Select alias node to populate preview - use default_space profile
    const aliasNode = Array.from(document.querySelectorAll('.tree-node.aliases')).find(n => n.getAttribute('data-profileid') === 'default_space')
    expect(aliasNode).toBeTruthy()
    aliasNode.click()

    const copySpy = vi.spyOn(stoUI, 'copyToClipboard').mockImplementation(() => {})

    document.getElementById('copyFileContentBtn').click()

    expect(copySpy).toHaveBeenCalled()
  })
}) 