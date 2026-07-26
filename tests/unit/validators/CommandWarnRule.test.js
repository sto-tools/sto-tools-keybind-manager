import { describe, expect, it, vi } from "vitest";

import CommandWarnRule from "../../../src/js/components/services/validators/CommandWarnRule.js";
import { flattenedCommands } from "../../../src/js/data.js";

describe("CommandWarnRule", () => {
  it("returns one localized warning issue from the module-owned command projection", () => {
    const rule = new CommandWarnRule({
      i18n: /** @type {any} */ ({
        t: (key) =>
          key === "spam_bar_warning"
            ? "Not recommended on spam bars as it interferes with firing cycles"
            : key,
      }),
    });

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

  it("uses only the explicitly injected translator for command warnings", () => {
    const previousI18n = Object.getOwnPropertyDescriptor(globalThis, "i18next");
    const ambientTranslate = vi.fn(() => "ambient translation");
    Object.defineProperty(globalThis, "i18next", {
      configurable: true,
      value: { t: ambientTranslate },
    });
    const translate = vi.fn((key) => {
      if (key === "command_definitions.fire_all.name") {
        return "Translated Fire All";
      }
      if (key === "spam_bar_warning") return "Translated warning";
      return key;
    });

    try {
      const issues = new CommandWarnRule({
        i18n: /** @type {any} */ ({ t: translate }),
      }).run({ commands: ["FireAll"] });

      expect(issues).toEqual([
        expect.objectContaining({
          defaultMessage: "Translated Fire All - Translated warning",
        }),
      ]);
      expect(translate).toHaveBeenCalledWith(
        "command_definitions.fire_all.name",
      );
      expect(translate).toHaveBeenCalledWith("spam_bar_warning");
      expect(ambientTranslate).not.toHaveBeenCalled();
    } finally {
      if (previousI18n) {
        Object.defineProperty(globalThis, "i18next", previousI18n);
      } else {
        Reflect.deleteProperty(globalThis, "i18next");
      }
    }
  });

  it("keeps command data fallbacks when no translator is injected", () => {
    const ambientTranslate = vi.fn(() => "ambient translation");
    const previousI18n = Object.getOwnPropertyDescriptor(globalThis, "i18next");
    Object.defineProperty(globalThis, "i18next", {
      configurable: true,
      value: { t: ambientTranslate },
    });

    try {
      const issues = new CommandWarnRule().run({ commands: ["FireAll"] });

      expect(issues).toEqual([
        expect.objectContaining({
          defaultMessage: "Fire All Weapons - spam_bar_warning",
        }),
      ]);
      expect(ambientTranslate).not.toHaveBeenCalled();
    } finally {
      if (previousI18n) {
        Object.defineProperty(globalThis, "i18next", previousI18n);
      } else {
        Reflect.deleteProperty(globalThis, "i18next");
      }
    }
  });
});
