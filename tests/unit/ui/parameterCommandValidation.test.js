import { describe, expect, it } from "vitest";

import { STOError } from "../../../src/js/core/errors.js";
import {
  projectParameterValidationIssue,
  translateParameterValidationIssue,
} from "../../../src/js/components/ui/parameterCommandValidation.js";

function validationError(code, parameterName, parameterValue) {
  return Object.assign(new STOError("diagnostic only", code), {
    parameterName,
    parameterValue,
  });
}

describe("parameterCommandValidation presentation projection", () => {
  it.each([
    ["INVALID_PARAMETER_NUMBER", "invalid_parameter_number"],
    ["INVALID_PARAMETER_BOOLEAN", "invalid_parameter_boolean"],
  ])("projects %s through an i18n key", (code, key) => {
    expect(
      projectParameterValidationIssue(
        validationError(code, "tray", "not-a-number"),
      ),
    ).toEqual({
      key,
      params: { parameter: "tray", value: "not-a-number" },
    });
  });

  it("rejects unrelated and malformed diagnostics", () => {
    expect(
      projectParameterValidationIssue(new Error("English leak")),
    ).toBeNull();
    expect(projectParameterValidationIssue(null)).toBeNull();
    expect(
      projectParameterValidationIssue("INVALID_PARAMETER_NUMBER"),
    ).toBeNull();
  });

  it("translates known diagnostics and uses the generic key otherwise", () => {
    const translate = (key, options = {}) =>
      `${key}:${options.parameter || "none"}:${options.value || "none"}`;

    expect(
      translateParameterValidationIssue(
        validationError("INVALID_PARAMETER_NUMBER", "tray", "bad"),
        translate,
      ),
    ).toBe("invalid_parameter_number:tray:bad");
    expect(
      translateParameterValidationIssue(new Error("do not expose"), translate),
    ).toBe("invalid_parameter_values:none:none");
  });
});
