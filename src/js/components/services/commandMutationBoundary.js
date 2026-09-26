import {
  materializeMutationRequest,
  requireMutationCommand,
  requireMutationString,
  requireMutationIdentifier,
} from "./mutationRequestBoundary.js";
import { adoptDataStateSnapshot, getSnapshotCommands } from "./dataState.js";
/** @typedef {import('./commandMutationPlanner.js').CommandMutation} CommandMutation */

/** @param {import('./CommandService.js').default} service
 * @param {import('./commandMutationPlanner.js').CommandMutationEvent} event */
export function publishCommandMutationEvent(service, event) {
  switch (event.topic) {
    case "command-added":
      service.emit("command-added", event.payload);
      break;
    case "command-deleted":
      service.emit("command-deleted", event.payload);
      break;
    case "command-moved":
      service.emit("command-moved", event.payload);
      break;
    case "command-edited":
      service.emit("command-edited", event.payload);
      break;
  }
}

/**
 * Preserve action facts without publishing an obsolete chain after a later
 * action has committed while this action's listeners were still settling.
 * @param {import('./commandMutationPlanner.js').CommandMutationPlanSuccess} plan
 * @param {import('../../types/events/component-state.js').DataCoordinatorStateSnapshot | null} snapshot
 * @param {number} predecessorRevision
 */
export function currentCommandMutationEvent(
  plan,
  snapshot,
  predecessorRevision,
) {
  const event = plan.event;
  if (
    event.topic !== "command-added" &&
    (snapshot?.revision ?? 0) > predecessorRevision + 1
  ) {
    event.payload.commands = getSnapshotCommands(
      snapshot,
      plan.target.kind === "alias" ? "alias" : plan.target.environment,
      plan.target.key,
      plan.target.bindset,
    );
  }
  return event;
}

/**
 * Release planning independently from listener-settled replies. Every request
 * carries an exact CAS baseline: once it advances, that request has either
 * committed already or can only reject stale, never overwrite a later plan.
 * @param {import('./CommandService.js').default} service
 * @param {import('../../types/rpc/data.js').ProfileMutationPrecondition} precondition
 * @param {() => void} release
 */
export function watchCommandMutationAdmission(service, precondition, release) {
  let observed = service.cache.dataState;
  /** @param {import('../../types/events/data.js').DataStateChangedPayload} event */
  const observe = ({ state }) => {
    observed = adoptDataStateSnapshot(state, observed) || observed;
    if (
      observed &&
      (observed.authorityEpoch !== precondition.authorityEpoch ||
        observed.revision > precondition.revision)
    ) {
      stop();
      release();
    }
  };
  const detach = service.eventBus?.on("data:state-changed", observe);
  const stop = () => {
    if (typeof detach === "function") detach();
    else service.eventBus?.off("data:state-changed", observe);
  };
  return stop;
}

/**
 * @param {import('./CommandService.js').default} service
 * @param {(generation: number, context: ReturnType<import('./CommandService.js').default['_captureCommandMutationContext']>, release: () => void) => Promise<boolean>} operation
 */
export function enqueueCommandMutation(service, operation) {
  const generation = service._mutationGeneration;
  const context = service._captureCommandMutationContext();
  /** @type {() => void} */
  let release = () => {};
  /** @type {Promise<void>} */
  const admitted = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  const run = () =>
    service._isCurrentMutationGeneration(generation)
      ? operation(generation, context, release)
      : false;
  const result = service._mutationQueue.then(run, run);
  service._mutationQueue = admitted;
  void result.then(release, release);
  return result;
}

/** Validate caller data before a service reads a snapshot or enters its queue.
 * @param {unknown} input
 * @returns {CommandMutation}
 */
export function materializeCommandMutation(input) {
  const value = materializeMutationRequest(input, [
    "type",
    "key",
    "command",
    "index",
    "fromIndex",
    "toIndex",
    "updatedCommand",
    "bindset",
    "target",
  ]);
  /** @type {Record<string, string[]>} */
  const fields = {
    add: ["type", "key", "command", "bindset"],
    delete: ["type", "key", "index", "bindset"],
    move: ["type", "key", "fromIndex", "toIndex", "bindset"],
    edit: ["type", "key", "index", "updatedCommand", "bindset", "target"],
  };
  const type = requireMutationString(value.type);
  if (
    !Object.hasOwn(fields, type) ||
    Object.keys(value).some((key) => !fields[type].includes(key))
  ) {
    throw new TypeError("invalid_mutation_request");
  }
  requireMutationString(value.key);
  requireMutationString(value.bindset, {
    optional: true,
    nullable: true,
    allowEmpty: true,
  });
  requireMutationIdentifier(value.key);
  if (value.bindset !== undefined && value.bindset !== null)
    requireMutationIdentifier(value.bindset, { allowEmpty: true });
  for (const field of type === "move"
    ? ["fromIndex", "toIndex"]
    : type === "add"
      ? []
      : ["index"]) {
    if (!Number.isSafeInteger(value[field]) || Number(value[field]) < 0)
      throw new TypeError("invalid_mutation_request");
  }
  const command = type === "edit" ? value.updatedCommand : value.command;
  if (type === "add" || type === "edit") {
    const commands =
      type === "add" && Array.isArray(command) ? command : [command];
    for (const entry of commands) requireMutationCommand(entry);
  }
  if (value.target !== undefined) {
    const target = materializeMutationRequest(value.target, [
      "authorityEpoch",
      "revision",
      "profileId",
      "environment",
      "name",
      "bindset",
      "index",
      "originalEntry",
    ]);
    for (const field of ["authorityEpoch", "revision", "index"]) {
      if (!Number.isSafeInteger(target[field]) || Number(target[field]) < 0)
        throw new TypeError("invalid_mutation_request");
    }
    for (const field of ["profileId", "environment", "name"]) {
      requireMutationString(target[field]);
      requireMutationIdentifier(target[field]);
    }
    requireMutationString(target.bindset, { nullable: true });
    if (target.bindset !== null) requireMutationIdentifier(target.bindset);
    requireMutationCommand(target.originalEntry);
  }
  return /** @type {CommandMutation} */ (value);
}

/** @param {import('./CommandService.js').default} service
 * @param {'add'|'delete'|'move'|'edit'} type @param {unknown} payload */
export async function dispatchCommandMutationRequest(service, type, payload) {
  try {
    const fields =
      type === "add"
        ? ["key", "command", "bindset"]
        : type === "edit"
          ? ["key", "index", "updatedCommand", "bindset", "target"]
          : type === "move"
            ? ["key", "fromIndex", "toIndex", "bindset"]
            : ["key", "index", "bindset"];
    const input = materializeMutationRequest(payload, fields);
    const mutation = materializeCommandMutation({ ...input, type });
    if (mutation.type === "add")
      return service.addCommand(
        mutation.key,
        mutation.command,
        mutation.bindset,
      );
    if (mutation.type === "delete")
      return service.deleteCommand(
        mutation.key,
        mutation.index,
        mutation.bindset,
      );
    if (mutation.type === "move")
      return service.moveCommand(
        mutation.key,
        mutation.fromIndex,
        mutation.toIndex,
        mutation.bindset,
      );
    return service.editCommand(
      mutation.key,
      mutation.index,
      mutation.updatedCommand,
      mutation.bindset ?? null,
      mutation.target,
    );
  } catch {
    return false;
  }
}
