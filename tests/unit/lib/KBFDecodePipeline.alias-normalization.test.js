import { beforeEach, describe, expect, it, vi } from "vitest";
import { KBFDecodePipeline } from "../../../src/js/lib/kbf/parsers/KBFDecodePipeline.js";
import { ActivityTranslator } from "../../../src/js/lib/kbf/translation/ActivityTranslator.js";

describe("KBFDecodePipeline - Alias Normalization", () => {
  let pipeline;

  beforeEach(() => {
    const decoder = {
      addError: vi.fn(),
      addWarning: vi.fn(),
    };

    pipeline = new KBFDecodePipeline({
      decoder,
      fieldParser: {},
      activityTranslator: {},
      parseState: {},
    });
  });

  it.each([
    {
      activity: 97,
      aliasName: "sto_kb_emotecycle_F1_2",
      command: "emote_notext wave",
    },
    {
      activity: 101,
      aliasName: "sto_kb_emotecyclevisible_F1_2",
      command: "emote wave",
    },
  ])(
    "should preserve activity $activity alias objects as named pipeline aliases",
    ({ activity, aliasName, command }) => {
      const translator = new ActivityTranslator();
      const translation = translator.translateActivity(activity, {
        text: "wave",
        baseKeyName: "F1",
        index: 2,
      });

      const result = pipeline.normalizeTranslationResult(translation);

      expect(result.commands).toEqual([aliasName]);
      expect(result.aliases).toEqual([
        {
          name: aliasName,
          steps: [`${aliasName}_step0`],
          currentIndex: 0,
        },
        {
          name: `${aliasName}_step0`,
          commands: [command],
          next: `${aliasName}_step0`,
        },
      ]);
    },
  );

  it("should preserve the existing array alias shape", () => {
    const alias = {
      name: "legacy_alias",
      commands: ["FireAll"],
    };

    const result = pipeline.normalizeTranslationResult({
      commands: ["legacy_alias"],
      aliases: [alias],
    });

    expect(result.aliases).toEqual([alias]);
  });
});
