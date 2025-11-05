// STO Command Parser Library - Entry point for external consumption
// Standalone library for parsing Star Trek Online keybind commands
export { STOCommandParser } from './STOCommandParser.js'
export { respond, request, handleCommand, command } from '../core/requestResponse.js'
export { default as eventBus } from '../core/eventBus.js'

// Command display and normalization utilities
export {
  enrichForDisplay,
  normalizeToString,
  normalizeToStringArray,
  normalizeToOptimizedString,
  isRichObject
} from './commandDisplayAdapter.js'

export {
  normalizeProfile,
  needsNormalization,
  getMigrationReport,
  batchNormalizeProfiles
} from './profileNormalizer.js'

// Default configuration for external use
export const defaultParserConfig = {
  enableCache: true,
  maxCacheSize: 1000,
  enablePerformanceMetrics: true,
  hotPathThreshold: 10
}

/**
 * Creates a standalone parser instance for external library usage
 * @param {Object} options - Configuration options
 * @returns {Promise<STOCommandParser>} Configured parser instance
 */
export async function createStandaloneParser(options = {}) {
  const { STOCommandParser } = await import('./STOCommandParser.js')
  return new STOCommandParser(null, { ...defaultParserConfig, ...options })
}

/**
 * Creates a parser with event bus integration
 * @param {Object} eventBus - Event bus instance
 * @param {Object} options - Configuration options
 * @returns {Promise<STOCommandParser>} Configured parser instance
 */
export async function createIntegratedParser(eventBus, options = {}) {
  const { STOCommandParser } = await import('./STOCommandParser.js')
  return new STOCommandParser(eventBus, { ...defaultParserConfig, ...options })
}

// Export core infrastructure for library consumers
export { default as ComponentBase } from '../components/ComponentBase.js'

// Version information
export const version = '1.0.0'
export const description = 'Standalone STO Command Parser Library with Function Signatures'

// Library metadata
export const metadata = {
  name: 'sto-command-parser',
  version: '1.0.0',
  description: 'Parse Star Trek Online keybind commands with function signature validation',
  features: [
    'Function signature-based parsing',
    'Performance-optimized for high-frequency commands',
    'Built-in caching with hot path optimization',
    'TypeScript-style parameter extraction',
    'Extensible command signature definitions',
    'Standalone or integrated usage'
  ],
  dependencies: {
    required: [],
    optional: ['eventBus for integration mode']
  }
} 