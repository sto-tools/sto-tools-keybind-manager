// Sample browser test demonstrating fixture usage
import { describe, it, expect } from 'vitest'

describe.skip('Basic UI Interactions', () => {
  it('should load the application', async () => {
    // Wait for app to be ready (handled by browser-setup.js)
    expect(document.body).toBeDefined()
    expect(document.title).toContain('STO')
  })

  it('should have main navigation elements', () => {
    const profileSelect = document.getElementById('profileSelect')
    const settingsBtn = document.getElementById('settingsBtn')
    
    expect(profileSelect).toBeTruthy()
    expect(settingsBtn).toBeTruthy()
  })

  it('should open settings menu on click', async () => {
    const settingsBtn = document.getElementById('settingsBtn')
    const settingsMenu = document.getElementById('settingsMenu')
    
    // Initial state
    expect(settingsMenu.style.display).toBe('none')
    
    // Click settings button
    settingsBtn.click()
    
    // Menu should be visible
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(settingsMenu.style.display).not.toBe('none')
  })

  it('should handle keyboard navigation', async () => {
    // Focus on profile select
    const profileSelect = document.getElementById('profileSelect')
    profileSelect.focus()
    
    expect(document.activeElement).toBe(profileSelect)
    
    // Test tab navigation
    const event = new KeyboardEvent('keydown', { key: 'Tab' })
    document.dispatchEvent(event)
    
    // Should move focus to next element
    expect(document.activeElement).not.toBe(profileSelect)
  })
}) 