import { describe, expect, it } from "vitest";

import CommandWarnRule from "../../../src/js/components/services/validators/CommandWarnRule.js";
import { flattenedCommands } from "../../../src/js/data.js";

describe("CommandWarnRule", () => {
  it("returns one warning issue from the module-owned command projection", () => {
    const rule = new CommandWarnRule();

    const ctx = { commands: ["FireAll"] };

    const issues = rule.run(ctx);

    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBe(1);
    expect(flattenedCommands.fire_all.warning).toBe("spam_bar_warning");
    issues.forEach((issue) => {
      expect(issue.severity).toBe("warning");
      expect(issue.defaultMessage).toBe(
        "Fire All Weapons - Not recommended on spam bars as it interferes with firing cycles",
      );
    });
  });
});
