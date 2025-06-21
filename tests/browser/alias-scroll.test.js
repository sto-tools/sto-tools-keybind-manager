import { describe, it, expect, beforeEach } from 'vitest'

// Regression test for issue: Alias list view should be scrollable when many aliases are present

describe('Alias list scrolling', () => {
  beforeEach(async () => {
    // Ensure a clean state and wait for app to load (handled by global setup)
    localStorage.clear()
    await new Promise((resolve) => setTimeout(resolve, 500))
  })

  it('should allow vertical scrolling in alias list view', async () => {
    // Ensure there is an active profile; create one if needed
    if (!window.app.currentProfile) {
      window.app.createProfile('TestProfile')
      // createProfile automatically switches to the new profile
    }

    // Switch to Alias mode via mode toggle button
    const aliasModeBtn = document.querySelector('button[data-mode="alias"]')
    expect(aliasModeBtn).toBeTruthy()
    aliasModeBtn.click()

    // Populate the profile with many aliases to require scrolling
    const aliasCount = 40
    for (let i = 0; i < aliasCount; i++) {
      window.app.createAliasChain(`Alias${i}`)
    }

    // Re-render the alias grid to reflect added aliases (createAliasChain may handle this, but ensure)
    window.app.renderAliasGrid()

    // Locate the scroll container for aliases
    const scrollContainer = await testUtils.waitForElement('.alias-grid')

    // Record initial scroll position (should be 0)
    const initialTop = scrollContainer.scrollTop

    // Programmatically scroll to bottom
    scrollContainer.scrollTop = scrollContainer.scrollHeight

    // Give the browser a moment to process the scroll
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Verify that scrolling occurred
    expect(scrollContainer.scrollTop).toBeGreaterThan(initialTop)
  })

  it('should keep alias action buttons visible in header toolbar during scroll', async () => {
    // Ensure there is an active profile; create one if needed
    if (!window.app.currentProfile) {
      window.app.createProfile('TestProfile')
      // createProfile automatically switches to the new profile
    }

    // Switch to Alias mode via mode toggle button
    const aliasModeBtn = document.querySelector('button[data-mode="alias"]')
    expect(aliasModeBtn).toBeTruthy()
    aliasModeBtn.click()

    // Generate many aliases to force scrolling
    for (let i = 1; i <= 50; i++) {
      window.app.createAliasChain(`TestAlias${i}`, [`command${i}_1`, `command${i}_2`])
    }

    // Wait for UI to update
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Locate the scroll container and header toolbar buttons
    const scrollContainer = await testUtils.waitForElement('.alias-grid')
    const headerToolbar = await testUtils.waitForElement('.alias-selector-header .header-toolbar')
    const addButton = document.getElementById('addAliasChainBtn')
    const deleteButton = document.getElementById('deleteAliasChainBtn')
    
    expect(scrollContainer).toBeTruthy()
    expect(headerToolbar).toBeTruthy()
    expect(addButton).toBeTruthy()
    expect(deleteButton).toBeTruthy()

    // Reset scroll position to top for consistent test
    scrollContainer.scrollTop = 0
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Get initial toolbar and button positions
    const containerRect = document.querySelector('.alias-selector-container').getBoundingClientRect()
    const toolbarRect = headerToolbar.getBoundingClientRect()
    const addButtonRect = addButton.getBoundingClientRect()
    
    // Toolbar should be visible within the container header
    expect(toolbarRect.top).toBeGreaterThanOrEqual(containerRect.top)
    expect(addButtonRect.top).toBeGreaterThanOrEqual(containerRect.top)
    
    // Scroll the alias grid down from the top
    const initialScrollTop = scrollContainer.scrollTop // Should be 0
    scrollContainer.scrollTop = scrollContainer.scrollHeight / 2
    
    // Wait for scroll to complete
    await new Promise((resolve) => setTimeout(resolve, 100))
    
    // Verify scrolling occurred (from 0 to middle)
    expect(scrollContainer.scrollTop).toBeGreaterThan(initialScrollTop)
    
    // Check that toolbar buttons are still visible after scrolling (they're in the fixed header)
    const toolbarRectAfterScroll = headerToolbar.getBoundingClientRect()
    const addButtonRectAfterScroll = addButton.getBoundingClientRect()
    
    // Verify toolbar and buttons are still visible and haven't moved (they're in the fixed header)
    expect(toolbarRectAfterScroll.top).toBeGreaterThanOrEqual(containerRect.top)
    expect(addButtonRectAfterScroll.top).toBeGreaterThanOrEqual(containerRect.top)
    
    // Most importantly: toolbar buttons should not have moved (they're in the fixed header)
    expect(Math.abs(toolbarRectAfterScroll.top - toolbarRect.top)).toBeLessThan(5) // Should be same position
    expect(Math.abs(addButtonRectAfterScroll.top - addButtonRect.top)).toBeLessThan(5) // Should be same position
  })
}) 