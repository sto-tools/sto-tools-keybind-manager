/**
 * DevMonitor - Development-only monitoring for i18n and CSS usage
 * 
 * Usage:
 * - window.devMonitor.enableI18nTracking()
 * - window.devMonitor.enableCSSTracking()
 * - window.devMonitor.getI18nStats()
 * - window.devMonitor.getCSSStats()
 * - window.devMonitor.disableAll()
 */

class DevMonitor {
  constructor() {
    this.isEnabled = false
    this.i18nTracking = false
    this.cssTracking = false
    
    // I18n tracking data
    this.i18nStats = {
      usedKeys: new Set(),
      missingKeys: new Set(),
      keyUsageCount: new Map(),
      lastUsed: new Map()
    }
    
    // CSS tracking data
    this.cssStats = {
      usedSelectors: new Set(),
      unusedSelectors: new Set(),
      selectorUsageCount: new Map(),
      lastChecked: null
    }
    
    // Original functions to restore
    this.originalI18nT = null
    this.originalI18nExists = null
    this.cssCheckInterval = null
    
    // Safety check - only enable in development
    this.isDevelopment = this.checkDevelopmentMode()
  }
  
  checkDevelopmentMode() {
    // Multiple checks to ensure we're in development
    return (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.protocol === 'file:' ||
      window.location.search.includes('dev=true') ||
      localStorage.getItem('dev-mode') === 'true'
    )
  }
  
  /**
   * Enable i18n usage tracking
   */
  enableI18nTracking() {
    if (!this.isDevelopment) {
      console.warn('DevMonitor: I18n tracking only available in development mode')
      return false
    }
    
    if (this.i18nTracking) {
      console.log('DevMonitor: I18n tracking already enabled')
      return true
    }
    
    if (!window.i18next) {
      console.error('DevMonitor: i18next not found')
      return false
    }
    
    console.log('DevMonitor: Enabling i18n tracking...')
    
    // Store original functions
    this.originalI18nT = window.i18next.t.bind(window.i18next)
    this.originalI18nExists = window.i18next.exists.bind(window.i18next)
    
    // Monkey patch i18next.t
    window.i18next.t = (key, options) => {
      this.trackI18nUsage(key, options)
      return this.originalI18nT(key, options)
    }
    
    // Also patch the global applyTranslations function if it exists
    if (window.applyTranslations) {
      const originalApplyTranslations = window.applyTranslations
      window.applyTranslations = (root) => {
        const elements = (root || document).querySelectorAll('[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-alt]')
        elements.forEach(el => {
          const key = el.getAttribute('data-i18n') || 
                     el.getAttribute('data-i18n-placeholder') || 
                     el.getAttribute('data-i18n-title') || 
                     el.getAttribute('data-i18n-alt')
          if (key) {
            this.trackI18nUsage(key)
          }
        })
        return originalApplyTranslations(root)
      }
    }
    
    this.i18nTracking = true
    this.isEnabled = true
    console.log('DevMonitor: I18n tracking enabled')
    return true
  }
  
  /**
   * Track i18n key usage
   */
  trackI18nUsage(key, options = {}) {
    const normalizedKey = typeof key === 'string' ? key : String(key)
    const now = Date.now()
    
    // Track usage
    this.i18nStats.usedKeys.add(normalizedKey)
    this.i18nStats.keyUsageCount.set(normalizedKey, (this.i18nStats.keyUsageCount.get(normalizedKey) || 0) + 1)
    this.i18nStats.lastUsed.set(normalizedKey, now)
    
    // Check if key exists in current language
    if (this.originalI18nExists && !this.originalI18nExists(normalizedKey)) {
      this.i18nStats.missingKeys.add(normalizedKey)
    }
  }
  
  /**
   * Enable CSS usage tracking
   */
  enableCSSTracking() {
    if (!this.isDevelopment) {
      console.warn('DevMonitor: CSS tracking only available in development mode')
      return false
    }
    
    if (this.cssTracking) {
      console.log('DevMonitor: CSS tracking already enabled')
      return true
    }
    
    console.log('DevMonitor: Enabling CSS tracking...')
    
    // Start periodic CSS checking
    this.cssCheckInterval = setInterval(() => {
      this.checkCSSUsage()
    }, 2000)
    
    this.cssTracking = true
    this.isEnabled = true
    console.log('DevMonitor: CSS tracking enabled (checking every 2 seconds)')
    return true
  }
  
