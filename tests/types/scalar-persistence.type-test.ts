import type { CommandPresentationPersistencePort } from "../../src/js/components/storage/CommandPresentationPersistencePort.js";
import type { KeyBrowserPersistencePort } from "../../src/js/components/storage/KeyBrowserPersistencePort.js";
import type { VisitedStatePort } from "../../src/js/components/storage/VisitedStatePort.js";
import type { DevelopmentFlagPort } from "../../src/js/components/storage/DevelopmentFlagPort.js";

function scalarContracts(
  command: CommandPresentationPersistencePort,
  key: KeyBrowserPersistencePort,
  visited: VisitedStatePort,
  development: DevelopmentFlagPort,
) {
  command.replaceCategory("system", true);
  command.replaceGroup("pivot", false);
  key.replaceMode("grid");
  key.replaceCategory("weapons", "command", false);
  key.replaceBindset("Away Team", true);
  visited.compensate("true", null);
  development.isEnabled();

  // @ts-expect-error Domain ports have no arbitrary key writer.
  command.setItem("sto_keybind_manager", "{}");
  // @ts-expect-error Collapse state is boolean, never an arbitrary stored string.
  command.replaceCategory("system", "true");
  // @ts-expect-error Group names are the closed command group contract.
  command.replaceGroup("settings", true);
  // @ts-expect-error Browser view modes are a closed domain contract.
  key.replaceMode("sto_keybind_settings");
  // @ts-expect-error Key-browser persistence cannot write profiles.
  key.replaceProfile({ name: "Captain" });
  // @ts-expect-error Visit compensation restores an exact scalar only.
  visited.compensate("true", {});
  // @ts-expect-error Development diagnostics have no write capability.
  development.markVisited();
  // @ts-expect-error Development flag reads do not accept keys.
  development.isEnabled("sto_keybind_manager");
}

void scalarContracts;
