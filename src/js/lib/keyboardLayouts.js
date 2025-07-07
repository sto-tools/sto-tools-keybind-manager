/**
 * Keyboard layout definitions for international support
 * Used by KeyCaptureUI to render appropriate visual keyboards
 */

// Base key positions (independent of layout)
const KEY_POSITIONS = {
  // Function keys row
  F1: { row: 0, col: 1, width: 1 },
  F2: { row: 0, col: 2, width: 1 },
  F3: { row: 0, col: 3, width: 1 },
  F4: { row: 0, col: 4, width: 1 },
  F5: { row: 0, col: 5, width: 1 },
  F6: { row: 0, col: 6, width: 1 },
  F7: { row: 0, col: 7, width: 1 },
  F8: { row: 0, col: 8, width: 1 },
  F9: { row: 0, col: 9, width: 1 },
  F10: { row: 0, col: 10, width: 1 },
  F11: { row: 0, col: 11, width: 1 },
  F12: { row: 0, col: 12, width: 1 },
  
  // Number row
  Backquote: { row: 1, col: 0, width: 1 },
  Escape: { row: 0, col: 0, width: 1 },
  Digit1: { row: 1, col: 1, width: 1 },
  Digit2: { row: 1, col: 2, width: 1 },
  Digit3: { row: 1, col: 3, width: 1 },
  Digit4: { row: 1, col: 4, width: 1 },
  Digit5: { row: 1, col: 5, width: 1 },
  Digit6: { row: 1, col: 6, width: 1 },
  Digit7: { row: 1, col: 7, width: 1 },
  Digit8: { row: 1, col: 8, width: 1 },
  Digit9: { row: 1, col: 9, width: 1 },
  Digit0: { row: 1, col: 10, width: 1 },
  Minus: { row: 1, col: 11, width: 1 },
  Equal: { row: 1, col: 12, width: 1 },
  
  // Top letter row
  Tab: { row: 2, col: 0, width: 1.5 },
  KeyQ: { row: 2, col: 1.5, width: 1 },
  KeyW: { row: 2, col: 2.5, width: 1 },
  KeyE: { row: 2, col: 3.5, width: 1 },
  KeyR: { row: 2, col: 4.5, width: 1 },
  KeyT: { row: 2, col: 5.5, width: 1 },
  KeyY: { row: 2, col: 6.5, width: 1 },
  KeyU: { row: 2, col: 7.5, width: 1 },
  KeyI: { row: 2, col: 8.5, width: 1 },
  KeyO: { row: 2, col: 9.5, width: 1 },
  KeyP: { row: 2, col: 10.5, width: 1 },
  BracketLeft: { row: 2, col: 11.5, width: 1 },
  BracketRight: { row: 2, col: 12.5, width: 1 },
  
  // Middle letter row
  CapsLock: { row: 3, col: 0, width: 1.75 },
  KeyA: { row: 3, col: 1.75, width: 1 },
  KeyS: { row: 3, col: 2.75, width: 1 },
  KeyD: { row: 3, col: 3.75, width: 1 },
  KeyF: { row: 3, col: 4.75, width: 1 },
  KeyG: { row: 3, col: 5.75, width: 1 },
  KeyH: { row: 3, col: 6.75, width: 1 },
  KeyJ: { row: 3, col: 7.75, width: 1 },
  KeyK: { row: 3, col: 8.75, width: 1 },
  KeyL: { row: 3, col: 9.75, width: 1 },
  Quote: { row: 3, col: 10.75, width: 1 },
  
  // Bottom letter row
  ShiftLeft: { row: 4, col: 0, width: 2.25 },
  KeyZ: { row: 4, col: 2.25, width: 1 },
  KeyX: { row: 4, col: 3.25, width: 1 },
  KeyC: { row: 4, col: 4.25, width: 1 },
  KeyV: { row: 4, col: 5.25, width: 1 },
  KeyB: { row: 4, col: 6.25, width: 1 },
  KeyN: { row: 4, col: 7.25, width: 1 },
  KeyM: { row: 4, col: 8.25, width: 1 },
  Comma: { row: 4, col: 9.25, width: 1 },
  Period: { row: 4, col: 10.25, width: 1 },
  ShiftRight: { row: 4, col: 11.25, width: 2.25 },
  
  // Bottom modifier row
  ControlLeft: { row: 5, col: 0, width: 1.25 },
  // gap after Ctrl-L; Alt-L right edge must butt Space
  AltLeft: { row: 5, col: 2.75, width: 1.25 },
  // Spacebar spans 5.5u, exact overhangs per spec
  Space: { row: 5, col: 4, width: 5.5 },
  AltRight: { row: 5, col: 9.5, width: 1.25 },
  // Gap between AltRight and ControlRight ensures Ctrl right-edge aligns with ShiftRight
  ControlRight: { row: 5, col: 12.25, width: 1.25 },
  
  // Navigation cluster (realign to start at function key row)
  Insert: { row: 1, col: 14.5, width: 1 },
  Delete: { row: 2, col: 14.5, width: 1 },
  Home: { row: 1, col: 15.5, width: 1 },
  End: { row: 2, col: 15.5, width: 1 },
  PageUp: { row: 1, col: 16.5, width: 1 },
  PageDown: { row: 2, col: 16.5, width: 1 },
  
  // Arrow keys (shifted up one row)
  ArrowUp: { row: 4, col: 15, width: 1 },
  ArrowLeft: { row: 5, col: 14, width: 1 },
  ArrowDown: { row: 5, col: 15, width: 1 },
  ArrowRight: { row: 5, col: 16, width: 1 },
  
  // Numeric keypad (row 1 top of numpad)
  NumpadDivide:   { row: 1, col: 18, width: 1 },
  NumpadMultiply: { row: 1, col: 19, width: 1 },
  NumpadSubtract: { row: 1, col: 20, width: 1 },

  // Numeric keypad row with 7 8 9 +
  Numpad7: { row: 2, col: 17, width: 1 },
  Numpad8: { row: 2, col: 18, width: 1 },
  Numpad9: { row: 2, col: 19, width: 1 },
  NumpadAdd: { row: 2, col: 20, width: 1 },

  // Numeric keypad row with 4 5 6
  Numpad4: { row: 3, col: 17, width: 1 },
  Numpad5: { row: 3, col: 18, width: 1 },
  Numpad6: { row: 3, col: 19, width: 1 },

  // Numeric keypad row with 1 2 3 Enter
  Numpad1: { row: 4, col: 17, width: 1 },
  Numpad2: { row: 4, col: 18, width: 1 },
  Numpad3: { row: 4, col: 19, width: 1 },
  NumpadEnter: { row: 4, col: 20, width: 1 },

  // Numeric keypad bottom row 0 .
  Numpad0: { row: 5, col: 17, width: 2 },
  NumpadDecimal: { row: 5, col: 19, width: 1 },

  // ---------------- Mouse gesture block ----------------
  lclick:   { row: 0, col: 22, width: 1 },
  mclick: { row: 0, col: 23, width: 1 },
  rclick: { row: 0, col: 24, width: 1 },
  lpress:  { row: 1, col: 22, width: 1 },
  rpress: { row: 1, col: 23, width: 1 },
  ldrag: { row: 2, col: 22, width: 1 },
  rdrag: { row: 2, col: 23, width: 1 },
  Button4:  { row: 3, col: 22, width: 1 },
  Button5:  { row: 3, col: 23, width: 1 },
  Button6: { row: 3, col: 24, width: 1 },
  Button7:  { row: 4, col: 22, width: 1 },
  Button8:  { row: 4, col: 23, width: 1 },
  Button9: { row: 4, col: 24, width: 1 },
  Button10:   { row: 5, col: 22, width: 1 },
}

