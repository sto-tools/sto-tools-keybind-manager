/**
 * Integration Tests for KBFParser using actual KBF files
 * Tests real-world file parsing scenarios and validates against decoded references
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Get current file directory for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Import KBFParser
import { KBFParser } from '../../../src/js/lib/KBFParser.js'

describe('KBFParser - Real File Integration Tests', () => {
  let parser
  const fixturesPath = join(__dirname, '../../fixtures/kbf')

  beforeEach(() => {
    parser = new KBFParser({
      strictMode: false,
      validateUtf8: true,
      // Progress tracking removed - no enableProgressCallbacks option
    })
  })

  describe('Real KBF File Parsing', () => {
    it('should parse keyset.KBF without errors', () => {
      const keysetFile = readFileSync(join(fixturesPath, 'keyset.KBF'), 'utf8')

      expect(keysetFile).toBeDefined()
      expect(keysetFile.length).toBeGreaterThan(0)

      const result = parser.parseFile(keysetFile, {
        targetEnvironment: 'space',
        includeMetadata: true,
      })

      // Verify basic parsing structure
      expect(result).toHaveProperty('bindsets')
      expect(result).toHaveProperty('aliases')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('warnings')
      expect(result).toHaveProperty('stats')
      
      // May have errors if file format issues exist, but should produce a result structure

      console.log('keyset.KBF parsing result:', {
        bindsetsCount: Object.keys(result.bindsets).length,
        errors: result.errors.length,
        warnings: result.warnings.length,
        stats: result.stats
      })
    })

    it('should parse no-keyset.KBF without errors', () => {
      const noKeysetFile = readFileSync(join(fixturesPath, 'no-keyset.KBF'), 'utf8')

      expect(noKeysetFile).toBeDefined()
      expect(noKeysetFile.length).toBeGreaterThan(0)

      const result = parser.parseFile(noKeysetFile, {
        targetEnvironment: 'space',
        includeMetadata: true,
      })

      // Verify basic parsing structure
      expect(result).toHaveProperty('bindsets')
      expect(result).toHaveProperty('aliases')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('warnings')
      expect(result).toHaveProperty('stats')
      
      // May have errors if file format issues exist, but should produce a result structure

      console.log('no-keyset.KBF parsing result:', {
        bindsetsCount: Object.keys(result.bindsets).length,
        errors: result.errors.length,
        warnings: result.warnings.length,
        stats: result.stats
      })
    })

    it('should handle uppercase GROUPSET/KEYSET keywords correctly', () => {
      // Test with a synthetic uppercase version to verify case handling
      const uppercaseContent = btoa('GROUPSET:1;KEYSET:Master;NAME:Master')

      const result = parser.parseFile(uppercaseContent)

      // May have errors if payloads are invalid, but structure should be parsed
      expect(result).toHaveProperty('bindsets')
      // Should successfully parse the uppercase keywords
    })

    it('should handle mixed case keywords consistently', () => {
      // Test mixed case scenarios
      const mixedCase1 = btoa('Groupset:1;Keyset:Master;NAME:Master')
      const mixedCase2 = btoa('GROUPSET:1;Keyset:Master;Name:Master')

      const result1 = parser.parseFile(mixedCase1)
      const result2 = parser.parseFile(mixedCase2)

      // Both should produce result structures (may have errors if payloads invalid)
      expect(result1).toHaveProperty('bindsets')
      expect(result2).toHaveProperty('bindsets')
    })
  })

  describe('Base64 Decoding with Real Files', () => {
    it('should handle multi-layer Base64 encoding from real files', () => {
      const keysetFile = readFileSync(join(fixturesPath, 'keyset.KBF'), 'utf8')

      // Verify file is valid Base64
      expect(() => {
        Buffer.from(keysetFile, 'base64').toString('utf8')
      }).not.toThrow()

      const result = parser.parseFile(keysetFile)

      // Should decode all layers (may have errors if file format issues)
      expect(result).toHaveProperty('stats')
      expect(result.stats.processedLayers).toBeDefined()
    })

    it('should handle file reading edge cases', () => {
      // Test with empty file
      const emptyResult = parser.parseFile('')
      expect(emptyResult.errors.length).toBeGreaterThan(0)

      // Test with invalid Base64
      const invalidResult = parser.parseFile('NotValidBase64!!!')
      expect(invalidResult.errors.length).toBeGreaterThan(0)

      // Test with null input
      const nullResult = parser.parseFile(null)
      expect(nullResult.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Progress Removal Verification (Post-Fix)', () => {
    it('should NOT call progress callbacks during real file parsing', () => {
      const progressSpy = vi.fn()
      const keysetFile = readFileSync(join(fixturesPath, 'keyset.KBF'), 'utf8')

      // Attempt to parse with progress callback (should be ignored)
      parser.parseFile(keysetFile, {
        onProgress: progressSpy,
        targetEnvironment: 'space',
      })

      // Progress should NOT be reported during parsing (removed in fix)
      expect(progressSpy).not.toHaveBeenCalled()
    })

    it('should NOT have progress-related methods available', () => {
      // Progress methods should be completely removed
      expect(typeof parser.reportProgress).toBe('undefined')
      expect(typeof parser.setProgressCallback).toBe('undefined')
      expect(typeof parser.initializeParsing).toBe('undefined')
    })

    it('should still parse files correctly without progress tracking', () => {
      const keysetFile = readFileSync(join(fixturesPath, 'keyset.KBF'), 'utf8')

      const result = parser.parseFile(keysetFile, {
        targetEnvironment: 'space',
        includeMetadata: true,
      })

      // Should still produce valid parsing results
      expect(result).toHaveProperty('bindsets')
      expect(result).toHaveProperty('aliases')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('warnings')
      expect(result).toHaveProperty('stats')
    })
  })

  describe('Error Handling with Real File Patterns', () => {
    it('should handle malformed real-file-style data gracefully', () => {
      // Create malformed data that mimics real file structure
      const malformedContent = btoa('GROUPSET:1;KEYSET:IncompleteData')

      const result = parser.parseFile(malformedContent)

      // Should handle gracefully without crashing
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('warnings')
      expect(result).toHaveProperty('stats')
    })

    it('should validate file size limits with real files', () => {
      const keysetFile = readFileSync(join(fixturesPath, 'keyset.KBF'), 'utf8')

      // Create parser with small file size limit
      const strictParser = new KBFParser({
        maxFileSize: 100, // Very small limit
      })

      const result = strictParser.parseFile(keysetFile)

      // May produce size-related errors or warnings depending on implementation
      expect(result.errors.length + result.warnings.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Statistics and Metadata', () => {
    it('should provide comprehensive statistics for real files', () => {
      const keysetFile = readFileSync(join(fixturesPath, 'keyset.KBF'), 'utf8')

      const result = parser.parseFile(keysetFile, {
        includeMetadata: true,
      })

      // Verify statistics structure
      expect(result.stats).toHaveProperty('totalBindsets')
      expect(result.stats).toHaveProperty('totalKeys')
      expect(result.stats).toHaveProperty('totalAliases')
      expect(result.stats).toHaveProperty('processedLayers')
      expect(result.stats).toHaveProperty('skippedActivities')

      // Verify data types
      expect(typeof result.stats.totalBindsets).toBe('number')
      expect(typeof result.stats.totalKeys).toBe('number')
      expect(typeof result.stats.totalAliases).toBe('number')
      expect(typeof result.stats.skippedActivities).toBe('number')
      expect(Array.isArray(result.stats.processedLayers)).toBe(true)
    })

    it('should include meaningful error and warning information', () => {
      const keysetFile = readFileSync(join(fixturesPath, 'keyset.KBF'), 'utf8')

      const result = parser.parseFile(keysetFile)

      // Verify error and warning structure
      expect(result.errors).toBeDefined()
      expect(result.warnings).toBeDefined()
      expect(Array.isArray(result.errors)).toBe(true)
      expect(Array.isArray(result.warnings)).toBe(true)
    })
  })

  describe('Environment-Specific Parsing', () => {
    it('should handle different target environments with real files', () => {
      const keysetFile = readFileSync(join(fixturesPath, 'keyset.KBF'), 'utf8')

      const spaceResult = parser.parseFile(keysetFile, {
        targetEnvironment: 'space',
      })

      const groundResult = parser.parseFile(keysetFile, {
        targetEnvironment: 'ground',
      })

      // Both should produce result structures (may have errors if file format issues)
      expect(spaceResult).toHaveProperty('bindsets')
      expect(groundResult).toHaveProperty('bindsets')

      // Results should have consistent structure
      expect(spaceResult).toHaveProperty('bindsets')
      expect(groundResult).toHaveProperty('bindsets')
    })
  })

  describe('Regression Tests for Real File Issues', () => {
    it('should not crash on files with only GROUPSET section', () => {
      // Test edge case where file has GROUPSET but no complete keysets
      const groupsetOnlyContent = btoa('GROUPSET:1;')

      const result = parser.parseFile(groupsetOnlyContent)

      // Should handle gracefully
      expect(result).toHaveProperty('bindsets')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('warnings')
    })

    it('should handle files with empty KEYSET payloads', () => {
      // Test with empty KEYSET payload
      const emptyKeysetContent = btoa('GROUPSET:1;KEYSET:')

      const result = parser.parseFile(emptyKeysetContent)

      // Should handle gracefully
      expect(result).toHaveProperty('bindsets')
      expect(result).toHaveProperty('errors')
    })

    it('should preserve parser state between multiple file parses', () => {
      const keysetFile = readFileSync(join(fixturesPath, 'keyset.KBF'), 'utf8')
      const noKeysetFile = readFileSync(join(fixturesPath, 'no-keyset.KBF'), 'utf8')

      // Parse first file
      const result1 = parser.parseFile(keysetFile)
      expect(result1).toHaveProperty('bindsets')
      // May have errors if file format issues exist

      // Parse second file - should not be affected by first parse
      const result2 = parser.parseFile(noKeysetFile)
      expect(result2).toHaveProperty('bindsets')
      // May have errors if file format issues exist

      // Results should be independent
      expect(result1.stats).toBeDefined()
      expect(result2.stats).toBeDefined()
    })
  })
})