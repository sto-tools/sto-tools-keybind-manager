/**
 * DevConfig - Development mode configuration
 * Simple way to enable/disable development features
 */

export const DevConfig = {
  // Enable dev mode based on environment
  enabled: (
    typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.protocol === 'file:' ||
      window.location.search.includes('dev=true') ||
      localStorage.getItem('dev-mode') === 'true' ||
      process.env.NODE_ENV === 'development'
    )
  ),
  
  // Features to enable in dev mode
  features: {
    monitoring: true,        // Enable DevMonitor
    verboseLogging: true,    // Enable verbose console logging
    debugUI: true,          // Enable debug UI elements
    hotReload: true         // Enable hot reload features
  },
  
  // Quick enable/disable dev mode
  enable() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dev-mode', 'true')
      console.log('🔧 Dev mode enabled - refresh page to apply')
    }
  },
  
  disable() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('dev-mode')
      console.log('🔧 Dev mode disabled - refresh page to apply')
    }
  },
  
  // Toggle specific features
  toggleFeature(feature) {
    if (this.features.hasOwnProperty(feature)) {
      this.features[feature] = !this.features[feature]
      console.log(`🔧 Dev feature '${feature}' ${this.features[feature] ? 'enabled' : 'disabled'}`)
    }
  }
}

// Make available globally in development
if (DevConfig.enabled && typeof window !== 'undefined') {
  window.devConfig = DevConfig
}

export default DevConfig