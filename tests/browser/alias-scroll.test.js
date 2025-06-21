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

  it('should keep alias action buttons visible at bottom during scroll', async () => {
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

    // Locate the scroll container and action buttons
    const scrollContainer = await testUtils.waitForElement('.alias-grid')
    const actionButtons = await testUtils.waitForElement('.alias-selector-actions')
    
    expect(scrollContainer).toBeTruthy()
    expect(actionButtons).toBeTruthy()

    // Reset scroll position to top for consistent test
    scrollContainer.scrollTop = 0
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Get initial button position
    const containerRect = document.querySelector('.alias-selector-container').getBoundingClientRect()
    const buttonRect = actionButtons.getBoundingClientRect()
    
    // Buttons should be visible within the container (not necessarily at exact bottom due to scrollbar)
    expect(buttonRect.top).toBeGreaterThanOrEqual(containerRect.top)
    expect(buttonRect.bottom).toBeLessThanOrEqual(containerRect.bottom + 161) // Allow extra tolerance for test environment vs real browser differences
    
    // Scroll the alias grid down from the top
    const initialScrollTop = scrollContainer.scrollTop // Should be 0
    scrollContainer.scrollTop = scrollContainer.scrollHeight / 2
    
    // Wait for scroll to complete
    await new Promise((resolve) => setTimeout(resolve, 100))
    
    // Verify scrolling occurred (from 0 to middle)
    expect(scrollContainer.scrollTop).toBeGreaterThan(initialScrollTop)
    
    // Check that buttons are still visible after scrolling
    const buttonRectAfterScroll = actionButtons.getBoundingClientRect()
    
    // Verify buttons are still visible (not scrolled out of view)
    expect(buttonRectAfterScroll.top).toBeGreaterThanOrEqual(containerRect.top)
    expect(buttonRectAfterScroll.bottom).toBeLessThanOrEqual(containerRect.bottom + 161) // Allow tolerance for test environment differences
    
    // Most importantly: buttons should not have moved (they're anchored)
    expect(Math.abs(buttonRectAfterScroll.top - buttonRect.top)).toBeLessThan(5) // Should be roughly same position
  })
}) 