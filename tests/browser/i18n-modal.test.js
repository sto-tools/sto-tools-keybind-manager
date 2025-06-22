// Test for i18n in modals, specifically the about modal
import { test, expect, describe } from 'vitest'

describe('Modal i18n Integration', () => {
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
    const aboutButton = document.querySelector('[data-bs-target="#aboutModal"]')
    if (aboutButton) {
      aboutButton.click()
      
      // Wait for modal to be visible
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Check if translations were applied
      const modal = document.querySelector('#aboutModal')
      if (modal) {
        const title = modal.querySelector('.modal-title')
        expect(title?.textContent).toContain('Translated:')
      }
    }
  })

  test('should not fail if applyTranslations is not available', async () => {
    // Delete the applyTranslations function
    delete window.applyTranslations

    // Click the about button - should not throw an error
    const aboutButton = document.querySelector('[data-bs-target="#aboutModal"]')
    if (aboutButton) {
      aboutButton.click()
      
      // Wait for modal to be visible
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Modal should still be shown even without translations
      const modal = document.querySelector('#aboutModal')
      expect(modal).toBeTruthy()
    }
  })

  test('should regenerate command modal content when language changes', async () => {
    // Open the add command modal
    const addButton = document.querySelector('#addCommandBtn')
    if (addButton) {
      addButton.click()
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Select tray command type to show the dropdown
      const commandType = document.querySelector('#commandType')
      if (commandType) {
        commandType.value = 'tray'
        commandType.dispatchEvent(new Event('change'))
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Get the initial option text (should be in English)
        const trayVariant = document.querySelector('#trayCommandVariant')
        if (trayVariant) {
          const option = trayVariant.querySelector('option[value="STOTrayExecByTray"]')
          expect(option?.textContent).toContain('STOTrayExecByTray')
          
          // Change language to German
          if (window.app && window.app.changeLanguage) {
            window.app.changeLanguage('de')
            await new Promise(resolve => setTimeout(resolve, 100))
            
            // Check if the option text has been updated to German
            const updatedOption = trayVariant.querySelector('option[value="STOTrayExecByTray"]')
            expect(updatedOption?.textContent).toContain('zeigt Tastenkombination in der UI')
          }
        }
      }
    }
  })
}) 