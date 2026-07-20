import { generateBindToAliasName } from "../../lib/aliasNameValidator.js";

/**
 * @typedef {'before-pre-pivot' | 'in-pivot-group'} CommandPlacement
 * @typedef {{
 *   command: string,
 *   placement?: CommandPlacement,
 *   palindromicGeneration?: boolean,
 * }} RichPreviewCommand
 * @typedef {string | RichPreviewCommand} PreviewCommand
 * @typedef {{
 *   type: 'literal',
 *   text: string
 * } | {
 *   type: 'translation',
 *   key: 'invalid_key_name_for_alias_generation' | 'error_generating_alias_preview',
 *   options: Readonly<{ defaultValue: string }>
 * }} CommandChainPreviewContent
 * @typedef {{
 *   destination: 'generatedAlias' | 'commandPreview',
 *   request: Readonly<{ commands: readonly Readonly<RichPreviewCommand>[] }>,
 *   template: Readonly<{ prefix: string, suffix: string }> | null
 * }} CommandChainPreviewMirroring
 * @typedef {{
 *   labelKey: 'generated_alias' | 'generated_command',
 *   commandPreview: string,
 *   generatedAlias: Readonly<{
 *     visible: boolean,
 *     content: CommandChainPreviewContent
 *   }>,
 *   mirroring: CommandChainPreviewMirroring | null,
 *   diagnostic: 'alias-name-generation-failed' | 'alias-preview-generation-failed' | 'mirroring-projection-failed' | null
 * }} CommandChainPreviewPlan
 * @typedef {{
 *   type: 'empty',
 *   messageKey: 'nothing_to_copy',
 *   toastType: 'warning'
 * } | {
 *   type: 'copy',
 *   text: string
 * }} PreviewClipboardPlan
 * @typedef {{
 *   toastType: 'success' | 'error',
 *   messageKey: string
 * }} PreviewClipboardResult
 */

/** @param {string} text @returns {CommandChainPreviewContent} */
function literalContent(text) {
  return Object.freeze({ type: "literal", text });
}

/**
 * @param {'invalid_key_name_for_alias_generation' | 'error_generating_alias_preview'} key
 * @param {string} defaultValue
 * @returns {CommandChainPreviewContent}
 */
function translationContent(key, defaultValue) {
  return Object.freeze({
    type: "translation",
    key,
    options: Object.freeze({ defaultValue }),
  });
}

/**
 * Copy one projection content value so settled results never retain mutable
 * caller-owned objects.
 * @param {CommandChainPreviewContent} content
 * @returns {CommandChainPreviewContent}
 */
function cloneContent(content) {
  return content.type === "translation"
    ? translationContent(content.key, content.options.defaultValue)
    : literalContent(content.text);
}

/**
 * @param {CommandChainPreviewMirroring | null} mirroring
 * @returns {CommandChainPreviewMirroring | null}
 */
function cloneMirroring(mirroring) {
  if (!mirroring) return null;
  const commands = Object.freeze(
    mirroring.request.commands.map((command) => {
      /** @type {RichPreviewCommand} */
      const detached = { command: command.command };
      if (Object.hasOwn(command, "placement")) {
        detached.placement = command.placement;
      }
      if (Object.hasOwn(command, "palindromicGeneration")) {
        detached.palindromicGeneration = command.palindromicGeneration;
      }
      return Object.freeze(detached);
    }),
  );
  return Object.freeze({
    destination: mirroring.destination,
    request: Object.freeze({ commands }),
    template: mirroring.template
      ? Object.freeze({
          prefix: mirroring.template.prefix,
          suffix: mirroring.template.suffix,
        })
      : null,
  });
}

/**
 * @param {CommandChainPreviewPlan} projection
 * @returns {Readonly<CommandChainPreviewPlan>}
 */
function freezePreviewProjection(projection) {
  return Object.freeze({
    labelKey: projection.labelKey,
    commandPreview: projection.commandPreview,
    generatedAlias: Object.freeze({
      visible: projection.generatedAlias.visible,
      content: cloneContent(projection.generatedAlias.content),
    }),
    mirroring: cloneMirroring(projection.mirroring),
    diagnostic: projection.diagnostic,
  });
}

