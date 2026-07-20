/** @typedef {import('../../types/events/commands.js').CommandEditTarget} CommandEditTarget */
/**
 * @typedef {{
 *   descriptor: { mode: 'add' } | { mode: 'edit', target: CommandEditTarget }
 * }} SettlementSession
 */
/**
 * @template {SettlementSession} Session
 * @typedef {{
 *   currentSession: Session | null,
 *   isCurrent: (session: Session) => boolean,
 *   isEditSessionCurrent: (session: Session) => boolean,
 *   translate: (key: string, options?: import('i18next').TOptions) => string,
 *   showToast: (message: string, type: 'warning') => unknown,
 *   finish: (session: Session, options: { hide: boolean }) => void
 * }} SettlementOwner
 */

/** @template {SettlementSession} Session @param {SettlementOwner<Session>} owner @param {Session} session */
export function settleStaleParameterEdit(owner, session) {
  if (!owner.isCurrent(session) || session.descriptor.mode !== "edit") {
    return false;
  }
  owner.showToast(owner.translate("command_edit_target_changed"), "warning");
  owner.finish(session, { hide: true });
  return true;
}

/** @template {SettlementSession} Session @param {SettlementOwner<Session>} owner */
export function settleStaleEditOnContextTransition(owner) {
  const session = owner.currentSession;
  if (
    !session ||
    session.descriptor.mode !== "edit" ||
    owner.isEditSessionCurrent(session)
  ) {
    return false;
  }
  return settleStaleParameterEdit(owner, session);
}

/** @template {SettlementSession} Session @param {SettlementOwner<Session>} owner */
export function cancelParameterSession(owner) {
  if (!owner.currentSession) return false;
  owner.finish(owner.currentSession, { hide: true });
  return true;
}

/**
 * @template {SettlementSession} Session
 * @param {SettlementOwner<Session>} owner
 * @param {{ modalId: string, success: boolean }} message
 * @param {string} expectedModalId
 */
export function settleHiddenParameterSession(owner, message, expectedModalId) {
  if (
    message.modalId !== expectedModalId ||
    message.success !== true ||
    !owner.currentSession
  ) {
    return false;
  }
  owner.finish(owner.currentSession, { hide: false });
  return true;
}
