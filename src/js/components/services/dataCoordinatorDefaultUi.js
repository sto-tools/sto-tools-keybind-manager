/**
 * Keep the user-confirmation and toast flow separate from DataCoordinator's
 * persistence/state authority. Lifecycle checks prevent a replaced coordinator
 * from resuming the UI flow after either awaited step.
 *
 * @param {import('./DataCoordinator.js').default} coordinator
 * @returns {Promise<void>}
 */
export async function handleLoadDefaultDataUi(coordinator) {
  console.log("[DataCoordinator] Handling load default data request");
  const operation = coordinator._captureOperationGeneration();

  try {
    const existingDefaultProfile = Object.entries(
      coordinator.state.profiles,
    ).find(
      ([, profile]) => profile.name && profile.name.toLowerCase() === "default",
    );

    if (existingDefaultProfile) {
      const [profileId, profile] = existingDefaultProfile;
      console.log(
        `[DataCoordinator] Default profile already exists: ${profileId} - "${profile.name}"`,
      );

      let confirmed = false;
      try {
        confirmed = await coordinator.request(
          "ui:confirm",
          {
            message: coordinator.i18n.t("default_profile_exists_message"),
            title: coordinator.i18n.t("default_profile_exists_title"),
            type: "warning",
            context: "loadDefaultData",
          },
          0,
        );
      } catch (error) {
        console.warn(
          "[DataCoordinator] Default-profile confirmation unavailable:",
          error,
        );
        if (!coordinator._isCurrentOperation(operation)) return;
        coordinator.emit("toast:show", {
          message: coordinator.i18n.t("default_profile_exists_no_overwrite"),
          type: "warning",
        });
        return;
      }
      if (!coordinator._isCurrentOperation(operation)) return;
      if (!confirmed) {
        console.log("[DataCoordinator] User cancelled default data load");
        return;
      }
    }

    console.log("[DataCoordinator] Loading default data...");
    const result = await coordinator.loadDefaultData();
    if (!coordinator._isCurrentOperation(operation)) return;

    if (result.success) {
      coordinator.emit("toast:show", {
        message: coordinator.i18n.t("default_data_loaded_successfully"),
        type: "success",
      });
      console.log("[DataCoordinator] Default data loaded successfully");
      return;
    }

    coordinator.emit("toast:show", {
      message: coordinator.i18n.t("default_data_load_failed"),
      type: "error",
    });
    console.error(
      "[DataCoordinator] Failed to load default data:",
      result.error,
    );
  } catch (error) {
    if (!coordinator._isCurrentOperation(operation)) return;
    console.error("[DataCoordinator] Error handling load default data:", error);
    coordinator.emit("toast:show", {
      message: coordinator.i18n.t("default_data_load_error"),
      type: "error",
    });
  }
}
