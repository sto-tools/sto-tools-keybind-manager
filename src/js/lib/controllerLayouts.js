/**
 * Controller layout definitions for gamepad and joystick visual interfaces
 * Used by KeyCaptureUI to render appropriate virtual controller layouts
 */

// Base controller control positions
const CONTROLLER_POSITIONS = {
  // Bumpers and triggers (top row)
  Joy5: { row: 1, col: 2, width: 1, type: 'button' },     // Left Bumper (LB)
  Joy6: { row: 1, col: 13, width: 1, type: 'button' },   // Right Bumper (RB)
  Joy7: { row: 0, col: 2, width: 1, type: 'trigger' },    // Left Trigger (LT)
  Joy8: { row: 0, col: 13, width: 1, type: 'trigger' },  // Right Trigger (RT)

  // Face buttons (right side)
  Joy1: { row: 4, col: 13, width: 1, type: 'button' },      // A (bottom face button)
  Joy2: { row: 3, col: 14, width: 1, type: 'button' },      // B (right face button)
  Joy3: { row: 3, col: 12, width: 1, type: 'button' },      // X (left face button)
  Joy4: { row: 2, col: 13, width: 1, type: 'button' },      // Y (top face button)

  // D-pad (left side)
  Joypad_up: { row: 2, col: 2, width: 1, type: 'dpad' },
  Joypad_down: { row: 4, col: 2, width: 1, type: 'dpad' },
  Joypad_left: { row: 3, col: 1, width: 1, type: 'dpad' },
  Joypad_right: { row: 3, col: 3, width: 1, type: 'dpad' },

  // Center buttons
  Joy9: { row: 2, col: 6, width: 1, type: 'button' },       // Select/Back
  Joy10: { row: 2, col: 9, width: 1, type: 'button' },      // Start/Forward
  
  

  // Analog sticks (as directions)
  Lstick_up: { row: 3, col: 5, width: 1, type: 'stick', stick: 'left', direction: 'up' },
  Lstick_down: { row: 5, col: 5, width: 1, type: 'stick', stick: 'left', direction: 'down' },
  Joy11: { row: 4, col: 5, width: 1, type: 'button' },      // Left Stick Click (L3)
  Lstick_left: { row: 4, col: 4, width: 1, type: 'stick', stick: 'left', direction: 'left' },
  Lstick_right: { row: 4, col: 6, width: 1, type: 'stick', stick: 'left', direction: 'right' },

  Rstick_up: { row: 3, col: 10, width: 1, type: 'stick', stick: 'right', direction: 'up' },
  Rstick_down: { row: 5, col: 10, width: 1, type: 'stick', stick: 'right', direction: 'down' },
  Joy12: { row: 4, col: 10, width: 1, type: 'button' },      // Right Stick Click (R3)
  Rstick_left: { row: 4, col: 9, width: 1, type: 'stick', stick: 'right', direction: 'left' },
  Rstick_right: { row: 4, col: 11, width: 1, type: 'stick', stick: 'right', direction: 'right' },

  // Joystick-specific controls (additional buttons)
  Joy13: { row: 2, col: 16, width: 1, type: 'button' },      // Additional joystick button 1
  Joy14: { row: 3, col: 16, width: 1, type: 'button' },      // Additional joystick button 2
  Joy15: { row: 4, col: 16, width: 1, type: 'button' },      // Additional joystick button 3
  
  Joy16: { row: 2, col: 17, width: 1, type: 'button' },      // Additional joystick button 1
  Joy17: { row: 3, col: 17, width: 1, type: 'button' },      // Additional joystick button 2
  Joy18: { row: 4, col: 17, width: 1, type: 'button' },      // Additional joystick button 3

  Joy19: { row: 2, col: 18, width: 1, type: 'button' },      // Additional joystick button 1
  Joy20: { row: 3, col: 18, width: 1, type: 'button' },      // Additional joystick button 2
  Joy21: { row: 4, col: 18, width: 1, type: 'button' },      // Additional joystick button 3

  Joy22: { row: 2, col: 19, width: 1, type: 'button' },      // Additional joystick button 1
  Joy23: { row: 3, col: 19, width: 1, type: 'button' },      // Additional joystick button 2
  Joy24: { row: 4, col: 19, width: 1, type: 'button' },      // Additional joystick button 3
}