// QWERTY layout (English, Spanish)
const QWERTY_LAYOUT = {
  name: 'QWERTY',
  languages: ['en', 'es'],
  keys: {
    // Numbers only (no symbols)
    Digit1: { primary: '1', secondary: '' },
    Digit2: { primary: '2', secondary: '' },
    Digit3: { primary: '3', secondary: '' },
    Digit4: { primary: '4', secondary: '' },
    Digit5: { primary: '5', secondary: '' },
    Digit6: { primary: '6', secondary: '' },
    Digit7: { primary: '7', secondary: '' },
    Digit8: { primary: '8', secondary: '' },
    Digit9: { primary: '9', secondary: '' },
    Digit0: { primary: '0', secondary: '' },
    
    // Letters (uppercase only)
    KeyQ: { primary: 'Q', secondary: '' },
    KeyW: { primary: 'W', secondary: '' },
    KeyE: { primary: 'E', secondary: '' },
    KeyR: { primary: 'R', secondary: '' },
    KeyT: { primary: 'T', secondary: '' },
    KeyY: { primary: 'Y', secondary: '' },
    KeyU: { primary: 'U', secondary: '' },
    KeyI: { primary: 'I', secondary: '' },
    KeyO: { primary: 'O', secondary: '' },
    KeyP: { primary: 'P', secondary: '' },
    KeyA: { primary: 'A', secondary: '' },
    KeyS: { primary: 'S', secondary: '' },
    KeyD: { primary: 'D', secondary: '' },
    KeyF: { primary: 'F', secondary: '' },
    KeyG: { primary: 'G', secondary: '' },
    KeyH: { primary: 'H', secondary: '' },
    KeyJ: { primary: 'J', secondary: '' },
    KeyK: { primary: 'K', secondary: '' },
    KeyL: { primary: 'L', secondary: '' },
    KeyZ: { primary: 'Z', secondary: '' },
    KeyX: { primary: 'X', secondary: '' },
    KeyC: { primary: 'C', secondary: '' },
    KeyV: { primary: 'V', secondary: '' },
    KeyB: { primary: 'B', secondary: '' },
    KeyN: { primary: 'N', secondary: '' },
    KeyM: { primary: 'M', secondary: '' },
    
    // Essential symbols only
    Minus: { primary: '-', secondary: '' },
    Equal: { primary: '=', secondary: '' },
    BracketLeft: { primary: '[', secondary: '' },
    BracketRight: { primary: ']', secondary: '' },
    Quote: { primary: "'", secondary: '' },
    Comma: { primary: ',', secondary: '' },
    Period: { primary: '.', secondary: '' },
    Backquote: { primary: '`', secondary: '~' },
    
    // Special keys
    Space: { primary: 'Space', secondary: '' },
    Tab: { primary: 'Tab', secondary: '' },
    Escape: { primary: 'Esc', secondary: '' },
    Delete: { primary: 'Del', secondary: '' },
    CapsLock: { primary: 'Caps', secondary: '' },
    ShiftLeft: { primary: 'Shift', secondary: '' },
    ShiftRight: { primary: 'Shift', secondary: '' },
    ControlLeft: { primary: 'Ctrl', secondary: '' },
    ControlRight: { primary: 'Ctrl', secondary: '' },
    AltLeft: { primary: 'Alt', secondary: '' },
    AltRight: { primary: 'Alt', secondary: '' },
    
    // Navigation
    ArrowUp: { primary: '↑', secondary: '' },
    ArrowDown: { primary: '↓', secondary: '' },
    ArrowLeft: { primary: '←', secondary: '' },
    ArrowRight: { primary: '→', secondary: '' },
    Home: { primary: 'Home', secondary: '' },
    End: { primary: 'End', secondary: '' },
    PageUp: { primary: 'PgUp', secondary: '' },
    PageDown: { primary: 'PgDn', secondary: '' },
    Insert: { primary: 'Ins', secondary: '' },
    
    // Function keys
    F1: { primary: 'F1', secondary: '' },
    F2: { primary: 'F2', secondary: '' },
    F3: { primary: 'F3', secondary: '' },
    F4: { primary: 'F4', secondary: '' },
    F5: { primary: 'F5', secondary: '' },
    F6: { primary: 'F6', secondary: '' },
    F7: { primary: 'F7', secondary: '' },
    F8: { primary: 'F8', secondary: '' },
    F9: { primary: 'F9', secondary: '' },
    F10: { primary: 'F10', secondary: '' },
    F11: { primary: 'F11', secondary: '' },
    F12: { primary: 'F12', secondary: '' },
    
    // ---------------- Numpad ----------------
    NumpadDivide: { primary: '/', secondary: '' },
    NumpadMultiply: { primary: '*', secondary: '' },
    NumpadSubtract: { primary: '-', secondary: '' },
    NumpadAdd: { primary: '+', secondary: '' },
    NumpadEnter: { primary: 'Enter', secondary: '' },
    NumpadDecimal: { primary: '.', secondary: '' },
    Numpad0: { primary: '0', secondary: '' },
    Numpad1: { primary: '1', secondary: '' },
    Numpad2: { primary: '2', secondary: '' },
    Numpad3: { primary: '3', secondary: '' },
    Numpad4: { primary: '4', secondary: '' },
    Numpad5: { primary: '5', secondary: '' },
    Numpad6: { primary: '6', secondary: '' },
    Numpad7: { primary: '7', secondary: '' },
    Numpad8: { primary: '8', secondary: '' },
    Numpad9: { primary: '9', secondary: '' },
  }
}

