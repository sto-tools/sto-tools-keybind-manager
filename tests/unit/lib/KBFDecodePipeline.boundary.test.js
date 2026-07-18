import { describe, expect, it } from "vitest";

import { decodeKBFParseResult } from "../../../src/js/components/services/kbfDataBoundary.js";
import { KBFParser } from "../../../src/js/lib/KBFParser.js";
import { KBFDecodePipeline } from "../../../src/js/lib/kbf/parsers/KBFDecodePipeline.js";

const encode = (value) => Buffer.from(value, "utf8").toString("base64");

const activity = ({
  id,
  text,
  n1,
  n2,
  n3,
  order,
  orderField = "Order",
} = {}) => {
  const fields = [`Activity:${id ?? 1}`];
  if (text !== undefined) fields.push(`Text:${text}`);
  if (n1 !== undefined) fields.push(`N1:${n1}`);
  if (n2 !== undefined) fields.push(`N2:${n2}`);
  if (n3 !== undefined) fields.push(`N3:${n3}`);
  if (order !== undefined) fields.push(`${orderField}:${order}`);
  return encode(`${fields.join(";")};`);
};

const key = ({ name, combo = "", activities = [activity()] }) =>
  encode(
    `Key:${name};Control:0;Alt:0;Shift:0;Combo:${combo};${activities
      .map((value) => `ACT:${value};`)
      .join("")}`,
  );

const file = ({ name = "Master", keys }) =>
  encode(
    `GROUPSET:1;KEYSET:${encode(
      `Name:${name};${keys.map((value) => `KEY:${value};`).join("")}`,
    )};`,
  );

const multiBindsetFile = (bindsets) =>
  encode(
    `GROUPSET:1;${bindsets
      .map(
        ({ name, keys }) =>
          `KEYSET:${encode(
            `Name:${name};${keys.map((value) => `KEY:${value};`).join("")}`,
          )};`,
      )
      .join("")}`,
  );

const parse = (content) =>
  new KBFParser({ eventBus: { emit() {} } }).parseFile(content, {
    targetEnvironment: "space",
    includeMetadata: true,
  });

