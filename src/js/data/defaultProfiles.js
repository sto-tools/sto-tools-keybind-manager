/**
 * Built-in profiles are static application data. Their insertion order is
 * observable because DataCoordinator activates the first profile on a fresh
 * install.
 *
 * @satisfies {Record<string, import('../components/services/serviceTypes.js').ProfileData>}
 */
const defaultProfiles = {
  default: {
    name: "Default",
    description: "Default keybind configuration",
    currentEnvironment: "space",
    builds: {
      space: {
        keys: {
          Space: [
            "+TrayExecByTray 8 0",
            "+TrayExecByTray 8 1",
            "+TrayExecByTray 8 2",
            "+TrayExecByTray 8 3",
            "+TrayExecByTray 8 4",
            "+TrayExecByTray 8 5",
            "+TrayExecByTray 8 6",
            "+TrayExecByTray 8 7",
            "+TrayExecByTray 8 8",
            "+TrayExecByTray 8 9",
          ],
          F1: [
            "+TrayExecByTray 9 0",
            "+TrayExecByTray 9 1",
            "+TrayExecByTray 9 2",
            "+TrayExecByTray 9 3",
            "+TrayExecByTray 9 4",
            "+TrayExecByTray 9 5",
            "+TrayExecByTray 9 6",
            "+TrayExecByTray 9 7",
            "+TrayExecByTray 9 8",
            "+TrayExecByTray 9 9",
          ],
          F2: [
            "+TrayExecByTray 3 0",
            "+TrayExecByTray 3 1",
            "+TrayExecByTray 3 2",
            "+TrayExecByTray 3 3",
            "+TrayExecByTray 3 4",
          ],
          F3: [
            "+TrayExecByTray 3 5",
            "+TrayExecByTray 3 6",
            "+TrayExecByTray 3 7",
            "+TrayExecByTray 3 8",
            "+TrayExecByTray 3 9",
          ],
          F4: [
            "+TrayExecByTray 4 0",
            "+TrayExecByTray 4 1",
            "+TrayExecByTray 4 2",
            "+TrayExecByTray 4 3",
            "+TrayExecByTray 4 4",
          ],
          F5: [
            "+TrayExecByTray 4 5",
            "+TrayExecByTray 4 6",
            "+TrayExecByTray 4 7",
            "+TrayExecByTray 4 8",
            "+TrayExecByTray 4 9",
          ],
          Z: [
            "+TrayExecByTray 6 0",
            "+TrayExecByTray 6 1",
            "+TrayExecByTray 6 2",
            "+TrayExecByTray 6 3",
            "+TrayExecByTray 6 4",
          ],
          C: [
            "+TrayExecByTray 6 5",
            "+TrayExecByTray 6 6",
            "+TrayExecByTray 6 7",
            "+TrayExecByTray 6 8",
            "+TrayExecByTray 6 9",
          ],
          "`": ["Target_Enemy_Near_ForArc 90", "PlayerSay Target Arc=90"],
          "Alt+`": ["Target_Enemy_Near_ForArc 180", "PlayerSay Target Arc=180"],
          LSHIFT: ["FireAll"],
          F9: ["dynFxSetFXExclusionList_Space"],
          F10: ["toggle_combatlog"],
          F11: ["bind_load_file Default_space.txt"],
          numpad0: ["toggle_default_auto_attack_off"],
          numpad1: ["toggle_default_auto_attack_on"],
        },
      },
      ground: {
        keys: {
          X: [
            "+TrayExecByTray 7 0",
            "+TrayExecByTray 7 1",
            "+TrayExecByTray 7 2",
            "+TrayExecByTray 7 3",
            "+TrayExecByTray 7 4",
            "+TrayExecByTray 7 5",
            "+TrayExecByTray 7 6",
            "+TrayExecByTray 7 7",
            "+TrayExecByTray 7 8",
            "+TrayExecByTray 7 9",
          ],
          F1: [
            "+TrayExecByTray 6 0",
            "+TrayExecByTray 6 1",
            "+TrayExecByTray 6 2",
          ],
          F2: [
            "+TrayExecByTray 6 3",
            "+TrayExecByTray 6 4",
            "+TrayExecByTray 6 5",
          ],
          F3: [
            "+TrayExecByTray 6 6",
            "+TrayExecByTray 6 7",
            "+TrayExecByTray 6 8",
            "+TrayExecByTray 6 9",
          ],
          T: [
            "+TrayExecByTray 5 0",
            "+TrayExecByTray 5 1",
            "+TrayExecByTray 5 2",
            "+TrayExecByTray 5 3",
            "+TrayExecByTray 5 4",
          ],
          Y: [
            "+TrayExecByTray 5 5",
            "+TrayExecByTray 5 6",
            "+TrayExecByTray 5 7",
            "+TrayExecByTray 5 8",
            "+TrayExecByTray 5 9",
          ],
          F9: ["dynFxSetFXExclusionList_Ground"],
          F10: ["toggle_combatlog"],
          F11: ["bind_load_file Default_ground.txt"],
        },
      },
      alias: {
        keys: {},
      },
    },
    aliases: {
      toggle_combatlog: {
        commands: ["toggle_combatlog_on"],
        description: "",
      },
      toggle_combatlog_off: {
        commands: [
          "combatlog 0",
          "PlayerSay Toggle Combat Log: Off",
          'alias toggle_combatlog "toggle_combatlog_on"',
          "combatlog",
        ],
        description: "",
      },
      toggle_combatlog_on: {
        commands: [
          "combatlog 1",
          "PlayerSay Toggle Combat Log: On",
          'alias toggle_combatlog "toggle_combatlog_off"',
          "combatlog",
        ],
        description: "",
      },
      toggle_default_auto_attack: {
        commands: ["toggle_default_auto_attack_on"],
        description: "",
      },
      toggle_default_auto_attack_off: {
        commands: [
          "defaultautoattack 0",
          "PlayerSay Toggle Default Auto Attack: Off",
          'alias toggle_default_auto_attack "toggle_default_auto_attack_on"',
        ],
        description: "",
      },
      toggle_default_auto_attack_on: {
        commands: [
          "defaultautoattack 1",
          "PlayerSay Toggle Default Auto Attack: On",
          'alias toggle_default_auto_attack "toggle_default_auto_attack_off"',
        ],
        description: "",
      },
    },
    created: "2025-07-11T00:19:39.458Z",
    lastModified: "2025-07-11T02:01:08.466Z",
    migrationVersion: "2.0.0",
    id: "default_space",
    keybindMetadata: {
      space: {
        Space: {
          stabilizeExecutionOrder: true,
        },
        F1: {
          stabilizeExecutionOrder: true,
        },
        F2: {
          stabilizeExecutionOrder: true,
        },
        F3: {
          stabilizeExecutionOrder: true,
        },
        F4: {
          stabilizeExecutionOrder: true,
        },
        F5: {
          stabilizeExecutionOrder: true,
        },
        Z: {
          stabilizeExecutionOrder: true,
        },
        C: {
          stabilizeExecutionOrder: true,
        },
      },
      ground: {
        X: {
          stabilizeExecutionOrder: true,
        },
        F3: {
          stabilizeExecutionOrder: true,
        },
        F2: {
          stabilizeExecutionOrder: true,
        },
        F1: {
          stabilizeExecutionOrder: true,
        },
        T: {
          stabilizeExecutionOrder: true,
        },
        Y: {
          stabilizeExecutionOrder: true,
        },
      },
    },
    aliasMetadata: {},
    selections: {
      space: "F1",
      alias: "toggle_combatlog",
      ground: "F1",
    },
    vertigoSettings: {
      selectedEffects: {
        space: [],
        ground: [],
      },
      showPlayerSay: true,
    },
  },
};

