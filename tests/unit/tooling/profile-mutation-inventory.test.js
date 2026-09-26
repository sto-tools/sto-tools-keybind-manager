import { describe, expect, it } from "vitest";
import {
  expectedDynamicProfileMutationRequests,
  expectedProfileMutationCallsites,
  expectedProfileMutationDependencies,
  profileMutationCallsiteDispositions,
  profileMutationModules,
} from "../../fixtures/tooling/profileMutationInventory.js";
import {
  profileMutationCallsites,
  profileMutationModuleDependencies,
  sourceEntries,
} from "../../fixtures/tooling/persistenceScanner.js";

describe("Tranche 5 exact profile mutation inventory", () => {
  const entries = sourceEntries();
  const registeredEntries = entries.filter(([path]) =>
    Object.hasOwn(profileMutationModules, path),
  );

  it("freezes every production literal owner-action caller and its count", () => {
    expect(profileMutationCallsites(entries)).toEqual(
      expectedProfileMutationCallsites,
    );
    expect(Object.keys(profileMutationCallsiteDispositions)).toEqual(
      Object.keys(expectedProfileMutationCallsites),
    );
    for (const [key, disposition] of Object.entries(
      profileMutationCallsiteDispositions,
    )) {
      expect(disposition).toBe("owner-action-only");
      expect(profileMutationModules).toHaveProperty(key.split("|")[0]);
    }
  });

  it("keeps the 14 approved cohort modules and explicitly registered helpers", () => {
    expect(
      Object.values(profileMutationModules).filter(
        ({ cohort }) => cohort === "task5-cohort",
      ),
    ).toHaveLength(14);
    const paths = new Set(entries.map(([path]) => path));
    for (const [path, entry] of Object.entries(profileMutationModules)) {
      expect(entry.disposition).toBeTruthy();
      if (entry.presence === "required") expect(paths.has(path)).toBe(true);
    }
  });

  it("requires explicit review of helper imports, re-exports, and dynamic edges", () => {
    const existing = registeredEntries.filter(([path]) => {
      const { cohort, presence } = profileMutationModules[path];
      return (
        presence === "required" &&
        !["outside-task5", "existing-pure-utility"].includes(cohort)
      );
    });
    expect(profileMutationModuleDependencies(existing)).toEqual(
      expectedProfileMutationDependencies,
    );
  });

  it("does not hide dynamically addressed requests inside the registered cohort", () => {
    expect(
      profileMutationCallsites(registeredEntries, { dynamic: true }),
    ).toEqual(expectedDynamicProfileMutationRequests);
  });
});

