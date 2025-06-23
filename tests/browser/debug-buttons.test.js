import { describe, it, expect } from 'vitest'

describe('Button Debug Test', () => {
  it('should debug button functionality', async () => {
    // Wait for app to be ready
    await new Promise((resolve) => {
      const checkReady = () => {
        if (window.app) {
          resolve()
        } else {
          setTimeout(checkReady, 10)
        }
      }
      checkReady()
    })

    console.log('=== Button Debug Test ===')

    // Check if buttons exist
    const buttons = [
      'settingsBtn',
      'importMenuBtn',
      'backupMenuBtn', 
      'languageMenuBtn'
    ]

    buttons.forEach(id => {
      const btn = document.getElementById(id)
      console.log(`${id}: ${btn ? 'EXISTS' : 'MISSING'}`)
    })

    // Check if menus exist
    const menus = [
      'settingsMenu',
      'importMenu',
      'backupMenu',
      'languageMenu'
    ]

    menus.forEach(id => {
      const menu = document.getElementById(id)
      console.log(`${id}: ${menu ? 'EXISTS' : 'MISSING'}`)
      if (menu) {
        console.log(`  - initial display: ${menu.style.display}`)
      }
    })

    // Test clicking each button
    const settingsBtn = document.getElementById('settingsBtn')
    const settingsMenu = document.getElementById('settingsMenu')
    const backupBtn = document.getElementById('backupMenuBtn')
    const backupMenu = document.getElementById('backupMenu')
    const importBtn = document.getElementById('importMenuBtn')
    const importMenu = document.getElementById('importMenu')

    console.log('\n=== Click Test Results ===')
    
    if (settingsBtn && settingsMenu) {
      const before = settingsMenu.style.display
      settingsBtn.click()
      const after = settingsMenu.style.display
      console.log(`Settings: ${before} -> ${after} (Changed: ${before !== after})`)
    }

    if (backupBtn && backupMenu) {
      const before = backupMenu.style.display
      backupBtn.click()
      const after = backupMenu.style.display
      console.log(`Backup: ${before} -> ${after} (Changed: ${before !== after})`)
    }

    if (importBtn && importMenu) {
      const before = importMenu.style.display
      importBtn.click()
      const after = importMenu.style.display
      console.log(`Import: ${before} -> ${after} (Changed: ${before !== after})`)
    }

    // Check if app has the required methods
    if (window.app) {
      console.log('\n=== App Methods ===')
      const methods = ['toggleSettingsMenu', 'toggleImportMenu', 'toggleBackupMenu', 'toggleLanguageMenu']
      methods.forEach(method => {
        console.log(`${method}: ${typeof window.app[method]}`)
      })
    }

    // This test should always pass - we're just debugging
    expect(true).toBe(true)
  })
}) 