/**
 * @param {unknown} value
 * @returns {value is import('../components/services/serviceTypes.js').ProfileData}
 */
function isProfileData(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const profile = /** @type {Record<string, unknown>} */ (value);
  if (typeof profile.name !== "string" || !profile.name.trim()) return false;
  if (
    profile.description !== undefined &&
    typeof profile.description !== "string"
  ) {
    return false;
  }
  if (
    profile.currentEnvironment !== undefined &&
    typeof profile.currentEnvironment !== "string"
  ) {
    return false;
  }
  if (
    profile.builds !== undefined &&
    (typeof profile.builds !== "object" ||
      profile.builds === null ||
      Array.isArray(profile.builds))
  ) {
    return false;
  }

  return true;
}

/**
 * Validate a default-profile dictionary before a consumer normalizes or
 * persists it. This intentionally preserves the existing shallow selection
 * contract: the outer record is new, while accepted profile values retain
 * their identity until DataCoordinator detaches them for persistence.
 *
 * Omitting `profiles` selects the built-in catalog. Passing `undefined`
 * explicitly preserves the legacy absent-source result.
 *
 * @param {Record<string, unknown> | null | undefined} [profiles]
 * @returns {Record<string, import('../components/services/serviceTypes.js').ProfileData>}
 */
export function getDefaultProfiles(profiles) {
  const source = arguments.length === 0 ? defaultProfiles : profiles;
  /** @type {Record<string, import('../components/services/serviceTypes.js').ProfileData>} */
  const result = {};
  for (const [profileId, profile] of Object.entries(source || {})) {
    if (isProfileData(profile)) result[profileId] = profile;
  }

  return result;
}

export default defaultProfiles;
