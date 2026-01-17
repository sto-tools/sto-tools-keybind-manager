/**
 * keyEncoding.js - Handles encoding/decoding of special keys for STO keybind files
 *
 * Some keys need to be encoded as hex values in keybind files but displayed
 * as their normal character representation in the UI.
 */

// Mapping of display key names to their encoded keybind file representation
const KEY_ENCODE_MAP = {
  '`': '0x29', // Backtick needs to be encoded as 0x29
}

// Scancode to key name mapping for STO export file imports
const KEY_DECODE_MAP = {
  '0x2': '1',
  '0x3': '2',
  '0x4': '3',
  '0x5': '4',
  '0x6': '5',
  '0x7': '6',
  '0x8': '7',
  '0x9': '8',
  '0xa': '9',
  '0xb': '0',
  '0xd': 'Equals',
  '0xe': 'Backspace',
  '0xf': 'Tab',
  '0x10': 'Q',
  '0x11': 'W',
  '0x12': 'E',
  '0x13': 'R',
  '0x14': 'T',
  '0x15': 'Y',
  '0x16': 'U',
  '0x17': 'I',
  '0x18': 'O',
  '0x19': 'P',
  '0x1a': '[',
  '0x1b': ']',
  '0x1c': 'enter',
  '0x1d': 'LCTRL',
  '0x1e': 'A',
  '0x1f': 'S',
  '0x20': 'D',
  '0x21': 'F',
  '0x22': 'G',
  '0x23': 'H',
  '0x24': 'J',
  '0x25': 'K',
  '0x26': 'L',
  '0x29': '`',
  '0x2a': 'LSHIFT',
  '0x2b': '\\',
  '0x2c': 'Z',
  '0x2d': 'X',
  '0x2e': 'C',
  '0x2f': 'V',
  '0x30': 'B',
  '0x31': 'N',
  '0x32': 'M',
  '0x33': ',',
  '0x34': '.',
  '0x35': '/',
  '0x36': 'RSHIFT',
  '0x37': 'Multiply',
  '0x38': 'LALT',
  '0x39': 'Space',
  '0x3b': 'F1',
  '0x3c': 'F2',
  '0x3d': 'F3',
  '0x3e': 'F4',
  '0x3f': 'F5',
  '0x40': 'F6',
  '0x41': 'F7',
  '0x42': 'F8',
  '0x43': 'F9',
  '0x44': 'F10',
  '0x47': 'numpad7',
  '0x48': 'numpad8',
  '0x49': 'numpad9',
  '0x4a': 'Subtract',
  '0x4b': 'numpad4',
  '0x4c': 'numpad5',
  '0x4d': 'numpad6',
  '0x4e': 'Add',
  '0x4f': 'numpad1',
  '0x50': 'numpad2',
  '0x51': 'numpad3',
  '0x52': 'numpad0',
  '0x53': 'Decimal',
  '0x57': 'F11',
  '0x58': 'F12',
  '0x5a': 'Joy1',
  '0x5b': 'Joy2',
  '0x5c': 'Joy3',
  '0x5d': 'Joy4',
  '0x5e': 'Joy5',
  '0x5f': 'Joy6',
  '0x60': 'Joy7',
  '0x61': 'Joy8',
  '0x62': 'Joy9',
  '0x63': 'Joy10',
  '0x64': 'F13',
  '0x65': 'F14',
  '0x66': 'F15',
  '0x7f': 'Joy11',
  '0x80': 'Joy12',
  '0x9c': 'numpadenter',
  '0x9d': 'RCTRL',
  '0xa5': 'Rstick_up',
  '0xa6': 'Rstick_down',
  '0xa7': 'Rstick_left',
  '0xa8': 'Rstick_right',
  '0xb5': 'Divide',
  '0xb8': 'RALT',
  '0xb9': 'Joypad_up',
  '0xba': 'Joypad_down',
  '0xbb': 'Joypad_left',
  '0xbc': 'Joypad_right',
  '0xbd': 'Lstick_up',
  '0xbe': 'Lstick_down',
  '0xbf': 'Lstick_left',
  '0xc0': 'Lstick_right',
  '0xc7': 'Home',
  '0xc8': 'Up',
  '0xc9': 'PageUp',
  '0xcb': 'Left',
  '0xcd': 'Right',
  '0xcf': 'End',
  '0xd0': 'Down',
  '0xd1': 'PageDown',
  '0xd2': 'insert',
  '0xd3': 'Delete',
  '0xee': 'Button1',
  '0xef': 'Button2',
  '0xf0': 'Button3',
  '0xf1': 'Button4',
  '0xf2': 'Button5',
  '0xf3': 'Button6',
  '0xf4': 'Button7',
  '0xf5': 'Button8',
  '0xf6': 'Wheelminus',
  '0xf7': 'Wheelplus',
  '0xf8': 'Lclick',
  '0xf9': 'Mclick',
  '0xfa': 'Rclick',
  '0xfb': 'Ldrag',
  '0xfc': 'Mdrag',
  '0xfd': 'Rdrag',
  '0xfe': 'Wheelplus',
  '0xff': 'Wheelminus',
  '0x100': 'Ldblclick',
  '0x101': 'Mdblclick',
  '0x102': 'Rdblclick',
  '0x801': 'Control',
  '0x802': 'Shift',
  '0x803': 'ALT',
};

/**
 * Encode a key name for use in keybind files
 * @param {string} keyName - Display key name (e.g., '`', 'ALT+`')
 * @returns {string} - Encoded key name for keybind file (e.g., '0x29', 'ALT+0x29')
 */
export function encodeKeyForExport(keyName) {
  // Input validation: return as-is if not a valid string
  if (typeof keyName !== 'string') {
    return keyName
  }

  // Handle chord combinations (e.g., "ALT+`" becomes "ALT+0x29")
  if (keyName.includes('+')) {
    return keyName
      .split('+')
      .map((part) => {
        const trimmedPart = part.trim()
        return KEY_ENCODE_MAP[trimmedPart] || trimmedPart
      })
      .join('+')
  }

  // Single key encoding
  return KEY_ENCODE_MAP[keyName] || keyName
}

/**
 * Decode a key name from keybind files to display name
 * @param {string} encodedKey - Encoded key from keybind file (e.g., '0x29', '0x801+0x10', 'ALT+0x29')
 * @returns {string} - Display key name (e.g., '`', 'Control+Q', 'ALT+`')
 */
export function decodeKeyFromImport(encodedKey) {
  // Input validation: return as-is if not a valid string
  if (typeof encodedKey !== 'string') {
    return encodedKey
  }

  // Handle STO modifier combinations (e.g., "0x801+0x10" becomes "Control+Q")
  if (encodedKey.includes('+')) {
    return encodedKey
      .split('+')
      .map((part) => {
        const trimmedPart = part.trim().toLowerCase()
        return KEY_DECODE_MAP[trimmedPart] || trimmedPart
      })
      .join('+')
  }

  // Single key decoding
  return KEY_DECODE_MAP[encodedKey] || encodedKey
}

