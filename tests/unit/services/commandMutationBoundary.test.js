import { describe, expect, it } from "vitest";
import { currentCommandMutationEvent } from "../../../src/js/components/services/commandMutationBoundary.js";
import { createDataCoordinatorState } from "../../fixtures/core/componentState.js";

describe("Command mutation settlement projections", () => {
  const profile = {
    name: "Captain",
    builds: { space: { keys: { F1: ["PrimaryCurrent"] } } },
    aliases: { F1: { commands: ["AliasCurrent"] } },
    bindsets: { Weapons: { space: { keys: { F1: ["BindsetCurrent"] } } } },
  };
  const snapshot = createDataCoordinatorState({
    authorityEpoch: 40,
    revision: 3,
    currentProfile: "captain",
    currentEnvironment: "space",
    currentProfileData: profile,
    profiles: { captain: profile },
  });

  it.each([
    { kind: "primary", bindset: null, expected: ["PrimaryCurrent"] },
    { kind: "alias", bindset: null, expected: ["AliasCurrent"] },
    { kind: "bindset", bindset: "Weapons", expected: ["BindsetCurrent"] },
  ])(
    "rebases a late $kind notification without mutating accepted state",
    ({ kind, bindset, expected }) => {
      const plan = {
        target: { kind, environment: "space", key: "F1", bindset },
        event: {
          topic: "command-edited",
          payload: {
            key: "F1",
            index: 0,
            updatedCommand: "Old",
            commands: ["Old"],
          },
        },
      };
      const event = currentCommandMutationEvent(plan, snapshot, 1);
      expect(event.payload).toEqual({
        key: "F1",
        index: 0,
        updatedCommand: "Old",
        commands: expected,
      });
      event.payload.commands.push("CallerMutation");
      expect(snapshot.profiles.captain).toEqual(profile);
    },
  );

  it("preserves the original projection when no successor has committed", () => {
    const plan = {
      event: {
        topic: "command-deleted",
        payload: { key: "F1", index: 0, commands: ["OwnAccepted"] },
      },
    };
    expect(currentCommandMutationEvent(plan, snapshot, 2)).toBe(plan.event);
    expect(plan.event.payload.commands).toEqual(["OwnAccepted"]);
  });
});
