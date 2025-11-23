// KBFParser.js - KBF File Parsing Library
// Comprehensive parser for STO Keybind application .kbf archives
// Dependencies: Only core JavaScript APIs (Base64, TextDecoder)
//

import { KBFDecoder } from './kbf/parsers/KBFDecoder.js'
import eventBus from '../core/eventBus.js'


/**
 * KBF Parser for processing STO Keybind application .kbf archives
 * Supports KEYSET-based archives with 6-layer Base64 encoding and 123 activity types
 */
export class KBFParser {
  constructor(options = {}) {
    this.eventBus = options.eventBus || eventBus
    // Keep a single decoder instance so options (e.g., strictMode) are honored consistently.
    this.decoder = new KBFDecoder({ ...options, eventBus: this.eventBus })
  }

  
  /**
   * Main entry point for parsing KBF files
   * @param {string|ArrayBuffer} content - File content to parse
   * @param {Object} options - Parsing options
      * @param {string} options.targetEnvironment - Target environment ('space' or 'ground')
   * @param {boolean} options.includeMetadata - Include metadata in output
   * @returns {Object} Parse result with bindsets, errors, warnings, and statistics
   */
  parseFile(content, options = {}) {
    return this.decoder.parseFile(content, options)
  }
}

/**
 * Create a standalone KBF parser instance
 * @param {Object} options - Configuration options
 * @returns {KBFParser} Configured parser instance
 */
export function createKBFParser(options = {}) {
  return new KBFParser(options)
}

export default KBFParser
