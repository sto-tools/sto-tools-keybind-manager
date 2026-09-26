import { describe, expect, it, vi } from "vitest";
import { serializeRepositoryData } from "../../../src/js/components/storage/repositoryJsonBoundary.js";
import { storageFailureCategory } from "../../../src/js/components/storage/repositoryResults.js";
import { MAX_PROJECT_JSON_BYTES } from "../../../src/js/components/services/jsonDataBoundary.js";

describe("repository own-data serialization", () => {
  it("preserves JSON bytes and detaches shared nested data", () => {
    const shared = { text: '雪\\"\n', flags: [true, false, null, -0, 1.25] };
    const input = { first: shared, second: shared, blank: Object.create(null) };
    const result = serializeRepositoryData(input);
    expect(result).toEqual({
      success: true,
      json: JSON.stringify(input),
      value: JSON.parse(JSON.stringify(input)),
    });
    expect(result.value.first).not.toBe(shared);
    expect(result.value.first).not.toBe(result.value.second);
    shared.flags.push("later");
    expect(result.value.first.flags).toHaveLength(5);
  });

  it.each([
    undefined,
    NaN,
    Infinity,
    1n,
    Symbol("data"),
    () => {},
    new Date(),
    /a/,
    new Map(),
    new Set(),
  ])("rejects non-JSON data %s", (input) => {
    expect(serializeRepositoryData(input)).toEqual({
      success: false,
      error: "invalid_data",
    });
  });

  it("rejects accessors, hooks, hidden fields and unsafe keys without executing them", () => {
    const getter = vi.fn(() => "do not read");
    const hook = vi.fn(() => ({}));
    const cases = [
      Object.defineProperty({}, "value", { get: getter, enumerable: true }),
      Object.defineProperty({}, "hidden", { value: 1 }),
      { toJSON: hook },
      { [Symbol("hidden")]: 1 },
      JSON.parse('{"__proto__":1}'),
      { nested: { constructor: "bad" } },
      { prototype: {} },
    ];
    for (const input of cases)
      expect(serializeRepositoryData(input).success).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(hook).not.toHaveBeenCalled();
  });

  it("requires dense plain arrays with no extra properties", () => {
    const sparse = new Array(2);
    const extra = Object.assign([1], { extra: 1 });
    const accessor = Object.defineProperty([1], "0", {
      get: () => {
        throw new Error("not data");
      },
    });
    const inherited = Object.setPrototypeOf([1], null);
    for (const input of [sparse, extra, accessor, inherited]) {
      expect(serializeRepositoryData(input).success).toBe(false);
    }
  });

  it("rejects cycles and throwing reflection without propagating exceptions", () => {
    const cycle = {};
    cycle.self = cycle;
    const throwing = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("private details");
        },
      },
    );
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    for (const input of [cycle, throwing, revoked.proxy]) {
      expect(serializeRepositoryData(input)).toEqual({
        success: false,
        error: "invalid_data",
      });
    }
  });

  it("enforces the depth limit on leaves", () => {
    let input = null;
    for (let depth = 0; depth < 100; depth++) input = { child: input };
    expect(serializeRepositoryData(input).success).toBe(true);
    expect(serializeRepositoryData({ child: input }).success).toBe(false);
  });

  it("enforces UTF-8 and escaping expansion against the serialized byte limit", () => {
    expect(
      serializeRepositoryData("a".repeat(MAX_PROJECT_JSON_BYTES - 2)).success,
    ).toBe(true);
    for (const value of [
      "a".repeat(MAX_PROJECT_JSON_BYTES),
      "雪".repeat(Math.ceil(MAX_PROJECT_JSON_BYTES / 3)),
      "\n".repeat(MAX_PROJECT_JSON_BYTES / 2),
    ]) {
      expect(serializeRepositoryData(value).success).toBe(false);
    }
  });

  it("reports a serialization failure if the final detached parse fails", () => {
    const parse = vi.spyOn(JSON, "parse").mockImplementation(() => {
      throw new Error("unavailable");
    });
    try {
      expect(serializeRepositoryData({ valid: true })).toEqual({
        success: false,
        error: "serialization_failed",
      });
    } finally {
      parse.mockRestore();
    }
  });

  it("counts repeated shared values against the complete serialized budget", () => {
    const shared = { text: "a".repeat(1024 * 1024) };
    expect(serializeRepositoryData(Array(17).fill(shared))).toEqual({
      success: false,
      error: "invalid_data",
    });
  });
});

describe("closed storage error categories", () => {
  it.each([
    [new DOMException("private", "QuotaExceededError"), "quota"],
    [new DOMException("private", "SecurityError"), "security"],
    [new Error("private"), "unknown"],
    [null, "unknown"],
    ["quota", "unknown"],
    [
      {
        get name() {
          throw new Error("private");
        },
      },
      "unknown",
    ],
  ])("categorizes without exposing the thrown value", (error, category) => {
    expect(storageFailureCategory(error)).toBe(category);
  });
});
