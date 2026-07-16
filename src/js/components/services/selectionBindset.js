/**
 * Keep bindset context synchronized after a key selection without making the
 * SelectionService lifecycle facade own the request mechanics.
 *
 * @param {import('./SelectionService.js').default} service
 * @param {string} environment
 * @param {string | null} bindsetContext
 */
export async function syncSelectionBindset(
  service,
  environment,
  bindsetContext,
) {
  if (environment === "alias") return;

  const preferences = service.cache?.preferences || {};
  if (!preferences.bindsetsEnabled || !preferences.bindToAliasMode) return;

  const currentActive = service.cache?.activeBindset || "Primary Bindset";
  let targetBindset = null;
  if (bindsetContext && bindsetContext !== currentActive) {
    targetBindset = bindsetContext;
  } else if (!bindsetContext && currentActive !== "Primary Bindset") {
    targetBindset = "Primary Bindset";
  }
  if (!targetBindset) return;

  try {
    await service.request("bindset-selector:set-active-bindset", {
      bindset: targetBindset,
    });
  } catch (error) {
    console.warn(
      "[SelectionService] Failed to synchronize bindset context:",
      error,
    );
  }
}