// QWERTZ layout (German)
const QWERTZ_LAYOUT = {
  name: 'QWERTZ',
  languages: ['de'],
  keys: {
    // Numbers only (no symbols)
    Digit1: { primary: '1', secondary: '' },
    Digit2: { primary: '2', secondary: '' },
    Digit3: { primary: '3', secondary: '' },
    Digit4: { primary: '4', secondary: '' },
    Digit5: { primary: '5', secondary: '' },
    Digit6: { primary: '6', secondary: '' },
    Digit7: { primary: '7', secondary: '' },
    Digit8: { primary: '8', secondary: '' },
    Digit9: { primary: '9', secondary: '' },
    Digit0: { primary: '0', secondary: '' },
    
    // Letters (uppercase only, QWERTZ layout)
    KeyQ: { primary: 'Q', secondary: '' },
    KeyW: { primary: 'W', secondary: '' },
    KeyE: { primary: 'E', secondary: '' },
    KeyR: { primary: 'R', secondary: '' },
    KeyT: { primary: 'T', secondary: '' },
    KeyZ: { primary: 'Y', secondary: '' }, // Position of Y in QWERTZ
    KeyU: { primary: 'U', secondary: '' },
    KeyI: { primary: 'I', secondary: '' },
    KeyO: { primary: 'O', secondary: '' },
    KeyP: { primary: 'P', secondary: '' },
    KeyA: { primary: 'A', secondary: '' },
    KeyS: { primary: 'S', secondary: '' },
    KeyD: { primary: 'D', secondary: '' },
    KeyF: { primary: 'F', secondary: '' },
    KeyG: { primary: 'G', secondary: '' },
    KeyH: { primary: 'H', secondary: '' },
    KeyJ: { primary: 'J', secondary: '' },
    KeyK: { primary: 'K', secondary: '' },
    KeyL: { primary: 'L', secondary: '' },
    KeyY: { primary: 'Z', secondary: '' }, // Position of Z in QWERTZ
    KeyX: { primary: 'X', secondary: '' },
    KeyC: { primary: 'C', secondary: '' },
    KeyV: { primary: 'V', secondary: '' },
    KeyB: { primary: 'B', secondary: '' },
    KeyN: { primary: 'N', secondary: '' },
    KeyM: { primary: 'M', secondary: '' },
    
    // Essential symbols only
    Minus: { primary: '-', secondary: '' },
    Equal: { primary: '=', secondary: '' },
    BracketLeft: { primary: '[', secondary: '' },
    BracketRight: { primary: ']', secondary: '' },
    Quote: { primary: "'", secondary: '' },
    Comma: { primary: ',', secondary: '' },
    Period: { primary: '.', secondary: '' },
    Backquote: { primary: '`', secondary: '~' },
    
    // Special keys
    Space: { primary: 'Space', secondary: '' },
    Tab: { primary: 'Tab', secondary: '' },
    Escape: { primary: 'Esc', secondary: '' },
    Delete: { primary: 'Del', secondary: '' },
    CapsLock: { primary: 'Caps', secondary: '' },
    ShiftLeft: { primary: 'Shift', secondary: '' },
    ShiftRight: { primary: 'Shift', secondary: '' },
    ControlLeft: { primary: 'Ctrl', secondary: '' },
    ControlRight: { primary: 'Ctrl', secondary: '' },
    AltLeft: { primary: 'Alt', secondary: '' },
    AltRight: { primary: 'Alt', secondary: '' },
    
    // Navigation
    ArrowUp: { primary: '↑', secondary: '' },
    ArrowDown: { primary: '↓', secondary: '' },
    ArrowLeft: { primary: '←', secondary: '' },
    ArrowRight: { primary: '→', secondary: '' },
    Home: { primary: 'Home', secondary: '' },
    End: { primary: 'End', secondary: '' },
    PageUp: { primary: 'PgUp', secondary: '' },
    PageDown: { primary: 'PgDn', secondary: '' },
    Insert: { primary: 'Ins', secondary: '' },
    
    // Function keys
    F1: { primary: 'F1', secondary: '' },
    F2: { primary: 'F2', secondary: '' },
    F3: { primary: 'F3', secondary: '' },
    F4: { primary: 'F4', secondary: '' },
    F5: { primary: 'F5', secondary: '' },
    F6: { primary: 'F6', secondary: '' },
    F7: { primary: 'F7', secondary: '' },
    F8: { primary: 'F8', secondary: '' },
    F9: { primary: 'F9', secondary: '' },
    F10: { primary: 'F10', secondary: '' },
    F11: { primary: 'F11', secondary: '' },
    F12: { primary: 'F12', secondary: '' },
    
    // ---------------- Numpad ----------------
    NumpadDivide: { primary: '/', secondary: '' },
    NumpadMultiply: { primary: '*', secondary: '' },
    NumpadSubtract: { primary: '-', secondary: '' },
    NumpadAdd: { primary: '+', secondary: '' },
    NumpadEnter: { primary: 'Enter', secondary: '' },
    NumpadDecimal: { primary: '.', secondary: '' },
    Numpad0: { primary: '0', secondary: '' },
    Numpad1: { primary: '1', secondary: '' },
    Numpad2: { primary: '2', secondary: '' },
    Numpad3: { primary: '3', secondary: '' },
    Numpad4: { primary: '4', secondary: '' },
    Numpad5: { primary: '5', secondary: '' },
    Numpad6: { primary: '6', secondary: '' },
    Numpad7: { primary: '7', secondary: '' },
    Numpad8: { primary: '8', secondary: '' },
    Numpad9: { primary: '9', secondary: '' },
  }
}

