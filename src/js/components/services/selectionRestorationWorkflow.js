import { getSnapshotPrimaryKeys } from "./dataState.js";
import { publishActiveSelection } from "./selectionReconciliation.js";
import {
  planAutomaticSelection,
  planEnvironmentSelectionTransition,
  planProfileSelectionTransition,
  planSelectionRestoration,
} from "./selectionRestoration.js";
import { applyActiveSelection } from "./selectionState.js";

/** @typedef {import('./SelectionService.js').default} SelectionService */

/**
 * @param {SelectionService} service
 * @param {string} environment
 */
function automaticPlanFor(service, environment) {
  return planAutomaticSelection({
    profileAvailable: Boolean(
      service.cache.profile && service.cache.currentProfile,
    ),
    environment,
    activeEnvironment: service.selectionEnvironment,
    aliases: service.cache.aliases,
    profileAliases: service.cache.profile?.aliases,
    primaryKeys:
      environment === "alias"
        ? {}
        : getSnapshotPrimaryKeys(service.cache.dataState, environment),
    excludedKey: service._lastDeletedKey,
    excludedAlias: service._lastDeletedAlias,
  });
}

/**
 * @param {SelectionService} service
 * @param {ReturnType<typeof planAutomaticSelection>} plan
 * @param {() => boolean} isCurrent
 * @returns {Promise<string | null>}
 */
async function executeAutomaticPlan(service, plan, isCurrent) {
  if (!isCurrent()) return null;
  if (plan.kind === "select" && plan.target === "alias") {
    await service.selectAlias(plan.selection, { isAuto: true, isCurrent });
    if (!isCurrent()) return null;
    service._lastDeletedAlias = null;
    return plan.selection;
  }
  if (plan.kind === "select") {
    await service.selectKey(plan.selection, plan.environment, {
      isAuto: true,
      bindset: plan.bindset,
      isCurrent,
    });
    if (!isCurrent()) return null;
    service._lastDeletedKey = null;
    return plan.selection;
  }
  if (plan.kind === "clear" && plan.target === "alias") {
    await service.selectAlias(null, { isAuto: true, isCurrent });
  } else if (plan.kind === "clear") {
    await service.selectKey(null, plan.environment, {
      isAuto: true,
      isCurrent,
    });
  }
  return null;
}

/**
 * @param {SelectionService} service
 * @param {'restore' | 'profile-update'} reason
 * @param {string} environment
 * @param {string | null | undefined} cachedSelection
 * @param {boolean} skipPersistence
 */
function restorationPlanFor(
  service,
  reason,
  environment,
  cachedSelection,
  skipPersistence,
) {
  return planSelectionRestoration({
    reason,
    profileAvailable: Boolean(
      service.cache.profile && service.cache.currentProfile,
    ),
    environment,
    activeEnvironment: service.selectionEnvironment,
    cachedSelection,
    profile: service.cache.profile,
    aliases: service.cache.aliases,
    profileAliases: service.cache.profile?.aliases,
    primaryKeys:
      environment === "alias"
        ? {}
        : getSnapshotPrimaryKeys(service.cache.dataState, environment),
    excludedKey: service._lastDeletedKey,
    excludedAlias: service._lastDeletedAlias,
    skipPersistence,
  });
}

/**
 * @param {SelectionService} service
 * @param {ReturnType<typeof planSelectionRestoration>} plan
 * @param {() => boolean} isCurrent
 */
