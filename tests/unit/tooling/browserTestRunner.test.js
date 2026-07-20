import { describe, expect, it, vi } from "vitest";
import { runBrowserTests } from "../../../scripts/browser-test-runner.mjs";

describe("browser test runner", () => {
  it("discovers, sorts, and executes browser files one at a time", async () => {
    const calls = [];
    let active = 0;
    const execute = vi.fn(async (file, passthrough) => {
      active += 1;
      expect(active).toBe(1);
      calls.push([file, passthrough]);
      await Promise.resolve();
      active -= 1;
      return 0;
    });

    await expect(
      runBrowserTests({
        args: [],
        discover: async () => [
          "tests/browser/zeta.test.js",
          "tests/browser/alpha.test.js",
        ],
        execute,
        announce: vi.fn(),
      }),
    ).resolves.toBe(0);

    expect(calls).toEqual([
      ["tests/browser/alpha.test.js", []],
      ["tests/browser/zeta.test.js", []],
    ]);
  });

  it("uses requested files and forwards non-file CLI arguments", async () => {
    const discover = vi.fn();
    const execute = vi.fn().mockResolvedValue(0);

    await expect(
      runBrowserTests({
        args: [
          "--reporter=verbose",
          "tests/browser/basic-ui.test.js",
          "--bail=1",
        ],
        discover,
        execute,
        announce: vi.fn(),
      }),
    ).resolves.toBe(0);

    expect(discover).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith("tests/browser/basic-ui.test.js", [
      "--reporter=verbose",
      "--bail=1",
    ]);
  });

  it("stops after the first failed browser file", async () => {
    const execute = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(3);

    await expect(
      runBrowserTests({
        args: [],
        discover: async () => [
          "tests/browser/alpha.test.js",
          "tests/browser/beta.test.js",
          "tests/browser/gamma.test.js",
        ],
        execute,
        announce: vi.fn(),
      }),
    ).resolves.toBe(3);

    expect(execute).toHaveBeenCalledTimes(2);
  });
});