// AZERTY layout (French)
const AZERTY_LAYOUT = {
  name: 'AZERTY',
  languages: ['fr'],
  keys: {
    // Numbers only (no symbols)
    Digit1: { primary: '1', secondary: '' },
    Digit2: { primary: '2', secondary: '' },
    Digit3: { primary: '3', secondary: '' },
    Digit4: { primary: '4', secondary: '' },
    Digit5: { primary: '5', secondary: '' },
    Digit6: { primary: '6', secondary: '' },
    Digit7: { primary: '7', secondary: '' },
    Digit8: { primary: '8', secondary: '' },
    Digit9: { primary: '9', secondary: '' },
    Digit0: { primary: '0', secondary: '' },
    
    // Letters (uppercase only, AZERTY layout)
    KeyA: { primary: 'Q', secondary: '' }, // Physical A key shows Q
    KeyQ: { primary: 'A', secondary: '' }, // Physical Q key shows A
    KeyZ: { primary: 'W', secondary: '' }, // Physical Z key shows W
    KeyW: { primary: 'Z', secondary: '' }, // Physical W key shows Z
    KeyE: { primary: 'E', secondary: '' },
    KeyR: { primary: 'R', secondary: '' },
    KeyT: { primary: 'T', secondary: '' },
    KeyY: { primary: 'Y', secondary: '' },
    KeyU: { primary: 'U', secondary: '' },
    KeyI: { primary: 'I', secondary: '' },
    KeyO: { primary: 'O', secondary: '' },
    KeyP: { primary: 'P', secondary: '' },
    KeyS: { primary: 'S', secondary: '' },
    KeyD: { primary: 'D', secondary: '' },
    KeyF: { primary: 'F', secondary: '' },
    KeyG: { primary: 'G', secondary: '' },
    KeyH: { primary: 'H', secondary: '' },
    KeyJ: { primary: 'J', secondary: '' },
    KeyK: { primary: 'K', secondary: '' },
    KeyL: { primary: 'L', secondary: '' },
    KeyX: { primary: 'X', secondary: '' },
    KeyC: { primary: 'C', secondary: '' },
    KeyV: { primary: 'V', secondary: '' },
    KeyB: { primary: 'B', secondary: '' },
    KeyN: { primary: 'N', secondary: '' },
    KeyM: { primary: 'M', secondary: '' },
    
    // Essential symbols only
    Minus: { primary: '-', secondary: '' },
    Equal: { primary: '=', secondary: '' },
    BracketLeft: { primary: '[', secondary: '' },
    BracketRight: { primary: ']', secondary: '' },
    Quote: { primary: "'", secondary: '' },
    Comma: { primary: ',', secondary: '' },
    Period: { primary: '.', secondary: '' },
    Backquote: { primary: '`', secondary: '~' },
    
    // Special keys
    Space: { primary: 'Space', secondary: '' },
    Tab: { primary: 'Tab', secondary: '' },
    Escape: { primary: 'Esc', secondary: '' },
    Delete: { primary: 'Del', secondary: '' },
    CapsLock: { primary: 'Caps', secondary: '' },
    ShiftLeft: { primary: 'Shift', secondary: '' },
    ShiftRight: { primary: 'Shift', secondary: '' },
    ControlLeft: { primary: 'Ctrl', secondary: '' },
    ControlRight: { primary: 'Ctrl', secondary: '' },
    AltLeft: { primary: 'Alt', secondary: '' },
    AltRight: { primary: 'Alt', secondary: '' },
    
    // Navigation
    ArrowUp: { primary: '↑', secondary: '' },
    ArrowDown: { primary: '↓', secondary: '' },
    ArrowLeft: { primary: '←', secondary: '' },
    ArrowRight: { primary: '→', secondary: '' },
    Home: { primary: 'Home', secondary: '' },
    End: { primary: 'End', secondary: '' },
    PageUp: { primary: 'PgUp', secondary: '' },
    PageDown: { primary: 'PgDn', secondary: '' },
    Insert: { primary: 'Ins', secondary: '' },
    
    // Function keys
    F1: { primary: 'F1', secondary: '' },
    F2: { primary: 'F2', secondary: '' },
    F3: { primary: 'F3', secondary: '' },
    F4: { primary: 'F4', secondary: '' },
    F5: { primary: 'F5', secondary: '' },
    F6: { primary: 'F6', secondary: '' },
    F7: { primary: 'F7', secondary: '' },
    F8: { primary: 'F8', secondary: '' },
    F9: { primary: 'F9', secondary: '' },
    F10: { primary: 'F10', secondary: '' },
    F11: { primary: 'F11', secondary: '' },
    F12: { primary: 'F12', secondary: '' },
    
    // ---------------- Numpad ----------------
    NumpadDivide: { primary: '/', secondary: '' },
    NumpadMultiply: { primary: '*', secondary: '' },
    NumpadSubtract: { primary: '-', secondary: '' },
    NumpadAdd: { primary: '+', secondary: '' },
    NumpadEnter: { primary: 'Enter', secondary: '' },
    NumpadDecimal: { primary: '.', secondary: '' },
    Numpad0: { primary: '0', secondary: '' },
    Numpad1: { primary: '1', secondary: '' },
    Numpad2: { primary: '2', secondary: '' },
    Numpad3: { primary: '3', secondary: '' },
    Numpad4: { primary: '4', secondary: '' },
    Numpad5: { primary: '5', secondary: '' },
    Numpad6: { primary: '6', secondary: '' },
    Numpad7: { primary: '7', secondary: '' },
    Numpad8: { primary: '8', secondary: '' },
    Numpad9: { primary: '9', secondary: '' },
  }
}

