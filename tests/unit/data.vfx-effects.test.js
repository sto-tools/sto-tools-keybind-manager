import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import vfxEffects, {
  vfxEffects as namedVFXEffects,
} from "../../src/js/data/vfxEffects.js";
import "../../src/js/data.js";

describe("VFX effects catalog", () => {
  it("pins the complete ordered catalog contract", () => {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(vfxEffects))
      .digest("hex");

    expect(namedVFXEffects).toBe(vfxEffects);
    expect(Object.keys(vfxEffects)).toEqual(["space", "ground"]);
    expect(vfxEffects.space).toHaveLength(233);
    expect(vfxEffects.ground).toHaveLength(129);
    expect(fingerprint).toBe(
      "4875bd54511a8bde4e0a45aa544c9e1010ea0b01defd550f25448d37ab29d124",
    );
  });

  it("shares the exact STO_DATA catalog without publishing a second global", () => {
    expect(window.STO_DATA.vfxEffects).toBe(vfxEffects);
    expect("VFX_EFFECTS" in window).toBe(false);
  });
});