async function executeRestorationPlan(service, plan, isCurrent) {
  if (plan.kind === "unavailable") return;
  if (plan.kind === "publish-empty") {
    publishActiveSelection(service, plan.environment, null);
    return;
  }
  if (!isCurrent()) return;
  if (plan.kind === "auto-select") {
    await service.autoSelectFirst(plan.environment, { isCurrent });
    return;
  }
  if (plan.kind === "restore") {
    if (plan.target === "alias") {
      await service.selectAlias(plan.selection, {
        isAuto: true,
        skipPersistence: plan.skipPersistence,
        isCurrent,
      });
    } else {
      await service.selectKey(plan.selection, plan.environment, {
        isAuto: true,
        skipPersistence: plan.skipPersistence,
        isCurrent,
      });
    }
    return;
  }

  service.setCachedSelection(plan.environment, null);
  if (plan.clearActive) {
    if (plan.target === "alias") {
      service.cache.selectedAlias = null;
      service.broadcastState();
      if (!isCurrent()) return;
      service.emit("alias-selected", {
        name: null,
        source: "SelectionService",
      });
    } else {
      service.cache.selectedKey = null;
      service.broadcastState();
      if (!isCurrent()) return;
      service.emit("key-selected", {
        key: null,
        environment: plan.environment,
        bindset: null,
        source: "SelectionService",
      });
    }
  }
  await service.autoSelectFirst(plan.environment, { isCurrent });
}

/**
 * Apply one profile transition while SelectionService retains listener,
 * lifecycle, cache, and publication ownership.
 *
 * @param {SelectionService} service
 * @param {{
 *   profileId: string | null,
 *   profile: import('./serviceTypes.js').ProfileData | null,
 *   environment?: string | null
 * }} payload
 */
export function handleProfileSelectionSwitch(
  service,
  { profileId, profile, environment },
) {
  service.selectionIntents.clear();
  console.log(
    `[SelectionService] profile:switched: profileId="${profileId}", env="${environment}"`,
  );

  service.updateCacheFromProfile(profile);
  const plan = planProfileSelectionTransition({
    profile,
    eventEnvironment: environment,
  });
  service.selectionEnvironment = plan.environment;
  service.cache.currentEnvironment = plan.environment;

  if (!plan.hasProfile) {
    service.replaceCachedSelections(null);
    service.cache.selectedKey = null;
    service.cache.selectedAlias = null;
    service.selectionTransitions.defer(async (isCurrent) => {
      if (!isCurrent()) return;
      service.broadcastState();
      if (!isCurrent()) return;
      service.emit("key-selected", { key: null, source: "SelectionService" });
      if (!isCurrent()) return;
      service.emit("alias-selected", {
        name: null,
        source: "SelectionService",
      });
    });
    return;
  }

  service.replaceCachedSelections(profile);
  applyActiveSelection(service.cache, plan.environment, plan.cachedSelection);

  service.selectionTransitions.defer(async (isCurrent) => {
    if (!isCurrent()) return;
    service.broadcastState();
    if (!isCurrent()) return;
    if (plan.environment === "alias") {
      service.emit("alias-selected", {
        name: plan.cachedSelection,
        source: "SelectionService",
      });
    } else {
      service.emit("key-selected", {
        key: plan.cachedSelection,
        environment: plan.environment,
        bindset: null,
        source: "SelectionService",
      });
    }
    if (!isCurrent()) return;
    await service.validateAndRestoreSelection(
      plan.environment,
      plan.cachedSelection,
      { isCurrent, skipPersistence: true },
    );
  });
}

/**
 * @param {SelectionService} service
 * @param {string} newEnvironment
 * @param {string | null} [previousEnvironment]
 */
