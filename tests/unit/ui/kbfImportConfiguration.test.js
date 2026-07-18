import { describe, expect, it } from "vitest";

import {
  materializeKBFImportConfiguration,
  materializeSingleKBFImportConfiguration,
} from "../../../src/js/components/ui/kbfImportConfiguration.js";

describe("kbfImportConfiguration", () => {
  it("preserves enhanced selection, mapping, rename, and omission behavior", () => {
    const configuration = materializeKBFImportConfiguration([
      { bindsetName: "Master", mappingType: "primary" },
      {
        bindsetName: "Science Source",
        mappingType: "mapped",
        customName: "  Science  ",
      },
      {
        bindsetName: "Fallback Source",
        mappingType: "mapped",
        customName: "   ",
      },
      { bindsetName: "Skipped", mappingType: "none" },
      { bindsetName: "", mappingType: "primary" },
    ]);

    expect(configuration?.selectedBindsets).toEqual([
      "Master",
      "Science Source",
      "Fallback Source",
    ]);
    expect({ ...configuration?.bindsetMappings }).toEqual({
      Master: "primary",
      "Science Source": "custom",
      "Fallback Source": "custom",
    });
    expect({ ...configuration?.bindsetRenames }).toEqual({
      "Science Source": "Science",
      "Fallback Source": "Fallback Source",
    });
  });

  it("returns null when every enhanced mapping is omitted", () => {
    expect(
      materializeKBFImportConfiguration([
        { bindsetName: "Skipped", mappingType: "none" },
        { bindsetName: null, mappingType: "primary" },
      ]),
    ).toBeNull();
  });

  it("does not retain enhanced mapping inputs", () => {
    const mappings = [
      {
        bindsetName: "Imported",
        mappingType: "mapped",
        customName: "Destination",
      },
    ];
    const configuration = materializeKBFImportConfiguration(mappings);

    mappings[0].bindsetName = "Changed Source";
    mappings[0].mappingType = "none";
    mappings[0].customName = "Changed Destination";
    mappings.push({ bindsetName: "Later", mappingType: "primary" });
    expect(configuration?.selectedBindsets).toEqual(["Imported"]);
    expect(configuration?.bindsetMappings.Imported).toBe("custom");
    expect(configuration?.bindsetRenames.Imported).toBe("Destination");
  });

  it("treats hostile identifiers as opaque prototype-safe record keys", () => {
    const hostileNames = [
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      'source"] .unrelated, [data-bindset="payload',
    ];
    const configuration = materializeKBFImportConfiguration(
      hostileNames.map((bindsetName, index) => ({
        bindsetName,
        mappingType: index % 2 === 0 ? "mapped" : "primary",
        customName: `${bindsetName} destination`,
      })),
    );

    expect(configuration).not.toBeNull();
    expect(Object.getPrototypeOf(configuration.bindsetMappings)).toBeNull();
    expect(Object.getPrototypeOf(configuration.bindsetRenames)).toBeNull();
    for (const [index, bindsetName] of hostileNames.entries()) {
      expect(Object.hasOwn(configuration.bindsetMappings, bindsetName)).toBe(
        true,
      );
      expect(configuration.bindsetMappings[bindsetName]).toBe(
        index % 2 === 0 ? "custom" : "primary",
      );
      expect(Object.hasOwn(configuration.bindsetRenames, bindsetName)).toBe(
        index % 2 === 0,
      );
    }
    expect(Object.prototype).not.toHaveProperty("destination");
  });

  it("materializes one selected bindset to primary in single-bindset mode", () => {
    const configuration = materializeSingleKBFImportConfiguration("Science");

    expect(configuration).toMatchObject({
      selectedBindsets: ["Science"],
      singleBindsetMode: true,
    });
    expect(configuration.bindsetMappings.Science).toBe("primary");
    expect(Object.keys(configuration.bindsetRenames)).toEqual([]);
    expect(Object.getPrototypeOf(configuration.bindsetMappings)).toBeNull();
    expect(Object.getPrototypeOf(configuration.bindsetRenames)).toBeNull();
  });

  it("preserves an explicitly selected empty or hostile single-bindset value", () => {
    const empty = materializeSingleKBFImportConfiguration("");
    const hostile = materializeSingleKBFImportConfiguration("__proto__");

    expect(empty?.selectedBindsets).toEqual([""]);
    expect(Object.hasOwn(empty.bindsetMappings, "")).toBe(true);
    expect(empty.bindsetMappings[""]).toBe("primary");
    expect(hostile?.selectedBindsets).toEqual(["__proto__"]);
    expect(Object.hasOwn(hostile.bindsetMappings, "__proto__")).toBe(true);
    expect(hostile.bindsetMappings.__proto__).toBe("primary");
    expect(Object.getPrototypeOf(hostile.bindsetMappings)).toBeNull();
  });

  it("returns null only when no single-bindset control was selected", () => {
    expect(materializeSingleKBFImportConfiguration(null)).toBeNull();
    expect(materializeSingleKBFImportConfiguration(undefined)).toBeNull();
  });
});
