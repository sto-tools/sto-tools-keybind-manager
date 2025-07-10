# Development Monitoring Tools

This directory contains development-only tools for monitoring i18n and CSS usage in the keybind application.

## Quick Start

1. **Enable Dev Mode**: Open browser console and run:
   ```javascript
   localStorage.setItem('dev-mode', 'true')
   // Then refresh the page
   ```

2. **Start Monitoring**: 
   ```javascript
   // Track i18n usage
   devMonitor.enableI18nTracking()
   
   // Track CSS usage  
   devMonitor.enableCSSTracking()
   ```

3. **Get Stats**:
   ```javascript
   // View i18n statistics
   devMonitor.getI18nStats()
   
   // View CSS statistics
   devMonitor.getCSSStats()
   ```

## Available Commands

### I18n Monitoring
```javascript
// Enable tracking of i18n key usage
devMonitor.enableI18nTracking()

// Get detailed i18n statistics
const i18nStats = devMonitor.getI18nStats()
console.log(i18nStats)

// Export i18n stats as JSON file
devMonitor.exportI18nStats()

// Disable i18n tracking
devMonitor.disableI18nTracking()
```

### CSS Monitoring
```javascript
// Enable tracking of CSS selector usage (checks every 2 seconds)
devMonitor.enableCSSTracking()

// Get detailed CSS statistics
const cssStats = devMonitor.getCSSStats()
console.log(cssStats)

// Export CSS stats as JSON file
devMonitor.exportCSSStats()

// Generate CSS cleanup script
devMonitor.generateCSSCleanupScript()

// Disable CSS tracking
devMonitor.disableCSSTracking()
```

### General Commands
```javascript
// Get current monitoring status
devMonitor.getStatus()

// Clear all collected statistics
devMonitor.clearStats()

// Disable all monitoring
devMonitor.disableAll()

// Enable/disable dev mode
devConfig.enable()
devConfig.disable()
```

## What Gets Tracked

### I18n Tracking
- **Used Keys**: All i18n keys that have been requested
- **Missing Keys**: Keys that were requested but don't exist in the current language
- **Usage Count**: How many times each key has been used
- **Recent Usage**: When each key was last used

### CSS Tracking
- **Used Selectors**: CSS selectors that match current DOM elements
- **Unused Selectors**: CSS selectors that don't match any current DOM elements
- **Usage Count**: How many times each selector has been found in use
- **Check Frequency**: Runs every 2 seconds to catch dynamic content

## Safety Features

- **Development Only**: Monitoring is automatically disabled in production
- **Performance Safe**: CSS checking is throttled to every 2 seconds
- **Memory Safe**: Uses Sets and Maps for efficient storage
- **Restoration**: Original functions are restored when tracking is disabled

## Use Cases

### Finding Unused Translations
```javascript
devMonitor.enableI18nTracking()
// Use your app extensively
const stats = devMonitor.getI18nStats()
console.log('Missing translations:', stats.missingKeys)
console.log('Unused translations:', /* compare with your translation files */)
```

### CSS Cleanup
```javascript
devMonitor.enableCSSTracking()
// Use your app extensively, navigate to all pages
setTimeout(() => {
  devMonitor.generateCSSCleanupScript()
}, 60000) // Wait 1 minute
```

### Performance Analysis
```javascript
devMonitor.enableI18nTracking()
const stats = devMonitor.getI18nStats()
console.log('Most used i18n keys:', stats.mostUsedKeys)
console.log('Total i18n calls:', stats.summary.totalUsages)
```

## Files

- `DevMonitor.js` - Main monitoring class with i18n and CSS tracking
- `DevConfig.js` - Development mode configuration and toggles
- `README.md` - This documentation

## Implementation Details

### I18n Tracking
- Monkey patches `window.i18next.t()` to track all translation requests
- Patches `window.applyTranslations()` to track HTML data-i18n attributes
- Checks `i18next.exists()` to identify missing translations

### CSS Tracking
- Scans all accessible stylesheets for CSS rules
- Tests each selector against current DOM using `querySelectorAll()`
- Runs periodically to catch dynamically added content
- Skips external stylesheets for security

### Security
- Only runs in development environments
- Checks multiple conditions to ensure dev mode
- Gracefully handles stylesheet access errors (CORS)
- Automatically cleans up when disabled