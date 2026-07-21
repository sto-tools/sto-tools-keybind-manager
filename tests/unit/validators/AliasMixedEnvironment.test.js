import { describe, expect, it } from "vitest";

import AliasMixedEnvironmentRule from "../../../src/js/components/services/validators/AliasMixedEnvironment.js";
import { flattenedCommands } from "../../../src/js/data.js";

describe("AliasMixedEnvironmentRule", () => {
  it("detects mixed environments from the module-owned command projection", () => {
    const rule = new AliasMixedEnvironmentRule();

    expect(flattenedCommands.fire_all.environment).toBe("space");
    expect(flattenedCommands.aim.environment).toBe("ground");
    expect(
      rule.validate({ isAlias: true, commands: ["FireAll", "aim"] }),
    ).toEqual({
      severity: "warning",
      key: "alias_mixed_environment_warning",
      defaultMessage:
        "Alias contains both space-only and ground-only commands; consider splitting for reliability.",
    });
  });

  it("does not flag a single-environment or non-alias chain", () => {
    const rule = new AliasMixedEnvironmentRule();

    expect(
      rule.validate({ isAlias: true, commands: ["FireAll", "FirePhasers"] }),
    ).toBeNull();
    expect(
      rule.validate({ isAlias: false, commands: ["FireAll", "aim"] }),
    ).toBeNull();
  });
});