// Mouse gesture area definition
const MOUSE_GESTURES = {
  lclick: { name: 'Left Click', description: 'Single left mouse click' },
  rclick: { name: 'Right Click', description: 'Single right mouse click' },
  mclick: { name: 'Middle Click', description: 'Single middle mouse click' },
  lpress: { name: 'Left Press', description: 'Left mouse press and hold' },
  rpress: { name: 'Right Press', description: 'Right mouse press and hold' },
  ldrag: { name: 'Left Drag', description: 'Left click and drag' },
  rdrag: { name: 'Right Drag', description: 'Right click and drag' },
  wheelup: { name: 'Scroll Up', description: 'Mouse wheel scroll up' },
  wheeldown: { name: 'Scroll Down', description: 'Mouse wheel scroll down' },
  Button1: { name: 'Button1', description: 'Standard left button' },
  Button2: { name: 'Button2', description: 'Standard right button' },
  Button3: { name: 'Button3', description: 'Middle button' },
  Button4: { name: 'Button4', description: 'Extra mouse button 4' },
  Button5: { name: 'Button5', description: 'Extra mouse button 5' },
  Button6: { name: 'Button6', description: 'Extra mouse button 6' },
  Button7: { name: 'Button7', description: 'Extra mouse button 7' },
  Button8: { name: 'Button8', description: 'Extra mouse button 8' },
  Button9: { name: 'Button9', description: 'Extra mouse button 9' },
  Button10: { name: 'Button10', description: 'Extra mouse button 10' },
}