export async function switchSelectionEnvironment(
  service,
  newEnvironment,
  previousEnvironment = null,
) {
  const isCurrent = service.selectionTransitions.begin();
  const resolvedPrevious = previousEnvironment ?? service.selectionEnvironment;
  const pendingIntent = service.selectionIntents.get(resolvedPrevious);
  const plan = planEnvironmentSelectionTransition({
    newEnvironment,
    previousEnvironment,
    activeEnvironment: service.selectionEnvironment,
    selectedKey: service.cache.selectedKey,
    selectedAlias: service.cache.selectedAlias,
    cachedSelections: service.cachedSelections,
    profileSelections: service.cache.profile?.selections,
    builds: service.cache.builds || service.cache.profile?.builds,
    profileKeys: service.cache.profile?.keys,
    hasPendingPreviousIntent: Boolean(pendingIntent),
  });

  if (plan.shouldRememberPrevious) {
    service.setCachedSelection(
      plan.previousEnvironment,
      plan.previousSelection,
    );
  }
  const previousPersistence =
    pendingIntent?.persistence ||
    (plan.previousSelection
      ? service.persistSelectionToProfile(
          plan.previousEnvironment,
          plan.previousSelection,
        )
      : Promise.resolve(true));

  service.selectionEnvironment = newEnvironment;
  service.cache.currentEnvironment = newEnvironment;
  if (newEnvironment) service.cache.keys = plan.targetKeys;
  if (plan.shouldRememberTarget) {
    service.setCachedSelection(newEnvironment, plan.targetSelection);
  }

  console.log(
    `[SelectionService] Switching to ${newEnvironment}, cached selection: "${plan.targetSelection}"`,
  );
  if (plan.target === "alias") {
    service.emit("key-selected", { key: null, source: "SelectionService" });
    if (!isCurrent()) return;
    applyActiveSelection(service.cache, newEnvironment, plan.targetSelection);
    service.broadcastState();
    if (!isCurrent()) return;
    service.emit("alias-selected", {
      name: plan.targetSelection,
      source: "SelectionService",
    });
  } else {
    service.emit("alias-selected", {
      name: null,
      source: "SelectionService",
    });
    if (!isCurrent()) return;
    applyActiveSelection(service.cache, newEnvironment, plan.targetSelection);
    service.broadcastState();
    if (!isCurrent()) return;
    service.emit("key-selected", {
      key: plan.targetSelection,
      environment: newEnvironment,
      bindset: null,
      source: "SelectionService",
    });
  }

  await previousPersistence;
  if (!isCurrent()) return;
  await service.validateAndRestoreSelection(
    newEnvironment,
    plan.targetSelection,
    { isCurrent, skipPersistence: true },
  );
}

/**
 * @param {SelectionService} service
 * @param {string | null} [environment]
 * @param {{ isCurrent?: () => boolean }} [options]
 */
export async function autoSelectFirstSelection(
  service,
  environment = null,
  options = {},
) {
  const isCurrent = options.isCurrent || service.selectionTransitions.begin();
  if (!isCurrent()) return null;
  if (!service.cache.profile || !service.cache.currentProfile) {
    console.log(
      "[SelectionService] Profile data not loaded, skipping auto-selection",
    );
    return null;
  }
  const targetEnvironment = environment || service.selectionEnvironment;
  return executeAutomaticPlan(
    service,
    automaticPlanFor(service, targetEnvironment),
    isCurrent,
  );
}

/**
 * @param {SelectionService} service
 * @param {string} environment
 * @param {string | null | undefined} cachedSelection
 * @param {{ skipPersistence?: boolean, isCurrent?: () => boolean }} [options]
 */
export async function validateAndRestoreSelection(
  service,
  environment,
  cachedSelection,
  options = {},
) {
  const { skipPersistence = false } = options;
  const isCurrent = options.isCurrent || service.selectionTransitions.begin();
  if (!isCurrent()) return;
  console.log(
    `[SelectionService] validateAndRestoreSelection: env="${environment}", cached="${cachedSelection}", skipPersistence=${skipPersistence}`,
  );
  if (!service.cache.profile || !service.cache.currentProfile) {
    console.log("[SelectionService] Profile data not available for validation");
    return;
  }
  const plan = restorationPlanFor(
    service,
    "restore",
    environment,
    cachedSelection,
    skipPersistence,
  );
  await executeRestorationPlan(service, plan, isCurrent);
}

/** @param {SelectionService} service */
export async function validateSelectionAfterProfileUpdate(service) {
  if (!service.cache.profile || !service.cache.currentProfile) return;
  const environment = service.selectionEnvironment;
  const selection = service.cachedSelections[environment];
  const plan = restorationPlanFor(
    service,
    "profile-update",
    environment,
    selection,
    true,
  );
  const isCurrent = service.selectionTransitions.begin();
  await executeRestorationPlan(service, plan, isCurrent);
}