/**
 * @param {PreviewCommand[]} commands
 * @returns {string}
 */
function formatCommandChain(commands) {
  return commands
    .map((command) => (typeof command === "string" ? command : command.command))
    .filter(Boolean)
    .join(" $$ ");
}

/**
 * @param {string | null | undefined} selectedName
 * @param {string} environment
 * @param {string} commandString
 */
function formatCommandPreview(selectedName, environment, commandString) {
  if (!selectedName) return "";
  return environment === "alias"
    ? `alias ${selectedName} <& ${commandString} &>`
    : `${selectedName} "${commandString}"`;
}

/**
 * @param {'generatedAlias' | 'commandPreview'} destination
 * @param {PreviewCommand[]} commands
 * @param {{ prefix: string, suffix: string } | null} template
 * @returns {CommandChainPreviewMirroring | null}
 */
function createMirroring(destination, commands, template) {
  try {
    return cloneMirroring({
      destination,
      request: { commands: projectMirroringCommands(commands) },
      template,
    });
  } catch {
    return null;
  }
}

/**
 * Format one bind-to-alias preview without consulting service, UI, or storage
 * state. Malformed command entries retain the historical empty-chain fallback.
 *
 * @param {string | null | undefined} aliasName
 * @param {unknown} commands
 * @returns {string}
 */
export function formatCommandChainAliasPreview(aliasName, commands) {
  if (!aliasName) return "";

  const emptyPreview = `alias ${aliasName} <&  &>`;
  try {
    if (!Array.isArray(commands)) return emptyPreview;

    const commandStrings = commands
      .map((command) => {
        if (command === null || command === undefined) return "";
        if (typeof command === "string") return command;
        return (
          /** @type {{ command?: unknown }} */ (Object(command)).command || ""
        );
      })
      .filter(Boolean);

    if (commandStrings.length === 0) return emptyPreview;
    return `alias ${aliasName} <& ${commandStrings.join(" $$ ")} &>`;
  } catch {
    return emptyPreview;
  }
}

/**
 * Preserve the exact command fields accepted by the retained mirroring RPC.
 * Sparse entries are removed by the historical filter step.
 *
 * @param {Array<string | RichPreviewCommand>} commands
 * @returns {RichPreviewCommand[]}
 */
export function projectMirroringCommands(commands) {
  return commands
    .map((command) =>
      typeof command === "string"
        ? { command }
        : {
            command: command.command,
            placement: command.placement,
            palindromicGeneration: command.palindromicGeneration,
          },
    )
    .filter(Boolean);
}

/**
 * Plan the complete command-chain preview from already accepted render state.
 * The plan contains only inert copy plus the optional request payload needed to
 * obtain stabilized display text; it never reads DOM, cache, transport, or
 * application-global state.
 *
 * @param {{
 *   environment?: string,
 *   selectedName?: string | null,
 *   bindset?: string | null,
 *   bindToAliasMode?: boolean,
 *   stabilized?: boolean,
 *   commands?: PreviewCommand[]
 * }} [input]
 * @returns {Readonly<CommandChainPreviewPlan>}
 */
