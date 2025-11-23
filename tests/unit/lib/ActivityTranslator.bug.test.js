/**
 * Test demonstrating activities 99 and 105 Text parameter usage issues
 * This test shows that activity 99 works correctly but activity 105 has a bug
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ActivityTranslator } from '../../../src/js/lib/kbf/translation/ActivityTranslator.js'

describe('Activities 99 and 105 Text Parameter Issues', () => {
  let translator

  beforeEach(() => {
    translator = new ActivityTranslator()
  })

  describe('Activity 99 (LoadBindFile) - Works correctly', () => {
    it('should use text parameter properly for mybinds.txt', () => {
      const activityData = { text: 'mybinds.txt' }
      const context = { environment: 'space' }
      const result = translator.generateActivityCommand(99, activityData, context)

      expect(result.type).toBe('text_command')
      expect(result.commands).toEqual(['bind_load_file mybinds.txt'])
      expect(result.aliases).toEqual({})
    })

    it('should handle empty filename', () => {
      const activityData = { text: '' }
      const context = { environment: 'space' }
      const result = translator.generateActivityCommand(99, activityData, context)

      expect(result.commands).toEqual(['bind_load_file'])
    })
  })

  describe('Activity 105 (SaveBindFile) - Fixed Text parameter bug', () => {
    it('should now use text parameter correctly after fix', () => {
      const activityData = { text: 'mybinds.txt' }
      const context = { environment: 'space' }
      const result = translator.generateActivityCommand(105, activityData, context)

      expect(result.type).toBe('text_command')
      expect(result.commands).toEqual(['bind_save_file mybinds.txt'])
      expect(result.aliases).toEqual({})
    })

    it('should handle filename validation correctly', () => {
      const activityData = { text: 'mybinds.txt' }
      const context = { environment: 'space' }

      const result = translator.generateActivityCommand(105, activityData, context)

      // Should now generate the correct command
      expect(result.commands).toEqual(['bind_save_file mybinds.txt'])
    })

    it('should reject files without .txt extension', () => {
      const activityData = { text: 'config.json' }
      const context = { environment: 'space' }
      const result = translator.generateActivityCommand(105, activityData, context)

      expect(result.commands).toEqual([])
    })

    it('should reject empty file names', () => {
      const activityData = { text: '' }
      const context = { environment: 'space' }
      const result = translator.generateActivityCommand(105, activityData, context)

      expect(result.commands).toEqual([])
    })

    it('should replace spaces with underscores', () => {
      const activityData = { text: 'custom keybinds.txt' }
      const context = { environment: 'space' }
      const result = translator.generateActivityCommand(105, activityData, context)

      expect(result.commands).toEqual(['bind_save_file custom_keybinds.txt'])
    })
  })

  describe('Test with actual KBF fixture data', () => {
    it('should process K key binding with Activity 99 correctly', () => {
      // From mystokeybinds.KBF: Key K has Activity:99;Text:mybinds.txt;
      const activityData = { text: 'mybinds.txt' }
      const context = { environment: 'space', baseKeyName: 'K', index: 0 }
      const result = translator.generateActivityCommand(99, activityData, context)

      expect(result.commands).toEqual(['bind_load_file mybinds.txt'])
    })

    it('should process L key binding with Activity 105 correctly after fix', () => {
      // From mystokeybinds.KBF: Key L has Activity:105;Text:mybinds.txt;
      const activityData = { text: 'mybinds.txt' }
      const context = { environment: 'space', baseKeyName: 'L', index: 0 }
      const result = translator.generateActivityCommand(105, activityData, context)

      // Should now generate bind_save_file command correctly
      expect(result.commands).toEqual(['bind_save_file mybinds.txt'])
    })
  })
})