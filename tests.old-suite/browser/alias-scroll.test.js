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

    // Wait for the alias view to be shown and ensure the container is visible
    await new Promise((resolve) => setTimeout(resolve, 100))
    
    // Ensure the alias selector container is visible
    const aliasContainer = document.getElementById('aliasSelectorContainer')
    if (aliasContainer) {
      aliasContainer.style.display = 'block'
    }

    // Populate the profile with many aliases to require scrolling
    const aliasCount = 100 // Increased count to ensure scrolling
    for (let i = 0; i < aliasCount; i++) {
      window.app.createAliasChain(`Alias${i}`, `command${i}_1 command${i}_2 command${i}_3`)
    }

    // Wait for aliases to be created
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Check if aliases were created in the profile
    console.log('Profile aliases after creation:', window.app.currentProfile?.aliases)
    console.log('Alias count:', Object.keys(window.app.currentProfile?.aliases || {}).length)

    // Re-render the alias grid to reflect added aliases (createAliasChain may handle this, but ensure)
    if (window.app.renderAliasGrid) {
      window.app.renderAliasGrid()
    }

    // Wait for the alias grid to be populated
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Locate the scroll container for aliases - use the correct selector
    const scrollContainer = await testUtils.waitForElement('#aliasGrid')

    // Debug: Check what's in the grid
    console.log('Grid children count:', scrollContainer.children.length)
    console.log('Grid innerHTML length:', scrollContainer.innerHTML.length)

    // Ensure the grid has content and is scrollable
    expect(scrollContainer.children.length).toBeGreaterThan(0)
    expect(scrollContainer.scrollHeight).toBeGreaterThan(scrollContainer.clientHeight)

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

    // Wait for the alias view to be shown and ensure the container is visible
    await new Promise((resolve) => setTimeout(resolve, 100))
    
    // Ensure the alias selector container is visible
    const aliasContainer = document.getElementById('aliasSelectorContainer')
    if (aliasContainer) {
      aliasContainer.style.display = 'block'
    }

    // Generate many aliases to force scrolling
    for (let i = 1; i <= 100; i++) {
      window.app.createAliasChain(`TestAlias${i}`, `command${i}_1 command${i}_2 command${i}_3 command${i}_4 command${i}_5`)
    }

    // Wait for UI to update
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Locate the scroll container and header toolbar buttons - use correct selectors
    const scrollContainer = await testUtils.waitForElement('#aliasGrid')
    const headerToolbar = await testUtils.waitForElement('.alias-selector-header .header-toolbar')
    const addButton = document.getElementById('addAliasChainBtn')
    const deleteButton = document.getElementById('deleteAliasChainBtn')
    
    expect(scrollContainer).toBeTruthy()
    expect(headerToolbar).toBeTruthy()
    expect(addButton).toBeTruthy()
    expect(deleteButton).toBeTruthy()

    // Ensure the grid has content and is scrollable
    expect(scrollContainer.children.length).toBeGreaterThan(0)
    expect(scrollContainer.scrollHeight).toBeGreaterThan(scrollContainer.clientHeight)

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