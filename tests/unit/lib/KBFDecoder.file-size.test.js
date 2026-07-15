import { describe, expect, it, vi } from "vitest";
import { KBFDecoder } from "../../../src/js/lib/kbf/parsers/KBFDecoder.js";

const validKbfContent = btoa("KEYSET:Master;NAME:Master;");

/** @param {string} content */
function toArrayBuffer(content) {
  return new TextEncoder().encode(content).buffer;
}

/** @param {string | ArrayBuffer} content */
function byteLength(content) {
  return typeof content === "string"
    ? new TextEncoder().encode(content).byteLength
    : content.byteLength;
}

/** @param {unknown[]} errors */
function errorMessages(errors) {
  return errors.map((error) =>
    typeof error === "string"
      ? error
      : String(/** @type {{ message?: unknown }} */ (error)?.message ?? ""),
  );
}

const inputCases = [
  { inputType: "string", content: validKbfContent },
  { inputType: "ArrayBuffer", content: toArrayBuffer(validKbfContent) },
];

describe("KBFDecoder maxFileSize boundary", () => {
  it.each(inputCases)(
    "allows $inputType input exactly at the configured limit",
    ({ content }) => {
      const inputSize = byteLength(content);
      const decoder = new KBFDecoder({ maxFileSize: inputSize });
      const runSpy = vi.spyOn(decoder.pipeline, "run");

      expect(decoder.validateFormat(content)).toMatchObject({
        isValid: true,
        isKBF: true,
        estimatedSize: inputSize,
        errors: [],
      });

      const result = decoder.parseFile(content);

      expect(runSpy).toHaveBeenCalledOnce();
      expect(
        errorMessages(result.errors).some((message) =>
          message.includes("exceeds maximum allowed size"),
        ),
      ).toBe(false);
    },
  );

  it.each(inputCases)(
    "rejects $inputType input one byte beyond the configured limit before decoding",
    ({ content }) => {
      const inputSize = byteLength(content);
      const maxFileSize = inputSize - 1;
      const expectedError = `KBF file size (${inputSize} bytes) exceeds maximum allowed size (${maxFileSize} bytes)`;
      const decoder = new KBFDecoder({ maxFileSize });
      const runSpy = vi.spyOn(decoder.pipeline, "run");

      expect(decoder.validateFormat(content)).toMatchObject({
        isValid: false,
        isKBF: false,
        estimatedSize: inputSize,
        errors: [expectedError],
      });

      const result = decoder.parseFile(content);

      expect(runSpy).not.toHaveBeenCalled();
      expect(result.bindsets).toEqual({});
      expect(errorMessages(result.errors)).toEqual([expectedError]);
    },
  );

  it("measures string limits in UTF-8 bytes", () => {
    const content = "é".repeat(6);
    const decoder = new KBFDecoder({ maxFileSize: 10 });

    expect(decoder.validateFormat(content)).toMatchObject({
      isValid: false,
      estimatedSize: 12,
      errors: [
        "KBF file size (12 bytes) exceeds maximum allowed size (10 bytes)",
      ],
    });
  });
});
