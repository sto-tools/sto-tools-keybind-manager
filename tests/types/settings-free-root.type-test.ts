import type {
  CanonicalSettings,
  CurrentProjectArtifactEnvelope,
  StoredApplicationData,
} from "../../src/js/types/data-contracts.js";

declare const root: StoredApplicationData;
declare const settings: CanonicalSettings;

const extended: StoredApplicationData = {
  ...root,
  "plugin:layout": { retained: true },
};
void extended;

// @ts-expect-error Open root extensions must not admit embedded settings.
const legacyRoot: StoredApplicationData = { ...root, settings };
void legacyRoot;
// @ts-expect-error Settings cannot be written through the canonical root.
root.settings = settings;
// @ts-expect-error Even null is an own embedded settings value.
const nullSettings: StoredApplicationData = { ...root, settings: null };
void nullSettings;

// Portable artifacts retain settings at their separate boundary.
const portable: CurrentProjectArtifactEnvelope["data"] = { ...root, settings };
void portable;
