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
      const dropdown = settingsBtn.closest('.dropdown')
      const beforeClass = dropdown.classList.contains('active')
      settingsBtn.click()
      const afterClass = dropdown.classList.contains('active')
      console.log(`Settings: active=${beforeClass} -> active=${afterClass} (Changed: ${beforeClass !== afterClass})`)
    }

    if (backupBtn && backupMenu) {
      const dropdown = backupBtn.closest('.dropdown')
      const beforeClass = dropdown.classList.contains('active')
      backupBtn.click()
      const afterClass = dropdown.classList.contains('active')
      console.log(`Backup: active=${beforeClass} -> active=${afterClass} (Changed: ${beforeClass !== afterClass})`)
    }

    if (importBtn && importMenu) {
      const dropdown = importBtn.closest('.dropdown')
      const beforeClass = dropdown.classList.contains('active')
      importBtn.click()
      const afterClass = dropdown.classList.contains('active')
      console.log(`Import: active=${beforeClass} -> active=${afterClass} (Changed: ${beforeClass !== afterClass})`)
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