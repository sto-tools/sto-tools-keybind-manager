// STO Tools Keybind Manager - Data Layer
// Contains all command definitions, templates, and default configurations
import commandCategories from "./data/commandCatalog.js";
import defaultProfiles from "./data/defaultProfiles.js";
import vfxEffects from "./data/vfxEffects.js";

const stoData = {
  // Command categories and definitions
  commands: commandCategories,

  // Command templates for common scenarios
  templates: {
    space_combat: {
      basic_attack: {
        name: "Basic Attack Sequence",
        description: "Target enemy and fire all weapons",
        commands: ["Target_Enemy_Near", "FireAll"],
      },
      defensive_sequence: {
        name: "Defensive Sequence",
        description: "Target self and activate defensive abilities",
        commands: ["Target_Self", "+power_exec Distribute_Shields"],
      },
      alpha_strike: {
        name: "Alpha Strike",
        description: "Full offensive sequence with buffs",
        commands: ["Target_Enemy_Near", "FireAll"],
      },
      healing_sequence: {
        name: "Emergency Healing",
        description: "Self-healing and damage control",
        commands: ["Target_Self", "+power_exec Distribute_Shields"],
      },
    },
    ground_combat: {
      basic_ground_attack: {
        name: "Basic Ground Attack",
        description: "Target and attack sequence for ground combat",
        commands: ["Target_Enemy_Near", "+STOTrayExecByTray 0 0"],
      },
    },
  },

  // Default profiles
  defaultProfiles,

  // Comprehensive key definitions organized by category
  keys: {
    common: {
      name: "Common Keys",
      description: "Most frequently used keys",
      keys: [
        { key: "Space", description: "Spacebar" },
        { key: "1", description: "Number 1" },
        { key: "2", description: "Number 2" },
        { key: "3", description: "Number 3" },
        { key: "4", description: "Number 4" },
        { key: "5", description: "Number 5" },
        { key: "F1", description: "Function Key 1" },
        { key: "F2", description: "Function Key 2" },
        { key: "F3", description: "Function Key 3" },
        { key: "F4", description: "Function Key 4" },
        { key: "Tab", description: "Tab" },
        { key: "enter", description: "Main Enter Key" },
        { key: "Shift", description: "Shift" },
        { key: "Control", description: "Control" },
        { key: "ALT", description: "Alt" },
      ],
    },
    letters: {
      name: "Letter Keys",
      description: "A-Z keyboard letters",
      keys: [
        { key: "A", description: "Key A" },
        { key: "B", description: "Key B" },
        { key: "C", description: "Key C" },
        { key: "D", description: "Key D" },
        { key: "E", description: "Key E" },
        { key: "F", description: "Key F" },
        { key: "G", description: "Key G" },
        { key: "H", description: "Key H" },
        { key: "I", description: "Key I" },
        { key: "J", description: "Key J" },
        { key: "K", description: "Key K" },
        { key: "L", description: "Key L" },
        { key: "M", description: "Key M" },
        { key: "N", description: "Key N" },
        { key: "O", description: "Key O" },
        { key: "P", description: "Key P" },
        { key: "Q", description: "Key Q" },
        { key: "R", description: "Key R" },
        { key: "S", description: "Key S" },
        { key: "T", description: "Key T" },
        { key: "U", description: "Key U" },
        { key: "V", description: "Key V" },
        { key: "W", description: "Key W" },
        { key: "X", description: "Key X" },
        { key: "Y", description: "Key Y" },
        { key: "Z", description: "Key Z" },
      ],
    },
    numbers: {
      name: "Number Keys",
      description: "Number row and numpad",
      keys: [
        { key: "0", description: "Number 0" },
        { key: "6", description: "Number 6" },
        { key: "7", description: "Number 7" },
        { key: "8", description: "Number 8" },
        { key: "9", description: "Number 9" },
        { key: "numpad0", description: "Numerical Keypad 0" },
        { key: "numpad1", description: "Numerical Keypad 1" },
        { key: "numpad2", description: "Numerical Keypad 2" },
        { key: "numpad3", description: "Numerical Keypad 3" },
        { key: "numpad4", description: "Numerical Keypad 4" },
        { key: "numpad5", description: "Numerical Keypad 5" },
        { key: "numpad6", description: "Numerical Keypad 6" },
        { key: "numpad7", description: "Numerical Keypad 7" },
        { key: "numpad8", description: "Numerical Keypad 8" },
        { key: "numpad9", description: "Numerical Keypad 9" },
        { key: "Decimal", description: "Numerical Keypad Decimal" },
        { key: "Divide", description: "Numerical Keypad Divide" },
        { key: "Multiply", description: "Multiply (*)" },
        { key: "Subtract", description: "Subtract (-)" },
        { key: "Add", description: "Add (+)" },
        { key: "numpadenter", description: "Numerical Keypad Enter" },
      ],
    },
    function: {
      name: "Function Keys",
      description: "F1-F24 function keys",
      keys: [
        { key: "F5", description: "Function Key 5" },
        { key: "F6", description: "Function Key 6" },
        { key: "F7", description: "Function Key 7" },
        { key: "F8", description: "Function Key 8" },
        { key: "F9", description: "Function Key 9" },
        { key: "F10", description: "Function Key 10" },
        { key: "F11", description: "Function Key 11" },
        { key: "F12", description: "Function Key 12" },
        { key: "F13", description: "Function Key 13" },
        { key: "F14", description: "Function Key 14" },
        { key: "F15", description: "Function Key 15" },
        { key: "F16", description: "Function Key 16" },
        { key: "F17", description: "Function Key 17" },
        { key: "F18", description: "Function Key 18" },
        { key: "F19", description: "Function Key 19" },
        { key: "F20", description: "Function Key 20" },
        { key: "F21", description: "Function Key 21" },
        { key: "F22", description: "Function Key 22" },
        { key: "F23", description: "Function Key 23" },
        { key: "F24", description: "Function Key 24" },
      ],
    },
    arrows: {
      name: "Arrow & Navigation",
      description: "Arrow keys and navigation",
      keys: [
        { key: "Up", description: "Arrow Key: Up" },
        { key: "Down", description: "Arrow Key: Down" },
        { key: "Left", description: "Arrow Key: Left" },
        { key: "Right", description: "Arrow Key: Right" },
        { key: "Home", description: "Home" },
        { key: "End", description: "End" },
        { key: "PageUp", description: "Page Up" },
        { key: "PageDown", description: "Page Down" },
        { key: "insert", description: "Insert" },
        { key: "delete", description: "Delete" },
      ],
    },
    modifiers: {
      name: "Modifier Keys",
      description: "Shift, Ctrl, Alt variations",
      keys: [
        { key: "ALT", description: "Alt" },
        { key: "LALT", description: "Alt (Left)" },
        { key: "RALT", description: "Alt (Right)" },
        { key: "CTRL", description: "Control" },
        { key: "LCTRL", description: "Control (Left)" },
        { key: "RCTRL", description: "Control (Right)" },
      ],
    },
    symbols: {
      name: "Symbol Keys",
      description: "Punctuation and symbols",
      keys: [
        { key: "[", description: "[" },
        { key: "]", description: "]" },
        { key: "\\", description: "\\" },
        { key: ",", description: "Comma (,)" },
        { key: ".", description: "Period (.)" },
        { key: "/", description: "Divide (/)" },
        { key: "`", description: "Tilda Key (~)" },
      ],
    },
    mouse: {
      name: "Mouse Controls",
      description: "Mouse buttons and scroll",
      keys: [
        { key: "Lbutton", description: "Mouse Left Press" },
        { key: "Rbutton", description: "Mouse Right Press" },
        { key: "Middleclick", description: "Mouse Middle Click" },
        { key: "Button1", description: "Mouse Button 1" },
        { key: "Button2", description: "Mouse Button 2" },
        { key: "Button3", description: "Mouse Button 3" },
        { key: "Button4", description: "Mouse Button 4" },
        { key: "Button5", description: "Mouse Button 5" },
        { key: "Button6", description: "Mouse Button 6" },
        { key: "Button7", description: "Mouse Button 7" },
        { key: "Button8", description: "Mouse Button 8" },
        { key: "Button9", description: "Mouse Button 9" },
        { key: "Button10", description: "Mouse Button 10" },
        { key: "Wheelplus", description: "Mouse Scroll Up" },
        { key: "Wheelminus", description: "Mouse Scroll Down" },
      ],
    },
    gamepad: {
      name: "Xbox Controller",
      description: "Xbox/Gamepad controls",
      keys: [
        { key: "Joy1", description: "XBOX Contr [Start]" },
        { key: "Joy2", description: "XBOX Contr [Back]" },
        { key: "Joy3", description: "XBOX Contr [L Thumb depress]" },
        { key: "Joy4", description: "XBOX Contr [R Thumb depress]" },
        { key: "Joy5", description: "XBOX Contr [Left Bumper]" },
        { key: "Joy6", description: "XBOX Contr [Right Bumper]" },
        { key: "Joy7", description: "XBOX Contr [Left Trigger]" },
        { key: "Joy8", description: "XBOX Contr [Right Trigger]" },
        { key: "Joy9", description: "XBOX Contr [A Button]" },
        { key: "Joy10", description: "XBOX Contr [B Button]" },
        { key: "Joy11", description: "XBOX Contr [X Button]" },
        { key: "Joy12", description: "XBOX Contr [Y Button]" },
        { key: "Joypad_up", description: "XBOX Contr [Pad up]" },
        { key: "Joypad_down", description: "XBOX Contr [Pad down]" },
        { key: "Joypad_left", description: "XBOX Contr [Pad left]" },
        { key: "Joypad_right", description: "XBOX Contr [Pad right]" },
        { key: "Lstick_up", description: "XBOX Contr [Left Stick up]" },
        { key: "Lstick_down", description: "XBOX Contr [Left Stick down]" },
        { key: "Lstick_left", description: "XBOX Contr [Left Stick left]" },
        { key: "Lstick_right", description: "XBOX Contr [Left Stick right]" },
        { key: "Rstick_up", description: "XBOX Contr [Right Stick up]" },
        { key: "Rstick_down", description: "XBOX Contr [Right Stick down]" },
        { key: "Rstick_left", description: "XBOX Contr [Right Stick left]" },
        { key: "Rstick_right", description: "XBOX Contr [Right Stick right]" },
      ],
    },
  },

  // Validation rules
  validation: {
    maxCommandsPerKey: 20,
    maxKeysPerProfile: 100,
  },

  // Application settings
  settings: {
    version: "1.0.0",
    autoSave: true,
    maxUndoSteps: 50,
    defaultMode: "space",
    language: "en",
  },

  // STO Variables that can be used in commands
  variables: {
    target: {
      variable: "$Target",
      description: "Replaced with the name of your current target",
      example: "team Target [$Target]",
      usableIn: ["communication", "custom", "aliases"],
      notes:
        "If your target's name is 'froggyMonster', this will output 'Target [froggyMonster]'",
    },
  },

  // VFX effects available to suppression services and views.
  vfxEffects,
};

// Make available globally
window.STO_DATA = stoData;

// Flatten all commands into a single object
/** @type {NonNullable<Window['COMMANDS']>} */
const flattenedCommands = {};
Object.entries(stoData.commands).forEach(([categoryKey, category]) => {
  Object.entries(category.commands).forEach(([commandKey, command]) => {
    flattenedCommands[commandKey] = {
      ...command,
      category: categoryKey,
      key: commandKey,
    };
  });
});
window.COMMANDS = flattenedCommands;

// Utility functions for data access
window.localizeCommandData = function () {
  const i18n = window.i18next;
  if (!i18n) return;

  Object.entries(stoData.commands).forEach(([catKey, category]) => {
    if (category.name) {
      category.name = i18n.t(`command_categories.${catKey}`);
    }
    if (category.description) {
      category.description = i18n.t(`category_descriptions.${catKey}`);
    }
    Object.entries(category.commands).forEach(([cmdKey, cmd]) => {
      if (cmd.name) {
        cmd.name = i18n.t(`command_definitions.${cmdKey}.name`);
      }
      if (cmd.description) {
        cmd.description = i18n.t(`command_definitions.${cmdKey}.description`);
      }
    });
  });
};