export function createCommandChainPreviewPlan({
  environment = "space",
  selectedName = null,
  bindset = null,
  bindToAliasMode = false,
  stabilized = false,
  commands = [],
} = {}) {
  const labelKey =
    environment === "alias" ? "generated_alias" : "generated_command";

  if (bindToAliasMode && selectedName && environment !== "alias") {
    let aliasName = null;
    /** @type {CommandChainPreviewPlan['diagnostic']} */
    let diagnostic = null;
    try {
      aliasName = generateBindToAliasName(environment, selectedName, bindset);
    } catch {
      diagnostic = "alias-name-generation-failed";
    }

    if (!aliasName) {
      return freezePreviewProjection({
        labelKey,
        commandPreview: `${selectedName} "..."`,
        generatedAlias: {
          visible: true,
          content: translationContent(
            "invalid_key_name_for_alias_generation",
            "Invalid key name for alias generation",
          ),
        },
        mirroring: null,
        diagnostic,
      });
    }

    try {
      const localAliasPreview = formatCommandChainAliasPreview(
        aliasName,
        commands,
      );
      const shouldMirror = Boolean(stabilized) && commands.length > 1;
      const mirroring = shouldMirror
        ? createMirroring("generatedAlias", commands, {
            prefix: `alias ${aliasName} <& `,
            suffix: " &>",
          })
        : null;

      return freezePreviewProjection({
        labelKey,
        commandPreview: `${selectedName} "${aliasName}"`,
        generatedAlias: {
          visible: true,
          content: literalContent(localAliasPreview),
        },
        mirroring,
        diagnostic:
          shouldMirror && !mirroring
            ? "mirroring-projection-failed"
            : diagnostic,
      });
    } catch {
      return freezePreviewProjection({
        labelKey,
        commandPreview: `${selectedName} "..."`,
        generatedAlias: {
          visible: true,
          content: translationContent(
            "error_generating_alias_preview",
            "Error generating alias preview",
          ),
        },
        mirroring: null,
        diagnostic: "alias-preview-generation-failed",
      });
    }
  }

  const commandString = formatCommandChain(commands);
  const commandPreview = formatCommandPreview(
    selectedName,
    environment,
    commandString,
  );
  const shouldMirror = Boolean(stabilized) && commands.length > 1;
  const template = selectedName
    ? environment === "alias"
      ? { prefix: `alias ${selectedName} <& `, suffix: " &>" }
      : { prefix: `${selectedName} "`, suffix: '"' }
    : null;
  const mirroring = shouldMirror
    ? createMirroring("commandPreview", commands, template)
    : null;

  return freezePreviewProjection({
    labelKey,
    commandPreview,
    generatedAlias: {
      visible: false,
      content: literalContent(""),
    },
    mirroring,
    diagnostic:
      shouldMirror && !mirroring ? "mirroring-projection-failed" : null,
  });
}

/**
 * Settle the optional mirroring step without mutating the fallback plan. Empty
 * replies retain the exact local preview, matching the historical UI behavior.
 *
 * @param {CommandChainPreviewPlan} plan
 * @param {unknown} mirroredText
 * @returns {Readonly<CommandChainPreviewPlan>}
 */
export function settleCommandChainPreview(plan, mirroredText) {
  const mirroring = plan.mirroring;
  const settled = {
    ...plan,
    mirroring: null,
  };
  if (!mirroring || !mirroredText || !mirroring.template) {
    return freezePreviewProjection(settled);
  }

  const text = `${mirroring.template.prefix}${String(mirroredText)}${mirroring.template.suffix}`;
  if (mirroring.destination === "generatedAlias") {
    settled.generatedAlias = {
      visible: plan.generatedAlias.visible,
      content: literalContent(text),
    };
  } else {
    settled.commandPreview = text;
  }
  return freezePreviewProjection(settled);
}

/**
 * Capture exactly what the clipboard action may copy from DOM text content.
 * Outer whitespace is removed while all interior preview formatting survives.
 *
 * @param {unknown} textContent
 * @returns {Readonly<PreviewClipboardPlan>}
 */
export function planPreviewClipboardCopy(textContent) {
  const text = typeof textContent === "string" ? textContent.trim() : "";
  return text
    ? Object.freeze({ type: "copy", text })
    : Object.freeze({
        type: "empty",
        messageKey: "nothing_to_copy",
        toastType: "warning",
      });
}

/**
 * Project the typed clipboard-owner result into translated toast intent.
 * Missing or empty message keys retain the historical success/error fallbacks.
 *
 * @param {unknown} result
 * @returns {Readonly<PreviewClipboardResult>}
 */
export function projectPreviewClipboardResult(result) {
  const candidate =
    typeof result === "object" && result !== null
      ? /** @type {{ success?: unknown, message?: unknown }} */ (result)
      : null;
  const success = candidate?.success === true;
  const fallback = success
    ? "content_copied_to_clipboard"
    : "failed_to_copy_to_clipboard";
  const messageKey =
    typeof candidate?.message === "string" && candidate.message
      ? candidate.message
      : fallback;

  return Object.freeze({
    toastType: success ? "success" : "error",
    messageKey,
  });
}