  /**
   * Check which CSS selectors are currently in use
   */
  checkCSSUsage() {
    const now = Date.now()
    
    // Get all stylesheets
    const sheets = Array.from(document.styleSheets)
    
    console.log(`[DevMonitor] Checking ${sheets.length} stylesheets...`)
    
    sheets.forEach((sheet, sheetIndex) => {
      try {
        console.log(`[DevMonitor] Sheet ${sheetIndex}:`, {
          href: sheet.href,
          origin: window.location.origin,
          canAccess: !!sheet.cssRules || !!sheet.rules
        })
        
        // Allow local stylesheets and same-origin stylesheets
        if (sheet.href && !sheet.href.includes(window.location.origin) && !sheet.href.startsWith('file://')) {
          console.log(`[DevMonitor] Skipping external stylesheet: ${sheet.href}`)
          return
        }
        
        const rules = Array.from(sheet.cssRules || sheet.rules || [])
        console.log(`[DevMonitor] Found ${rules.length} rules in sheet ${sheetIndex}`)
        
        rules.forEach((rule, ruleIndex) => {
          if (rule.type === CSSRule.STYLE_RULE) {
            const selector = rule.selectorText
            if (!selector) return
            
            // Check if selector matches any current elements
            try {
              const elements = document.querySelectorAll(selector)
              if (elements.length > 0) {
                this.cssStats.usedSelectors.add(selector)
                this.cssStats.selectorUsageCount.set(selector, (this.cssStats.selectorUsageCount.get(selector) || 0) + 1)
                
                // Remove from unused if it was there
                this.cssStats.unusedSelectors.delete(selector)
              } else {
                // Only mark as unused if we haven't seen it used before
                if (!this.cssStats.usedSelectors.has(selector)) {
                  this.cssStats.unusedSelectors.add(selector)
                }
              }
            } catch (e) {
              console.warn(`[DevMonitor] Invalid selector "${selector}":`, e.message)
            }
          }
        })
      } catch (e) {
        console.warn(`[DevMonitor] Can't access stylesheet ${sheetIndex}:`, e.message)
      }
    })
    
    this.cssStats.lastChecked = now
    console.log(`[DevMonitor] CSS check complete:`, {
      usedSelectors: this.cssStats.usedSelectors.size,
      unusedSelectors: this.cssStats.unusedSelectors.size
    })
  }
  
