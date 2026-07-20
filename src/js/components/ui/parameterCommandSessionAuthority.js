/** @typedef {import('../../types/events/commands.js').CommandEditTarget} CommandEditTarget */
/** @typedef {NonNullable<ReturnType<import('./parameterCommandModel.js').captureParameterAddTarget>>} ParameterAddTarget */
/**
 * @typedef {{
 *   generation: number,
 *   contextGeneration: number,
 *   formRevision: number,
 *   previewRevision: number,
 *   settled: boolean,
 *   descriptor: { mode: 'add' } | { mode: 'edit', target: CommandEditTarget }
 * }} ParameterSessionAuthority
 */
/**
 * @typedef {{
 *   destroyed: boolean,
 *   generation: number,
 *   currentSession: ParameterSessionAuthority | null
 * }} ParameterSessionOwner
 */

/** @param {ParameterSessionAuthority} session @param {ParameterSessionOwner} owner */
export function isParameterSessionCurrent(session, owner) {
  return (
    !owner.destroyed &&
    !session.settled &&
    owner.currentSession === session &&
    session.generation === owner.generation
  );
}

/**
 * @param {ParameterSessionAuthority} session
 * @param {ParameterSessionOwner} owner
 * @param {(target: CommandEditTarget, contextGeneration: number) => boolean} isTargetCurrent
 */
export function isParameterEditSessionCurrent(session, owner, isTargetCurrent) {
  return (
    isParameterSessionCurrent(session, owner) &&
    session.descriptor.mode === "edit" &&
    isTargetCurrent(session.descriptor.target, session.contextGeneration)
  );
}

/**
 * @param {ParameterSessionAuthority} session
 * @param {ParameterSessionOwner} owner
 * @param {number} previewRevision
 * @param {number} formRevision
 */
export function isParameterPreviewCurrent(
  session,
  owner,
  previewRevision,
  formRevision,
) {
  return (
    isParameterSessionCurrent(session, owner) &&
    session.previewRevision === previewRevision &&
    session.formRevision === formRevision
  );
}

/**
 * @param {ParameterSessionAuthority} session
 * @param {ParameterSessionOwner} owner
 * @param {ParameterAddTarget | CommandEditTarget} target
 * @param {number} contextGeneration
 * @param {{
 *   isAddTargetCurrent: (target: ParameterAddTarget, contextGeneration: number) => boolean,
 *   isEditTargetCurrent: (target: CommandEditTarget, contextGeneration: number) => boolean
 * }} guards
 */
export function isParameterActionCurrent(
  session,
  owner,
  target,
  contextGeneration,
  guards,
) {
  if (!isParameterSessionCurrent(session, owner)) return false;
  return session.descriptor.mode === "edit"
    ? guards.isEditTargetCurrent(
        /** @type {CommandEditTarget} */ (target),
        contextGeneration,
      )
    : guards.isAddTargetCurrent(
        /** @type {ParameterAddTarget} */ (target),
        contextGeneration,
      );
}
