function hasSameCommands(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
  try {
    return JSON.stringify(actual) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

/**
 * Observe the compatibility signal that starts CommandChainUI's final
 * asynchronous render for one exact command projection. The UI listener is
 * registered during application startup, so this observer captures the row
 * that became stale when that render began.
 *
 * @param {{ on: (topic: string, handler: (payload: unknown) => void) => () => void }} eventBus
 * @param {unknown[]} expectedCommands
 * @param {Document} [document]
 */
export function observeCommandChainProjection(
  eventBus,
  expectedCommands,
  document = globalThis.document,
) {
  let publications = 0;
  let predecessor = null;
  const detach = eventBus.on("chain-data-changed", (payload) => {
    const commands =
      payload && typeof payload === "object" && "commands" in payload
        ? payload.commands
        : null;
    if (!hasSameCommands(commands, expectedCommands)) return;
    publications += 1;
    predecessor = document.querySelector('.command-item-row[data-index="0"]');
  });

  return {
    detach,
    wasPublished: () => publications > 0,
    predecessor: () => predecessor,
  };
}
