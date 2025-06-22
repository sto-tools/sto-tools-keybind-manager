// Test for i18n in modals, specifically the about modal
import { test, expect } from 'vitest'
import { chromium } from 'playwright'

test.describe('Modal i18n Integration', () => {
  let browser
  let page

  test.beforeAll(async () => {
    browser = await chromium.launch()
  })

  test.afterAll(async () => {
    await browser.close()
  })

  test.beforeEach(async () => {
    page = await browser.newPage()
    await page.goto('http://localhost:3001')
    await page.waitForSelector('#app', { timeout: 10000 })
  })

  test.afterEach(async () => {
    await page.close()
  })

  test('should apply translations to about modal when shown', async () => {
    // Mock window.applyTranslations function
    window.applyTranslations = (root = document) => {
      root.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n')
        if (key) {
          el.textContent = `Translated: ${key}`
        }
      })
    }

    // Click the about button
    await page.click('[data-bs-target="#aboutModal"]')
    
    // Wait for modal to be visible
    await page.waitForSelector('#aboutModal', { state: 'visible' })
    
    // Check if translations were applied
    const title = await page.textContent('#aboutModal .modal-title')
    expect(title).toContain('Translated:')
  })

  test('should not fail if applyTranslations is not available', async () => {
    // Delete the applyTranslations function
    delete window.applyTranslations

    // Click the about button - should not throw an error
    await page.click('[data-bs-target="#aboutModal"]')
    
    // Wait for modal to be visible
    await page.waitForSelector('#aboutModal', { state: 'visible' })
    
    // Modal should still be shown even without translations
    const modal = await page.isVisible('#aboutModal')
    expect(modal).toBe(true)
  })

  test('should regenerate command modal content when language changes', async () => {
    // Open the add command modal
    await page.click('#addCommandBtn')
    await page.waitForSelector('#addCommandModal', { state: 'visible' })
    
    // Select tray command type to show the dropdown
    await page.selectOption('#commandType', 'tray')
    await page.waitForSelector('#trayCommandVariant', { state: 'visible' })
    
    // Get the initial option text (should be in English)
    const initialOptionText = await page.textContent('#trayCommandVariant option[value="STOTrayExecByTray"]')
    expect(initialOptionText).toContain('STOTrayExecByTray')
    
    // Change language to German
    await page.evaluate(() => {
      if (window.app && window.app.changeLanguage) {
        return window.app.changeLanguage('de')
      }
    })
    
    // Wait a moment for the language change to take effect
    await page.waitForTimeout(100)
    
    // Check if the option text has been updated to German
    const updatedOptionText = await page.textContent('#trayCommandVariant option[value="STOTrayExecByTray"]')
    expect(updatedOptionText).toContain('zeigt Tastenkombination in der UI')
  })
}) 