// Standard Gamepad layout (Xbox/PlayStation style controllers)
const STANDARD_GAMEPAD_LAYOUT = {
  name: 'Standard Gamepad',
  type: 'gamepad',
  description: 'Xbox/PlayStation style gamepad controller',
  controls: {
    // Face buttons (right side)
    Joy1: {
      primary: 'A',
      secondary: 'Cross',
      gamepadIndex: 0,
      description: 'Bottom face button (A/X)',
      color: '#4CAF50'
    },
    Joy2: {
      primary: 'B',
      secondary: 'Circle',
      gamepadIndex: 1,
      description: 'Right face button (B/O)',
      color: '#F44336'
    },
    Joy3: {
      primary: 'X',
      secondary: 'Square',
      gamepadIndex: 2,
      description: 'Left face button (X/□)',
      color: '#2196F3'
    },
    Joy4: {
      primary: 'Y',
      secondary: 'Triangle',
      gamepadIndex: 3,
      description: 'Top face button (Y/△)',
      color: '#FFC107'
    },

    // Bumpers
    Joy5: {
      primary: 'LB',
      secondary: 'L1',
      gamepadIndex: 4,
      description: 'Left bumper/shoulder button',
      color: '#9E9E9E'
    },
    Joy6: {
      primary: 'RB',
      secondary: 'R1',
      gamepadIndex: 5,
      description: 'Right bumper/shoulder button',
      color: '#9E9E9E'
    },

    // Triggers
    Joy7: {
      primary: 'LT',
      secondary: 'L2',
      gamepadIndex: 6,
      description: 'Left trigger (analog)',
      color: '#757575',
      threshold: 0.1
    },
    Joy8: {
      primary: 'RT',
      secondary: 'R2',
      gamepadIndex: 7,
      description: 'Right trigger (analog)',
      color: '#757575',
      threshold: 0.1
    },

    // D-pad
    Joypad_up: {
      primary: '↑',
      secondary: 'D-Up',
      gamepadIndex: 12,
      description: 'D-pad up',
      color: '#607D8B'
    },
    Joypad_down: {
      primary: '↓',
      secondary: 'D-Down',
      gamepadIndex: 13,
      description: 'D-pad down',
      color: '#607D8B'
    },
    Joypad_left: {
      primary: '←',
      secondary: 'D-Left',
      gamepadIndex: 14,
      description: 'D-pad left',
      color: '#607D8B'
    },
    Joypad_right: {
      primary: '→',
      secondary: 'D-Right',
      gamepadIndex: 15,
      description: 'D-pad right',
      color: '#607D8B'
    },

    // Center buttons
    Joy9: {
      primary: 'Select',
      secondary: 'Back',
      gamepadIndex: 8,
      description: 'Select/Back button',
      color: '#9E9E9E'
    },
    Joy10: {
      primary: 'Start',
      secondary: 'Forward',
      gamepadIndex: 9,
      description: 'Start/Forward button',
      color: '#9E9E9E'
    },
    Joy11: {
      primary: 'LS',
      secondary: 'L3',
      gamepadIndex: 10,
      description: 'Left stick click',
      color: '#795548'
    },
    Joy12: {
      primary: 'RS',
      secondary: 'R3',
      gamepadIndex: 11,
      description: 'Right stick click',
      color: '#795548'
    },

    // Analog stick directions
    Lstick_up: {
      primary: 'LS↑',
      secondary: 'L-Up',
      gamepadAxis: 1,
      gamepadDirection: -1,
      description: 'Left stick up',
      color: '#FF5722',
      deadzone: 0.15
    },
    Lstick_down: {
      primary: 'LS↓',
      secondary: 'L-Down',
      gamepadAxis: 1,
      gamepadDirection: 1,
      description: 'Left stick down',
      color: '#FF5722',
      deadzone: 0.15
    },
    Lstick_left: {
      primary: 'LS←',
      secondary: 'L-Left',
      gamepadAxis: 0,
      gamepadDirection: -1,
      description: 'Left stick left',
      color: '#FF5722',
      deadzone: 0.15
    },
    Lstick_right: {
      primary: 'LS→',
      secondary: 'L-Right',
      gamepadAxis: 0,
      gamepadDirection: 1,
      description: 'Left stick right',
      color: '#FF5722',
      deadzone: 0.15
    },
    Rstick_up: {
      primary: 'RS↑',
      secondary: 'R-Up',
      gamepadAxis: 3,
      gamepadDirection: -1,
      description: 'Right stick up',
      color: '#E91E63',
      deadzone: 0.15
    },
    Rstick_down: {
      primary: 'RS↓',
      secondary: 'R-Down',
      gamepadAxis: 3,
      gamepadDirection: 1,
      description: 'Right stick down',
      color: '#E91E63',
      deadzone: 0.15
    },
    Rstick_left: {
      primary: 'RS←',
      secondary: 'R-Left',
      gamepadAxis: 2,
      gamepadDirection: -1,
      description: 'Right stick left',
      color: '#E91E63',
      deadzone: 0.15
    },
    Rstick_right: {
      primary: 'RS→',
      secondary: 'R-Right',
      gamepadAxis: 2,
      gamepadDirection: 1,
      description: 'Right stick right',
      color: '#E91E63',
      deadzone: 0.15
    }
  }
}

