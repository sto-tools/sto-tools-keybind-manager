import { describe, expect, it, vi } from "vitest";

import { FieldParser } from "../../../src/js/lib/kbf/parsers/FieldParser.js";

const invalidUtf8 = Buffer.from([0xc3, 0x28]).toString("base64");
const textRecord = { fieldName: "Text", value: invalidUtf8, hasColon: true };
const encode = (value) => Buffer.from(value, "utf8").toString("base64");

function parser(options = {}) {
  const addError = vi.fn();
  const addWarning = vi.fn();
  return {
    addError,
    addWarning,
    value: new FieldParser({
      ...options,
      decoder: { addError, addWarning },
    }),
  };
}

describe("FieldParser value boundary", () => {
  it("rejects invalid UTF-8 with a fatal diagnostic when validation is enabled", () => {
    const { value, addError, addWarning } = parser({ validateUtf8: true });

    expect(value.parseBase64TextField(textRecord, 7)).toBeNull();
    expect(addError).toHaveBeenCalledWith(
      "Text field contains invalid UTF-8 data",
      expect.objectContaining({ fieldIndex: 7, fatal: true }),
    );
    expect(addWarning).not.toHaveBeenCalled();
  });

  it("retains replacement-character fallback when UTF-8 validation is disabled", () => {
    const { value, addError, addWarning } = parser({ validateUtf8: false });

    expect(value.parseBase64TextField(textRecord, 8)).toBe("�(");
    expect(addWarning).toHaveBeenCalledWith(
      "Text field contains invalid UTF-8 data, using fallback decoding",
      expect.objectContaining({ fieldIndex: 8 }),
    );
    expect(addError).not.toHaveBeenCalled();
  });

  it("rejects malformed Base64 text instead of returning lossy empty text", () => {
    const { value, addError, addWarning } = parser();

    expect(
      value.parseBase64TextField(
        { fieldName: "Text", value: "not.base64", hasColon: true },
        9,
      ),
    ).toBeNull();
    expect(addError).toHaveBeenCalledWith(
      "Text field contains invalid Base64 data",
      expect.objectContaining({ fieldIndex: 9, fatal: true }),
    );
    expect(addWarning).not.toHaveBeenCalled();
  });

  it("rejects non-canonical Base64 text encodings", () => {
    const { value, addError } = parser();

    expect(
      value.parseBase64TextField(
        { fieldName: "Text", value: "Zh==", hasColon: true },
        10,
      ),
    ).toBeNull();
    expect(addError).toHaveBeenCalledWith(
      "Text field contains non-canonical Base64 data",
      { fieldIndex: 10, fatal: true },
    );
  });

  it("decodes and canonicalizes every token in a complete combo", () => {
    const { value, addError } = parser();
    const combo = [encode("Alt"), encode("f1")].join("*");

    expect(
      value.parseComboField(
        { fieldName: "Combo", value: combo, hasColon: true },
        10,
      ),
    ).toEqual(["ALT", "F1"]);
    expect(addError).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed Base64", `${encode("Alt")}*not.base64`],
    ["invalid UTF-8", invalidUtf8],
    ["an unknown key token", encode("NotARealKey")],
    ["embedded newline", encode("Alt\nF2")],
    ["NUL control byte", "AA=="],
    [
      "more than ten tokens",
      Array.from({ length: 11 }, (_, index) => encode(`F${index + 1}`)).join(
        "*",
      ),
    ],
  ])("rejects a combo containing %s", (_label, combo) => {
    const { value, addError } = parser();

    expect(
      value.parseComboField(
        { fieldName: "Combo", value: combo, hasColon: true },
        11,
      ),
    ).toBeNull();
    expect(addError).toHaveBeenCalledWith(
      expect.stringMatching(/^Combo field|^Failed to decode Combo/),
      expect.objectContaining({ fieldIndex: 11, fatal: true }),
    );
  });

  it("rejects a lossy integer before range handling", () => {
    const { value, addError } = parser();
    const record = {
      fieldName: "N3",
      value: String(Number.MAX_SAFE_INTEGER + 1),
      hasColon: true,
    };

    expect(value.parseNumericField(record, 9, "N3", 0, 9)).toBeNull();
    expect(addError).toHaveBeenCalledWith("N3 field must be a safe integer", {
      fieldIndex: 9,
      value: "9007199254740992",
      fatal: true,
    });
  });
});
