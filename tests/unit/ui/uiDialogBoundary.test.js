import { describe, expect, it, vi } from "vitest";

import { materializeUiDialogRequest } from "../../../src/js/components/ui/uiDialogBoundary.js";

const validRequest = () => ({
  message: "Proceed?",
  title: "Confirm Test",
  type: "warning",
  context: "testOperation",
});

describe("uiDialogBoundary", () => {
  it("materializes an exact detached and frozen dialog request", () => {
    const input = Object.assign(Object.create(null), validRequest());

    const result = materializeUiDialogRequest(input);
    input.message = "Changed afterward";

    expect(result).toEqual(validRequest());
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    ["null", null],
    ["array", []],
    ["inherited fields", Object.create(validRequest())],
    ["missing field", { message: "Proceed?", title: "Confirm", type: "info" }],
    ["extra field", { ...validRequest(), extra: true }],
    ["symbol field", { ...validRequest(), [Symbol("extra")]: true }],
    ["invalid type", { ...validRequest(), type: "question" }],
    ["non-string context", { ...validRequest(), context: 42 }],
  ])("rejects an inexact %s envelope", (_label, input) => {
    expect(() => materializeUiDialogRequest(input)).toThrow(
      "invalid_ui_dialog_request",
    );
  });

  it("rejects accessors without invoking them", () => {
    const getter = vi.fn(() => "not safe");
    const input = validRequest();
    Object.defineProperty(input, "message", {
      configurable: true,
      enumerable: true,
      get: getter,
    });

    expect(() => materializeUiDialogRequest(input)).toThrow(
      "invalid_ui_dialog_request",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("classifies hostile proxy reflection as invalid without leaking its error", () => {
    const reflection = vi.fn(() => {
      throw new Error("hostile proxy trap");
    });
    const input = new Proxy(validRequest(), {
      getPrototypeOf: reflection,
      ownKeys: reflection,
      getOwnPropertyDescriptor: reflection,
    });

    expect(() => materializeUiDialogRequest(input)).toThrow(
      new TypeError("invalid_ui_dialog_request"),
    );
    expect(reflection).toHaveBeenCalledOnce();
  });
});
