// Browser test for i18n button functionality
import { test, expect } from 'vitest'

test('I18n Button Translations', async () => {
  console.log('=== Testing I18n Button Translations ===')
  
  // Wait for the app to be fully loaded
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // Test saveProjectBtn
  const saveProjectBtn = document.getElementById('saveProjectBtn')
  expect(saveProjectBtn).toBeTruthy()
  
  console.log('Save Project Button:')
  console.log('- Title attribute:', saveProjectBtn.getAttribute('title'))
  console.log('- data-i18n-title:', saveProjectBtn.getAttribute('data-i18n-title'))
  console.log('- Button text:', saveProjectBtn.textContent.trim())
  console.log('- Inner HTML:', saveProjectBtn.innerHTML)
  
  // Check if title attribute is set (should be translated)
  const saveTitle = saveProjectBtn.getAttribute('title')
  expect(saveTitle).toBeTruthy()
  expect(saveTitle).not.toBe('backup_application_state') // Should be translated, not the key
  
  // Check if button text is translated
  const saveText = saveProjectBtn.textContent.trim()
  expect(saveText).toBeTruthy()
  expect(saveText).not.toBe('save') // Should be translated, not the key
  
  // Test importMenuBtn
  const importMenuBtn = document.getElementById('importMenuBtn')
  expect(importMenuBtn).toBeTruthy()

  console.log('Import Menu Button:')
  console.log('- Title attribute:', importMenuBtn.getAttribute('title'))
  console.log('- data-i18n-title:', importMenuBtn.getAttribute('data-i18n-title'))
  console.log('- Button text:', importMenuBtn.textContent.trim())
  console.log('- Inner HTML:', importMenuBtn.innerHTML)

  const importTitle = importMenuBtn.getAttribute('title')
  expect(importTitle).toBeTruthy()
  expect(importTitle).toBeTruthy()

  const importText = importMenuBtn.textContent.trim()
  expect(importText).toBeTruthy()
  
  // Test that translations are actually applied
  expect(saveTitle).toBe('Backup Application State')
  expect(saveText).toBe('Backup Application State')
  expect(importTitle).toBe('Import')
  expect(importText).toBe('Import')
  
  console.log('=== I18n Button Tests Completed ===')
}) 