// Joystick layout (Flight stick/HOTAS style controllers)
const JOYSTICK_LAYOUT = {
  name: 'Joystick',
  type: 'joystick',
  description: 'Flight stick or joystick controller',
  controls: {
    // Primary joystick directions (mapped to stick controls)
    Lstick_up: {
      primary: 'UP',
      secondary: 'Forward',
      gamepadAxis: 1,
      gamepadDirection: -1,
      description: 'Joystick forward/back',
      color: '#4CAF50',
      deadzone: 0.15
    },
    Lstick_down: {
      primary: 'DOWN',
      secondary: 'Backward',
      gamepadAxis: 1,
      gamepadDirection: 1,
      description: 'Joystick backward/back',
      color: '#4CAF50',
      deadzone: 0.15
    },
    Lstick_left: {
      primary: 'LEFT',
      secondary: 'Port',
      gamepadAxis: 0,
      gamepadDirection: -1,
      description: 'Joystick left/port',
      color: '#4CAF50',
      deadzone: 0.15
    },
    Lstick_right: {
      primary: 'RIGHT',
      secondary: 'Starboard',
      gamepadAxis: 0,
      gamepadDirection: 1,
      description: 'Joystick right/starboard',
      color: '#4CAF50',
      deadzone: 0.15
    },

    // Joystick buttons (primary controls)
    Joy1: {
      primary: 'Trigger',
      secondary: 'Button 1',
      gamepadIndex: 0,
      description: 'Primary trigger/button',
      color: '#F44336'
    },
    Joy2: {
      primary: 'B1',
      secondary: 'Button 2',
      gamepadIndex: 1,
      description: 'Secondary button',
      color: '#2196F3'
    },
    Joy3: {
      primary: 'B2',
      secondary: 'Button 3',
      gamepadIndex: 2,
      description: 'Tertiary button',
      color: '#FFC107'
    },
    Joy4: {
      primary: 'B3',
      secondary: 'Button 4',
      gamepadIndex: 3,
      description: 'Quaternary button',
      color: '#4CAF50'
    },

    // Hat switch/D-pad (4-way or 8-way)
    Joypad_up: {
      primary: 'H↑',
      secondary: 'Hat-Up',
      gamepadIndex: 12,
      description: 'Hat switch up',
      color: '#607D8B'
    },
    Joypad_down: {
      primary: 'H↓',
      secondary: 'Hat-Down',
      gamepadIndex: 13,
      description: 'Hat switch down',
      color: '#607D8B'
    },
    Joypad_left: {
      primary: 'H←',
      secondary: 'Hat-Left',
      gamepadIndex: 14,
      description: 'Hat switch left',
      color: '#607D8B'
    },
    Joypad_right: {
      primary: 'H→',
      secondary: 'Hat-Right',
      gamepadIndex: 15,
      description: 'Hat switch right',
      color: '#607D8B'
    },

    // Additional buttons (common on joysticks)
    Joy5: {
      primary: 'B4',
      secondary: 'Button 5',
      gamepadIndex: 4,
      description: 'Additional button 5',
      color: '#9C27B0'
    },
    Joy6: {
      primary: 'B5',
      secondary: 'Button 6',
      gamepadIndex: 5,
      description: 'Additional button 6',
      color: '#9C27B0'
    },
    Joy7: {
      primary: 'B6',
      secondary: 'Button 7',
      gamepadIndex: 6,
      description: 'Additional button 7',
      color: '#FF9800'
    },
    Joy8: {
      primary: 'B7',
      secondary: 'Button 8',
      gamepadIndex: 7,
      description: 'Additional button 8',
      color: '#FF9800'
    },

    // Throttle control (if available)
    Rstick_up: {
      primary: 'TH↑',
      secondary: 'Throttle-Up',
      gamepadAxis: 3,
      gamepadDirection: -1,
      description: 'Throttle increase',
      color: '#795548',
      deadzone: 0.1
    },
    Rstick_down: {
      primary: 'TH↓',
      secondary: 'Throttle-Down',
      gamepadAxis: 3,
      gamepadDirection: 1,
      description: 'Throttle decrease',
      color: '#795548',
      deadzone: 0.1
    },

    // Additional joystick controls
    Joy9: {
      primary: 'B8',
      secondary: 'Button 9',
      gamepadIndex: 8,
      description: 'Additional button 9',
      color: '#009688'
    },
    Joy10: {
      primary: 'B9',
      secondary: 'Button 10',
      gamepadIndex: 9,
      description: 'Additional button 10',
      color: '#009688'
    },
    Joy11: {
      primary: 'B10',
      secondary: 'Button 11',
      gamepadIndex: 10,
      description: 'Additional button 11',
      color: '#00BCD4'
    },
    Joy12: {
      primary: 'B11',
      secondary: 'Button 12',
      gamepadIndex: 11,
      description: 'Additional button 12',
      color: '#00BCD4'
    },

    // Extra buttons for complex joysticks
    Joy13: {
      primary: 'B12',
      secondary: 'Button 13',
      gamepadIndex: 16,
      description: 'Additional button 13',
      color: '#CDDC39'
    },
    Joy14: {
      primary: 'B13',
      secondary: 'Button 14',
      gamepadIndex: 17,
      description: 'Additional button 14',
      color: '#CDDC39'
    },
    Joy15: {
      primary: 'B14',
      secondary: 'Button 15',
      gamepadIndex: 18,
      description: 'Additional button 15',
      color: '#FFEB3B'
    },
    Joy16: {
      primary: 'B15',
      secondary: 'Button 16',
      gamepadIndex: 19,
      description: 'Additional button 16',
      color: '#FFEB3B'
    },
    Joy17: {
      primary: 'B16',
      secondary: 'Button 17',
      gamepadIndex: 20,
      description: 'Additional button 17',
      color: '#FFEB3B'
    },
    Joy18: {
      primary: 'B17',
      secondary: 'Button 18',
      gamepadIndex: 21,
      description: 'Additional button 18',
      color: '#FFEB3B'
    },
    Joy19: {
      primary: 'B19',
      secondary: 'Button 19',
      gamepadIndex: 22,
      description: 'Additional button 19',
      color: '#FFEB3B'
    },
    Joy20: {
      primary: 'B20',
      secondary: 'Button 20',
      gamepadIndex: 23,
      description: 'Additional button 20',
      color: '#FFEB3B'
    },
    Joy21: {
      primary: 'B21',
      secondary: 'Button 21',
      gamepadIndex: 24,
      description: 'Additional button 21',
      color: '#FFEB3B'
    },
    Joy22: {
      primary: 'B22',
      secondary: 'Button 22',
      gamepadIndex: 25,
      description: 'Additional button 22',
      color: '#FFEB3B'
    },
    Joy23: {
      primary: 'B23',
      secondary: 'Button 23',
      gamepadIndex: 26,
      description: 'Additional button 23',
      color: '#FFEB3B'
    },
    Joy24: {
      primary: 'B24',
      secondary: 'Button 24',
      gamepadIndex: 27,
      description: 'Additional button 24',
      color: '#FFEB3B'
    }
  }
}

