import type devMonitor from "../../src/js/dev/DevMonitor.js";
import type { StorageDiagnosticSnapshot } from "../../src/js/types/storage-diagnostics.js";
import eventBus from "../../src/js/core/eventBus.js";
import { request } from "../../src/js/core/requestResponse.js";

declare const snapshot: StorageDiagnosticSnapshot;
declare const monitor: typeof devMonitor;

// @ts-expect-error Diagnostics are not a repository capability.
snapshot.projectRepository.commit({});
// @ts-expect-error Diagnostics do not expose services or an event bus.
snapshot.eventBus.emit("data:reload-state");
// @ts-expect-error The closed domain collection is immutable.
snapshot.domains.push(snapshot.domains[0]);

const row = snapshot.domains[0];
if (row) {
  // @ts-expect-error A diagnostic row cannot mutate persistence.
  row.commit({});
  // @ts-expect-error Registration metadata is immutable.
  row.portRegistered = true;
  if (row.lastOperation) {
    // @ts-expect-error Receipt codes are immutable.
    row.lastOperation.status = "committed";
    // @ts-expect-error User error text is not a diagnostic code.
    const error: typeof row.lastOperation.error = "private user content";
    void error;
  }
}

// @ts-expect-error Live runtime handles are no longer a diagnostic API.
monitor.getRuntimeDiagnostics();
// @ts-expect-error No public live runtime registration remains.
monitor.registerRuntimeDiagnostics({ eventBus });
// @ts-expect-error Diagnostic metadata is not published as application state.
eventBus.emit("storage:diagnostics", snapshot);
// @ts-expect-error Diagnostics introduce no routine state query RPC.
request(eventBus, "storage:get-diagnostics", {});
