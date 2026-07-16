import type { SelectionStateSnapshot } from "./base.js";

export interface SelectionEventProtocol {
  "selection:state-changed": SelectionStateSnapshot;
}