describe("KBF nested-data boundary", () => {
  it.each([
    ["invalid outer payload", "not-base64", []],
    ["layer 2 without a keyset", encode("GROUPSET:1;"), [1]],
    [
      "invalid layer 3 payload",
      encode("GROUPSET:1;KEYSET:not-base64;"),
      [1, 2],
    ],
    [
      "invalid layer 4 payload",
      encode(`GROUPSET:1;KEYSET:${encode("Name:Master;KEY:not-base64;")};`),
      [1, 2, 3],
    ],
    [
      "invalid layer 5 payload",
      file({
        keys: [encode("Key:F1;Control:0;Alt:0;Shift:0;Combo:;ACT:not-base64;")],
      }),
      [1, 2, 3, 4],
    ],
    [
      "complete parser path",
      file({ keys: [key({ name: "F1" })] }),
      [1, 2, 3, 4, 5],
    ],
  ])("reports only completed layers for %s", (_label, content, expected) => {
    expect(parse(content).stats.processedLayers).toEqual(expected);
  });

  it("reports layer 6 only after the layer decoder is invoked", () => {
    const parseState = { errors: [], warnings: [] };
    const pipeline = new KBFDecodePipeline({
      decoder: {
        options: { validateUtf8: true },
        addError() {},
        addWarning() {},
      },
      fieldParser: {},
      activityTranslator: {},
      parseState,
    });

    expect(
      pipeline.finalizeResult(pipeline.createEmptyResult()).stats
        .processedLayers,
    ).toEqual([]);
    expect(pipeline.decodeLayer6(encode("text"))).toBe("text");
    expect(
      pipeline.finalizeResult(pipeline.createEmptyResult()).stats
        .processedLayers,
    ).toEqual([6]);
  });

  it("keeps prototype-like key tokens out of parser-owned maps", () => {
    const originalPrototype = Object.getPrototypeOf({});
    const result = parse(file({ keys: [key({ name: "__proto__" })] }));

    expect(result.bindsets.master.keys).toEqual({});
    expect(Object.getPrototypeOf(result.bindsets.master.keys)).toBe(
      originalPrototype,
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fatal: true,
          path: "$.bindsets.master.keys.__proto__",
        }),
      ]),
    );
  });

  it("rejects canonical key collisions instead of silently overwriting", () => {
    const result = parse(
      file({ keys: [key({ name: "SPACE" }), key({ name: "Space" })] }),
    );

    expect(Object.keys(result.bindsets.master.keys)).toEqual(["Space"]);
    expect(result.stats.totalKeys).toBe(1);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fatal: true,
          path: "$.bindsets.master.keys.Space",
        }),
      ]),
    );
  });

  it("carries decoded combo tokens into the canonical key", () => {
    const combo = [encode("Alt"), encode("f1")].join("*");
    const result = parse(file({ keys: [key({ name: "G", combo })] }));

    expect(result.bindsets.master.keys).toHaveProperty("G+ALT+F1");
  });

  it.each([
    ["a malformed segment", `${encode("Alt")}*not.base64`],
    ["invalid UTF-8", Buffer.from([0xc3, 0x28]).toString("base64")],
    ["an unknown key token", encode("NotARealKey")],
    ["a line break", encode("Alt\r\nF2")],
    ["a NUL byte", "AA=="],
    [
      "more than ten segments",
      Array.from({ length: 11 }, (_, index) => encode(`F${index + 1}`)).join(
        "*",
      ),
    ],
  ])("fails closed when a combo contains %s", (_label, combo) => {
    const result = parse(file({ keys: [key({ name: "G", combo })] }));

    expect(result.bindsets.master.keys).toEqual({});
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ fatal: true })]),
    );
    expect(decodeKBFParseResult(result)).toMatchObject({
      success: false,
      error: "invalid_kbf_parse_result",
    });
  });

  it("gives generated cycle aliases key- and activity-specific names", () => {
    const cycle = activity({ id: 97, text: encode("wave") });
    const result = parse(
      file({
        keys: [
          key({ name: "F1", activities: [cycle] }),
          key({ name: "F2", activities: [cycle] }),
        ],
      }),
    );

    expect(Object.keys(result.aliases)).toEqual([
      "sto_kb_emotecycle_master_f1_0",
      "sto_kb_emotecycle_master_f1_0_step0",
      "sto_kb_emotecycle_master_f2_0",
      "sto_kb_emotecycle_master_f2_0_step0",
    ]);
    expect(result.stats.totalAliases).toBe(4);
  });

  it("keeps same-key cycle aliases unique across bindsets and activity indexes", () => {
    const activities = [
      activity({ id: 97, text: encode("wave") }),
      activity({ id: 101, text: encode("dance") }),
    ];
    const result = parse(
      multiBindsetFile([
        { name: "Master", keys: [key({ name: "F1", activities })] },
        { name: "Secondary", keys: [key({ name: "F1", activities })] },
      ]),
    );

    expect(Object.keys(result.aliases)).toEqual([
      "sto_kb_emotecycle_master_f1_0",
      "sto_kb_emotecycle_master_f1_0_step0",
      "sto_kb_emotecyclevisible_master_f1_1",
      "sto_kb_emotecyclevisible_master_f1_1_step0",
      "sto_kb_emotecycle_secondary_f1_0",
      "sto_kb_emotecycle_secondary_f1_0_step0",
      "sto_kb_emotecyclevisible_secondary_f1_1",
      "sto_kb_emotecyclevisible_secondary_f1_1_step0",
    ]);
    expect(result.stats.totalAliases).toBe(8);
    expect(result.errors).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "Generated KBF aliases collide" }),
      ]),
    );
  });

  it("marks unsafe numeric expansion ranges as fatal without expanding them", () => {
    const result = parse(
      file({
        keys: [
          key({
            name: "F1",
            activities: [activity({ id: 95, n1: 0, n2: 0, n3: 10 })],
          }),
        ],
      }),
    );

    expect(result.bindsets.master.keys.F1.commands).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ fatal: true })]),
    );
  });

  it("rejects unsafe integers before activity translation", () => {
    const result = parse(
      file({
        keys: [
          key({
            name: "F1",
            activities: [
              activity({ id: 95, n1: 0, n2: 0, n3: "9007199254740992" }),
            ],
          }),
        ],
      }),
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "N3 field must be a safe integer",
          fatal: true,
        }),
      ]),
    );
  });

  it("rejects invalid UTF-8 text when strict decoding is enabled", () => {
    const invalidUtf8 = Buffer.from([0xc3, 0x28]).toString("base64");
    const result = parse(
      file({
        keys: [
          key({
            name: "F1",
            activities: [activity({ id: 96, text: invalidUtf8 })],
          }),
        ],
      }),
    );

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Text field contains invalid UTF-8 data",
          fatal: true,
        }),
      ]),
    );
    expect(result.bindsets.master.keys.F1.commands).toEqual([]);
    expect(decodeKBFParseResult(result)).toMatchObject({
      success: false,
      error: "invalid_kbf_parse_result",
    });
  });

  it("rejects malformed Base64 text before activity translation", () => {
    const result = parse(
      file({
        keys: [
          key({
            name: "F1",
            activities: [activity({ id: 96, text: "not.base64" })],
          }),
        ],
      }),
    );

    expect(result.bindsets.master.keys.F1.commands).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Text field contains invalid Base64 data",
          fatal: true,
        }),
      ]),
    );
    expect(decodeKBFParseResult(result)).toMatchObject({
      success: false,
      error: "invalid_kbf_parse_result",
    });
  });

  it("rejects a negative O execution order without clamping it", () => {
    const result = parse(
      file({
        keys: [
          key({
            name: "F1",
            activities: [activity({ id: 1, order: -2, orderField: "O" })],
          }),
        ],
      }),
    );

    expect(result.bindsets.master.keys.F1.commands).toEqual([]);
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("minimum"),
        }),
      ]),
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Invalid KBF activity semantics",
          fatal: true,
          path: expect.stringMatching(/\.order$/),
        }),
      ]),
    );
    expect(decodeKBFParseResult(result)).toMatchObject({
      success: false,
      error: "invalid_kbf_parse_result",
    });
  });
});