// Smart key suggestions based on usage patterns
const SMART_SUGGESTIONS = {
  common: {
    category: 'Common Keys',
    keys: ['Space', 'F1', 'F2', 'F3', 'F4', 'Tab', 'Enter', 'Escape']
  },
  movement: {
    category: 'Movement',
    keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Shift+KeyW', 'Shift+KeyA', 'Shift+KeyS', 'Shift+KeyD']
  },
  abilities: {
    category: 'Abilities',
    keys: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']
  },
  quickslots: {
    category: 'Quick Slots',
    keys: ['Ctrl+Digit1', 'Ctrl+Digit2', 'Ctrl+Digit3', 'Ctrl+Digit4', 'Ctrl+Digit5', 'Ctrl+Digit6', 'Ctrl+Digit7', 'Ctrl+Digit8', 'Ctrl+Digit9']
  },
  mouse: {
    category: 'Mouse Actions',
    keys: ['lclick', 'rclick', 'mclick', 'lpress', 'rpress', 'ldrag', 'rdrag', 'wheelup', 'wheeldown']
  }
}

/**
 * Get keyboard layout for a given language
 * @param {string} language - Language code (en, de, fr, es)
 * @returns {Object} Layout object
 */
export function getKeyboardLayout(language) {
  switch (language) {
    case 'de':
      return QWERTZ_LAYOUT
    case 'fr':
      return AZERTY_LAYOUT
    case 'en':
    case 'es':
    default:
      return QWERTY_LAYOUT
  }
}

/**
 * Get keyboard layout name for a given language
 * @param {string} language - Language code
 * @returns {string} Layout name
 */
export function getLayoutName(language) {
  const layout = getKeyboardLayout(language)
  return layout.name
}

/**
 * Get all supported layouts
 * @returns {Array} Array of layout objects
 */
export function getAllLayouts() {
  return [QWERTY_LAYOUT, QWERTZ_LAYOUT, AZERTY_LAYOUT]
}

export {
  KEY_POSITIONS,
  QWERTY_LAYOUT,
  QWERTZ_LAYOUT,
  AZERTY_LAYOUT,
  MOUSE_GESTURES,
  SMART_SUGGESTIONS
} 