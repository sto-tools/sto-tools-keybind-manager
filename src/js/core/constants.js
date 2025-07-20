/**
 * Application constants
 */

// Current application version
export const APP_VERSION = '2025.07.21'

// Display version with 'v' prefix for UI
export const DISPLAY_VERSION = `v${APP_VERSION}`

// List of unsafe / rejected key combinations that should not be assignable
// Keeping this here makes it easy to update from one place without touching
// validation or capture logic.
export const UNSAFE_KEYBINDS = [
  // Generic (side-agnostic) Alt shortcuts
  'Alt+F4',
  'Alt+Tab',
  'Alt+Space',
  // Side-specific Alt shortcuts (when the "distinguish modifier side" option is enabled)
  'LALT+F4',
  'RALT+F4',
  'LALT+Tab',
  'RALT+Tab',
  'LALT+Space',
  'RALT+Space',
]