// Smart controller suggestions based on common patterns
const CONTROLLER_SUGGESTIONS = {
  common: {
    category: 'Common Gamepad Controls',
    controls: ['Joy1', 'Joy2', 'Joy3', 'Joy4', 'Joy5', 'Joy6', 'Lstick_up', 'Lstick_down']
  },
  movement: {
    category: 'Movement & Steering',
    controls: ['Lstick_up', 'Lstick_down', 'Lstick_left', 'Lstick_right']
  },
  combat: {
    category: 'Combat Actions',
    controls: ['Joy1', 'Joy2', 'Joy7', 'Joy8', 'Rstick_up', 'Rstick_down']
  },
  navigation: {
    category: 'Navigation & Camera',
    controls: ['Rstick_up', 'Rstick_down', 'Rstick_left', 'Rstick_right']
  }
}

/**
 * Get controller layout for a given type
 * @param {string} type - Controller type ('gamepad' or 'joystick')
 * @returns {Object} Layout object
 */
export function getControllerLayout(type) {
  switch (type) {
    case 'joystick':
      return JOYSTICK_LAYOUT
    case 'gamepad':
    default:
      return STANDARD_GAMEPAD_LAYOUT
  }
}

/**
 * Get all available controller layouts
 * @returns {Array} Array of layout objects
 */
export function getAllControllerLayouts() {
  return [STANDARD_GAMEPAD_LAYOUT, JOYSTICK_LAYOUT]
}

/**
 * Get controller position data for a control
 * @param {string} controlId - Control identifier (e.g., 'Joy1', 'Lstick_up')
 * @returns {Object} Position data or null if not found
 */
export function getControllerPosition(controlId) {
  return CONTROLLER_POSITIONS[controlId] || null
}

/**
 * Get all controller position data
 * @returns {Object} All position data
 */
export function getAllControllerPositions() {
  return CONTROLLER_POSITIONS
}

/**
 * Get controller suggestions for a category
 * @param {string} category - Suggestion category
 * @returns {Object} Suggestion data or null
 */
export function getControllerSuggestions(category) {
  return CONTROLLER_SUGGESTIONS[category] || null
}

/**
 * Get all controller suggestion categories
 * @returns {Object} All suggestion categories
 */
export function getAllControllerSuggestions() {
  return CONTROLLER_SUGGESTIONS
}

export {
  CONTROLLER_POSITIONS,
  STANDARD_GAMEPAD_LAYOUT,
  JOYSTICK_LAYOUT,
  CONTROLLER_SUGGESTIONS
}