describe("profile mutation scanner negative probes", () => {
  const file = "components/services/Probe.js";
  const key = `${file}|mutate|this|data:update-profile`;
  const baseline = [
    [
      file,
      'class Probe { mutate() { this.request("data:update-profile", {}); } }',
    ],
  ];

  it.each([
    'this.request("data:update-profile", payload)',
    'this.request?.("data:update-profile", payload)',
    'this["request"]("data:update-profile", payload)',
    "this[`request`](`data:update-profile`, payload)",
    'this.request /* comment */ ("data:update-profile", payload)',
    'this.request\n/* comment */\n?.("data:update-profile", payload)',
    'this["requ\\u0065st"]("data:update-\\u0070rofile", payload)',
    'this.requ\\u0065st("data:update-profile", payload)',
  ])("recognizes the exact literal action syntax: %s", (call) => {
    expect(
      profileMutationCallsites([
        [file, `class Probe { mutate() { ${call}; } }`],
      ]),
    ).toEqual({ [key]: 1 });
  });

  it("ignores comments, ordinary strings, and responder declarations", () => {
    expect(
      profileMutationCallsites([
        [
          file,
          `
      // this.request("data:update-profile", {});
      const doc = 'this.request("data:update-profile", {})';
      this.respond("data:update-profile", () => {});
    `,
        ],
      ]),
    ).toEqual({});
  });

  it("retains constructor and enclosing callback ownership and names arrow helpers", () => {
    expect(
      profileMutationCallsites([
        [
          file,
          `
      class Probe {
        constructor() { configure(() => this.request("data:update-profile", {})); }
        mutate() { queue(async () => this.request("data:update-profile", {})); }
      }
      const helper = () => service.request("data:update-profile", {});
      function direct() { request(bus, "data:update-profile", {}); }
      function invoke() { invokeRequest(bus, "data:update-profile", {}); }
    `,
        ],
      ]),
    ).toEqual({
      [`${file}|constructor|this|data:update-profile`]: 1,
      [key]: 1,
      [`${file}|helper|service|data:update-profile`]: 1,
      [`${file}|direct|request|data:update-profile`]: 1,
      [`${file}|invoke|invokeRequest|data:update-profile`]: 1,
    });
  });

  it.each(["request", "invokeRequest", "requ\\u0065st", "invokeRequ\\u0065st"])(
    "retains bare and escaped request bindings: %s",
    (binding) => {
      const receiver = binding.startsWith("invoke")
        ? "invokeRequest"
        : "request";
      expect(
        profileMutationCallsites([
          [
            file,
            `function mutate() { ${binding}(bus, "data:update-profile", {}); }`,
          ],
        ]),
      ).toEqual({ [`${file}|mutate|${receiver}|data:update-profile`]: 1 });
    },
  );

  it.each([
    ["file", "components/services/Unregistered.js", "mutate", "this"],
    ["method", file, "movedMutation", "this"],
    ["receiver", file, "mutate", "anotherService"],
  ])(
    "detects caller relocation with unchanged total count: %s",
    (_kind, path, owner, receiver) => {
      const actual = profileMutationCallsites([
        [
          path,
          `class Probe { ${owner}() { ${receiver}.request("data:update-profile", {}); } }`,
        ],
      ]);
      expect(Object.values(actual)).toEqual([1]);
      expect(actual).not.toEqual(profileMutationCallsites(baseline));
      expect(actual).toEqual({
        [`${path}|${owner}|${receiver}|data:update-profile`]: 1,
      });
    },
  );

  it("detects an added caller and duplicate calls within the same owner", () => {
    const added = [
      ...baseline,
      [
        "new.js",
        'function write() { service.request("data:update-profile", {}); }',
      ],
    ];
    expect(profileMutationCallsites(added)).not.toEqual(
      profileMutationCallsites(baseline),
    );
    expect(
      profileMutationCallsites([
        [
          file,
          'class Probe { mutate() { this.request("data:update-profile", {}); this.request("data:update-profile", {}); } }',
        ],
      ]),
    ).toEqual({ [key]: 2 });
  });

  it("flags dynamic topics without claiming to resolve their eventual value", () => {
    const entries = [
      [
        file,
        "class Probe { mutate() { this.request(topic, {}); this.request(`data:${name}`, {}); request(bus, topic, {}); this.request(); } }",
      ],
    ];
    expect(profileMutationCallsites(entries)).toEqual({});
    expect(profileMutationCallsites(entries, { dynamic: true })).toEqual({
      [`${file}|mutate|this|<dynamic-topic>`]: 3,
      [`${file}|mutate|request|<dynamic-topic>`]: 1,
    });
  });

  it.each(["request", "invokeRequest"])(
    "retains an isolated dynamic bare %s call",
    (binding) => {
      expect(
        profileMutationCallsites([[file, `${binding}(bus, topic, {});`]], {
          dynamic: true,
        }),
      ).toEqual({ [`${file}|top|${binding}|<dynamic-topic>`]: 1 });
    },
  );

  it.each([
    'import helper from "./newHelper.js";',
    'export { helper } from "./newHelper.js";',
    'const helper = await import("./newHelper.js");',
    "const helper = await import(helperPath);",
  ])("detects added helper/module edges: %s", (source) => {
    const prior = [[file, 'import { existing } from "./existing.js";']];
    const actual = profileMutationModuleDependencies([
      [file, `${prior[0][1]} ${source}`],
    ]);
    expect(actual).not.toEqual(profileMutationModuleDependencies(prior));
    expect(Object.keys(actual)).toHaveLength(2);
  });

  it("does not reuse parsed snapshots for mutable probe input", () => {
    const entries = [[file, baseline[0][1]]];
    expect(profileMutationCallsites(entries)).toEqual({ [key]: 1 });
    entries[0][1] =
      'class Probe { moved() { this.request("data:update-profile", {}); } }';
    expect(profileMutationCallsites(entries)).toEqual({
      [`${file}|moved|this|data:update-profile`]: 1,
    });
  });
});
