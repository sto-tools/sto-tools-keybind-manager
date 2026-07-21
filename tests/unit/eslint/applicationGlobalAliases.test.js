import { describe, expect, it } from "vitest";

import { messageIds, verify } from "./applicationGlobals.harness.js";

describe("application-global alias write guard", () => {
  it("tracks immutable aliases independent of shape and declaration order", () => {
    expect(
      messageIds(
        `
          function installLate() { late.newLateService = {}; }
          const direct = window;
          const conditional = typeof window === "undefined" ? globalThis : window;
          const member = globalThis.window;
          const { self: destructured } = globalThis;
          const late = window;
          direct.dataService = {};
          conditional.newService = {};
          member.memberService = {};
          destructured.destructuredService = {};
        `,
        "src/js/example.js",
      ),
    ).toEqual(Array(5).fill("unallowlisted"));
  });

  it("rejects mutable and object-fallback global-object aliases", () => {
    expect(
      messageIds(
        `
          const fallback = typeof window === "undefined" ? globalThis : {};
          let assigned;
          assigned = window;
        `,
        "src/js/example.js",
      ),
    ).toEqual(["unsafeAlias", "mutableAlias"]);
  });

  it("rejects destructured object fallbacks and accepts primitive fallbacks", () => {
    expect(
      messageIds(
        `
          const { window: objectFallback = {} } = globalThis;
          const { window: unknownFallback = candidate } = globalThis;
          const { window: primitiveFallback = null } = globalThis;
          let assignedObjectFallback;
          let assignedPrimitiveFallback;
          ({ window: assignedObjectFallback = {} } = globalThis);
          ({ window: assignedPrimitiveFallback = null } = globalThis);
          objectFallback.STO_DATA = {};
          unknownFallback.VFX_EFFECTS = {};
          primitiveFallback.COMMANDS = {};
        `,
        "src/js/data.js",
      ),
    ).toEqual([
      "unsafeAlias",
      "unsafeAlias",
      "unsafeAlias",
      "mutableAlias",
      "unallowlisted",
      "unallowlisted",
      "unallowlisted",
    ]);
  });

  it("resolves sequence aliases from the final expression", () => {
    expect(
      messageIds(
        `
          const direct = (0, window);
          const { missing: defaulted = (false, globalThis) } = {};
          const primitive = (window, null);
          direct.sequenceService = {};
          defaulted.defaultSequenceService = {};
          if (primitive) primitive.local = {};
        `,
        "src/js/example.js",
      ),
    ).toEqual(["unallowlisted", "unallowlisted"]);
  });

  it("tracks primitive, logical, defaulted, and nested alias branches", () => {
    expect(
      messageIds(
        `
          const { self: defaulted = window } = globalThis;
          const { self: { window: nested } } = globalThis;
          const nullable = flag ? window : null;
          const undef = flag ? window : undefined;
          const voided = flag ? window : void 0;
          const logical = window ?? globalThis;
          ({ self: assigned = window } = globalThis);
          defaulted.defaultedService = {};
          nested.nestedService = {};
          nullable.nullableService = {};
          undef.undefinedService = {};
          voided.voidService = {};
          logical.logicalService = {};
        `,
        "src/js/example.js",
      ),
    ).toEqual(["mutableAlias", ...Array(6).fill("unallowlisted")]);
  });

  it("tracks global aliases introduced only by destructuring defaults", () => {
    expect(
      messageIds(
        `
          function installLateDefault() {
            lateDefault.lateDefaultService = {};
          }
          function installLateArrayDefault() {
            lateArrayDefault.lateArrayDefaultService = {};
          }
          const { missing: objectDefault = window } = {};
          const [arrayDefault = window] = [];
          const { missing: lateDefault = window } = {};
          const [lateArrayDefault = window] = [];
          let assignedDefault;
          ({ missing: assignedDefault = window } = {});
          objectDefault.objectDefaultService = {};
          arrayDefault.arrayDefaultService = {};
          assignedDefault.assignedDefaultService = {};
        `,
        "src/js/example.js",
      ),
    ).toEqual([
      "unallowlisted",
      "unallowlisted",
      "mutableAlias",
      "unallowlisted",
      "unallowlisted",
    ]);
  });

  it("ignores non-global defaults and non-global properties", () => {
    expect(
      verify(
        `
          const { missing: objectDefault = {} } = {};
          const [arrayDefault = null] = [];
          const { location: nativeProperty = window.location } = window;
          function local(window) {
            const { missing: shadowedDefault = window } = {};
            shadowedDefault.local = {};
          }
          objectDefault.local = {};
          if (arrayDefault) arrayDefault.local = {};
          nativeProperty.hash = "probe";
        `,
        "src/js/example.js",
      ),
    ).toEqual([]);
  });

  it("does not mistake destructured values and copies for global aliases", () => {
    expect(
      verify(
        `
          const [arrayCopy] = window;
          const { ...restCopy } = window;
          const { [dynamicName]: computedCopy } = window;
          [arrayTarget] = window;
          ({ ...restTarget } = window);
        `,
        "src/js/example.js",
      ),
    ).toEqual([]);
  });
});
