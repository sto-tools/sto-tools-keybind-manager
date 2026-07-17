import type { AliasMap, SelectionSource } from "./base.js";

export interface AliasEventProtocol {
  "alias-deleted": { name: string };
  "alias-selected": { name: string | null; source: SelectionSource };
  "aliases-changed": { aliases: AliasMap };
  "aliases:import": null;
  "alias-created": { name: string };
  "alias-duplicated": { from: string; to: string };
}
