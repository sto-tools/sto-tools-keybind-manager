const VFX_ENVIRONMENTS = /** @type {const} */ (["space", "ground"]);

/**
 * @typedef {import('./serviceTypes.js').AliasDefinition} AliasDefinition
 * @typedef {import('../../types/events/base.js').VfxSettingsSnapshot} VfxSettingsSnapshot
 * @typedef {'space' | 'ground'} VFXEnvironment
 * @typedef {{
 *   commands: string[],
 *   description: string,
 *   type: 'vfx-alias',
 *   virtual: true
 * }} VirtualVFXAlias
 * @typedef {{
 *   translate?: (key: string, options?: Record<string, unknown>) => string,
 *   translateGeneratedMessages?: boolean
 * }} VFXAliasProjectionOptions
 */

/** @param {unknown} value @returns {string[]} */
function normalizeEffects(value) {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value.filter((effect) => typeof effect === "string" && effect.length > 0),
    ),
  ];
}

/**
 * Validate and detach persisted or broadcast VFX settings at the projection
 * boundary. Each environment is de-duplicated like VFXManagerService's Set
 * state; the same effect may still intentionally appear in both environments.
 *
 * @param {unknown} settings
 * @returns {VfxSettingsSnapshot}
 */
export function normalizeVFXSettings(settings) {
  const candidate =
    settings && typeof settings === "object"
      ? /** @type {{ selectedEffects?: { space?: unknown, ground?: unknown }, showPlayerSay?: unknown }} */ (
          settings
        )
      : {};

  return {
    selectedEffects: {
      space: normalizeEffects(candidate.selectedEffects?.space),
      ground: normalizeEffects(candidate.selectedEffects?.ground),
    },
    showPlayerSay: candidate.showPlayerSay === true,
  };
}

/**
 * Generate the STO command list for one environment or an ordered combination.
 *
 * @param {unknown} settings
 * @param {VFXEnvironment | VFXEnvironment[]} environments
 * @param {VFXAliasProjectionOptions} [options]
 * @returns {string[]}
 */
export function generateVFXAliasCommands(settings, environments, options = {}) {
  const normalized = normalizeVFXSettings(settings);
  const requested = Array.isArray(environments) ? environments : [environments];
  const effects = requested.flatMap((environment) =>
    VFX_ENVIRONMENTS.includes(environment)
      ? normalized.selectedEffects[environment]
      : [],
  );

  if (effects.length === 0) return [];

  const commands = [`dynFxSetFXExlusionList ${effects.join(",")}`];
  if (normalized.showPlayerSay) {
    const translate = options.translate || ((key) => key);
    const message = options.translateGeneratedMessages
      ? translate("vfx_suppression_loaded")
      : "VFX Suppression Loaded";
    commands.push(`PlayerSay ${message}`);
  }

  return commands;
}

/**
 * Project the three generated VFX aliases from explicit settings.
 *
 * @param {unknown} settings
 * @param {VFXAliasProjectionOptions} [options]
 * @returns {Record<string, VirtualVFXAlias>}
 */
export function projectVirtualVFXAliases(settings, options = {}) {
  const translate = options.translate || ((key) => key);
  /** @type {Array<[string, VirtualVFXAlias]>} */
  const entries = VFX_ENVIRONMENTS.map((environment) => {
    const label = environment.charAt(0).toUpperCase() + environment.slice(1);
    return [
      `dynFxSetFXExclusionList_${label}`,
      {
        commands: generateVFXAliasCommands(settings, environment, options),
        description: translate("vfx_suppression_for_environment", {
          environment,
        }),
        type: "vfx-alias",
        virtual: true,
      },
    ];
  });

  entries.push([
    "dynFxSetFXExclusionList_Combined",
    {
      commands: generateVFXAliasCommands(
        settings,
        [...VFX_ENVIRONMENTS],
        options,
      ),
      description: translate("vfx_suppression_for_all_environments"),
      type: "vfx-alias",
      virtual: true,
    },
  ]);

  return Object.fromEntries(entries);
}

/**
 * Combine detached user aliases with generated VFX aliases. Generated aliases
 * retain their historical precedence over a user alias using a reserved VFX
 * name.
 *
 * @param {Record<string, AliasDefinition> | null | undefined} userAliases
 * @param {unknown} settings
 * @param {VFXAliasProjectionOptions} [options]
 * @returns {Record<string, AliasDefinition | VirtualVFXAlias>}
 */
export function projectCombinedAliases(userAliases, settings, options = {}) {
  const detachedUserEntries = Object.entries(userAliases || {}).map(
    ([name, alias]) => [
      name,
      typeof structuredClone === "function"
        ? structuredClone(alias)
        : {
            ...alias,
            ...(Array.isArray(alias?.commands)
              ? { commands: [...alias.commands] }
              : {}),
          },
    ],
  );

  return Object.fromEntries([
    ...detachedUserEntries,
    ...Object.entries(projectVirtualVFXAliases(settings, options)),
  ]);
}
