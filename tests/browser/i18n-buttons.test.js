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
  expect(saveTitle).not.toBe('save_project_json') // Should be translated, not the key
  
  // Check if button text is translated
  const saveText = saveProjectBtn.textContent.trim()
  expect(saveText).toBeTruthy()
  expect(saveText).not.toBe('save') // Should be translated, not the key
  
  // Test aliasesBtn
  const aliasesBtn = document.getElementById('aliasesBtn')
  expect(aliasesBtn).toBeTruthy()
  
  console.log('Aliases Button:')
  console.log('- Title attribute:', aliasesBtn.getAttribute('title'))
  console.log('- data-i18n-title:', aliasesBtn.getAttribute('data-i18n-title'))
  console.log('- Button text:', aliasesBtn.textContent.trim())
  console.log('- Inner HTML:', aliasesBtn.innerHTML)
  
  // Check if title attribute is set (should be translated)
  const aliasTitle = aliasesBtn.getAttribute('title')
  expect(aliasTitle).toBeTruthy()
  expect(aliasTitle).not.toBe('alias_operations') // Should be translated, not the key
  
  // Check if button text is translated
  const aliasText = aliasesBtn.textContent.trim()
  expect(aliasText).toBeTruthy()
  expect(aliasText).not.toBe('aliases') // Should be translated, not the key
  
  // Test that translations are actually applied
  expect(saveTitle).toBe('Save Project JSON') // Expected English translation
  expect(saveText).toBe('Save') // Expected English translation
  expect(aliasTitle).toBe('Alias Operations') // Expected English translation
  expect(aliasText).toBe('Aliases') // Expected English translation
  
  console.log('=== I18n Button Tests Completed ===')
}) 