  /**
   * Get i18n usage statistics
   */
  getI18nStats() {
    if (!this.i18nTracking) {
      console.warn('DevMonitor: I18n tracking not enabled')
      return null
    }
    
    const stats = {
      summary: {
        totalKeysUsed: this.i18nStats.usedKeys.size,
        totalKeysMissing: this.i18nStats.missingKeys.size,
        totalUsages: Array.from(this.i18nStats.keyUsageCount.values()).reduce((a, b) => a + b, 0)
      },
      usedKeys: Array.from(this.i18nStats.usedKeys).sort(),
      missingKeys: Array.from(this.i18nStats.missingKeys).sort(),
      keyUsageCount: Object.fromEntries(
        Array.from(this.i18nStats.keyUsageCount.entries()).sort((a, b) => b[1] - a[1])
      ),
      mostUsedKeys: Array.from(this.i18nStats.keyUsageCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, count]) => ({ key, count })),
      recentlyUsed: Array.from(this.i18nStats.lastUsed.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, timestamp]) => ({ key, lastUsed: new Date(timestamp).toISOString() }))
    }
    
    return stats
  }
  
  /**
   * Get CSS usage statistics
   */
  getCSSStats() {
    if (!this.cssTracking) {
      console.warn('DevMonitor: CSS tracking not enabled')
      return null
    }
    
    const stats = {
      summary: {
        totalSelectorsUsed: this.cssStats.usedSelectors.size,
        totalSelectorsUnused: this.cssStats.unusedSelectors.size,
        lastChecked: this.cssStats.lastChecked ? new Date(this.cssStats.lastChecked).toISOString() : null
      },
      usedSelectors: Array.from(this.cssStats.usedSelectors).sort(),
      unusedSelectors: Array.from(this.cssStats.unusedSelectors).sort(),
      selectorUsageCount: Object.fromEntries(
        Array.from(this.cssStats.selectorUsageCount.entries()).sort((a, b) => b[1] - a[1])
      ),
      mostUsedSelectors: Array.from(this.cssStats.selectorUsageCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([selector, count]) => ({ selector, count }))
    }
    
    return stats
  }
  
  /**
   * Export i18n stats as JSON for analysis
   */
  exportI18nStats() {
    const stats = this.getI18nStats()
    if (!stats) return null
    
    const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `i18n-stats-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    
    console.log('DevMonitor: I18n stats exported')
    return stats
  }
  
  /**
   * Export CSS stats as JSON for analysis
   */
  exportCSSStats() {
    const stats = this.getCSSStats()
    if (!stats) return null
    
    const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `css-stats-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    
    console.log('DevMonitor: CSS stats exported')
    return stats
  }
  
  /**
   * Generate unused CSS removal script
   */
  generateCSSCleanupScript() {
    const stats = this.getCSSStats()
    if (!stats) return null
    
    const script = `
// Auto-generated CSS cleanup script
// Remove unused selectors (review before applying!)

/*
UNUSED SELECTORS (${stats.unusedSelectors.length} total):
${stats.unusedSelectors.map(s => `- ${s}`).join('\n')}
*/

// Most used selectors to keep:
${stats.mostUsedSelectors.map(({ selector, count }) => `/* ${selector} (used ${count} times) */`).join('\n')}
`
    
    const blob = new Blob([script], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `css-cleanup-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
    
    console.log('DevMonitor: CSS cleanup script generated')
    return script
  }
  
  /**
   * Clear all tracking data
   */
  clearStats() {
    this.i18nStats = {
      usedKeys: new Set(),
      missingKeys: new Set(),
      keyUsageCount: new Map(),
      lastUsed: new Map()
    }
    
    this.cssStats = {
      usedSelectors: new Set(),
      unusedSelectors: new Set(),
      selectorUsageCount: new Map(),
      lastChecked: null
    }
    
    console.log('DevMonitor: All stats cleared')
  }
  
  /**
   * Disable i18n tracking
   */
  disableI18nTracking() {
    if (!this.i18nTracking) return
    
    // Restore original functions
    if (this.originalI18nT && window.i18next) {
      window.i18next.t = this.originalI18nT
    }
    
    this.i18nTracking = false
    console.log('DevMonitor: I18n tracking disabled')
  }
  
  /**
   * Disable CSS tracking
   */
  disableCSSTracking() {
    if (!this.cssTracking) return
    
    if (this.cssCheckInterval) {
      clearInterval(this.cssCheckInterval)
      this.cssCheckInterval = null
    }
    
    this.cssTracking = false
    console.log('DevMonitor: CSS tracking disabled')
  }
  
  /**
   * Disable all tracking
   */
  disableAll() {
    this.disableI18nTracking()
    this.disableCSSTracking()
    this.isEnabled = false
    console.log('DevMonitor: All tracking disabled')
  }
  
  /**
   * Manual CSS check (for debugging)
   */
  checkCSSNow() {
    if (!this.isDevelopment) {
      console.warn('DevMonitor: CSS checking only available in development mode')
      return false
    }
    
    console.log('DevMonitor: Running manual CSS check...')
    this.checkCSSUsage()
    return this.getCSSStats()
  }
  
  /**
   * Get current status
   */
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      isDevelopment: this.isDevelopment,
      i18nTracking: this.i18nTracking,
      cssTracking: this.cssTracking,
      i18nStatsCount: this.i18nStats.usedKeys.size,
      cssStatsCount: this.cssStats.usedSelectors.size
    }
  }
}

// Create singleton instance
const devMonitor = new DevMonitor()

// Expose to global scope in development
if (devMonitor.isDevelopment) {
  window.devMonitor = devMonitor
  
  // Add console helpers
  console.log(`
🔧 DevMonitor loaded! Available commands:
- devMonitor.enableI18nTracking()    // Start tracking i18n usage
- devMonitor.enableCSSTracking()     // Start tracking CSS usage  
- devMonitor.getI18nStats()          // Get i18n usage statistics
- devMonitor.getCSSStats()           // Get CSS usage statistics
- devMonitor.checkCSSNow()           // Run CSS check immediately (debug)
- devMonitor.exportI18nStats()       // Download i18n stats as JSON
- devMonitor.exportCSSStats()        // Download CSS stats as JSON
- devMonitor.generateCSSCleanupScript() // Generate CSS cleanup script
- devMonitor.clearStats()            // Clear all tracking data
- devMonitor.disableAll()            // Disable all tracking
- devMonitor.getStatus()             // Get current status
  `)
}

export default devMonitor