import type { AliasMap, SelectionSource } from "./base.js";

export interface AliasEventProtocol {
  "alias-deleted": { name: string };
  "alias-selected": { name: string | null; source: SelectionSource };
  "aliases-changed": { aliases: AliasMap };
  "aliases:import": null;
  "alias-browser/alias-clicked": { name: string | undefined };
  "alias-created": { name: string };
  "alias-duplicated": { from: string; to: string };
}
