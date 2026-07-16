import UIComponentBase from "../UIComponentBase.js";
import {
  errorMessage,
  eventElement,
  resolveDocument,
  resolveI18n,
} from "./uiTypes.js";

const runtime = /** @type {import('./uiTypes.js').RuntimeGlobals} */ (
  globalThis
);

/**
 * ProfileUI - Handles all profile-related UI operations
 * Manages profile rendering, modals, and user interactions
 */
export default class ProfileUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus: import('./uiTypes.js').EventBus,
   *   ui?: import('./uiTypes.js').UIServiceLike | null,
   *   modalManager?: import('./uiTypes.js').ModalManagerLike | null,
   *   confirmDialog?: import('./uiTypes.js').ConfirmDialogLike | null,
   *   document?: Document | null,
   *   i18n: import('./uiTypes.js').I18nLike
   * }} options
   */
  constructor({
    eventBus,
    ui = null,
    modalManager = null,
    confirmDialog = null,
    document = null,
    i18n,
  }) {
    super(eventBus);
    this.componentName = "ProfileUI";

    this.ui = ui;
    this.modalManager = modalManager;
    this.confirmDialog = confirmDialog || runtime.confirmDialog || null;
    this.document = resolveDocument(document);

    this.i18n = resolveI18n(i18n);

    this._isModified = false;

    this.currentModal = null;

    this.eventListenersSetup = false;
  }

  // Initialize the ProfileUI component – called by ComponentBase after the
  // late-join handshake wiring is set up.
  onInit() {
    this.setupEventListeners();
    this.renderProfiles();
    this.updateProfileInfo();
  }

  // Set up all event listeners for profile UI
  setupEventListeners() {
    if (this.eventListenersSetup) {
      return; // Prevent duplicate event listener setup
    }
    this.eventListenersSetup = true;

    // Profile dropdown change using EventBus
    const profileSelect = this.document.getElementById("profileSelect");
    if (profileSelect) {
      this.onDom(profileSelect, "change", "profile-switch", (e) => {
        const target = eventElement(e);
        if (target instanceof HTMLSelectElement) {
          this.handleProfileSwitch(target.value);
        }
      });
    }

    // Profile action buttons
    this.onDom("newProfileBtn", "click", "profile-new", () => {
      this.showNewProfileModal();
    });

    this.onDom("cloneProfileBtn", "click", "profile-clone", () => {
      this.showCloneProfileModal();
    });

    this.onDom("renameProfileBtn", "click", "profile-rename", () => {
      this.showRenameProfileModal();
    });

    this.onDom("deleteProfileBtn", "click", "profile-delete", () => {
      this.confirmDeleteProfile();
    });

    // Profile modal save button
    this.onDom("saveProfileBtn", "click", "profile-save", () => {
      this.handleProfileSave();
    });

    // -------------------------------------------
    // Listen for global events to keep caches sync - broadcast/cache pattern
    // -------------------------------------------
    this.addEventListener("profile:switched", () => {
      // ComponentBase handles caching automatically
      this._isModified = false; // new profile starts clean
      this.renderProfiles();
      this.updateProfileInfo();
    });

    this.addEventListener("environment:changed", () => {
      // ComponentBase handles caching automatically
      this.updateProfileInfo();
    });

    this.addEventListener("profile-modified", () => {
      this._isModified = true;
      this.updateProfileInfo();
    });

    // Listen for profile updates to keep cached data fresh
    this.addEventListener("current-profile:updated", () => {
      // ComponentBase handles caching automatically
      this.updateProfileInfo();
    });
  }

  // Handle profile switching - using DataCoordinator directly for better performance
  /** @param {string} profileId */
  async handleProfileSwitch(profileId) {
    try {
      // Use DataCoordinator directly for better performance
      const result = await this.request("data:switch-profile", { profileId });
      if (result?.switched) {
        // Key grid will be updated automatically via events
        // Command chain handled elsewhere – just refresh our info UI
        this.updateProfileInfo();
        this.showToast(result.message, "success");
      }
    } catch (error) {
      this.showToast(errorMessage(error), "error");
    }
  }

  // Render the profiles dropdown - using DataCoordinator directly
  async renderProfiles() {
    const select = this.document.getElementById("profileSelect");
    if (!select) return;

    // Use DataCoordinator directly for better performance
    const profiles = await this.request("data:get-all-profiles");
    select.innerHTML = "";

    const profileEntries = Object.entries(profiles || {});
    if (profileEntries.length === 0) {
      const option = this.document.createElement("option");
      option.value = "";
      option.textContent = this.i18n.t("no_profiles_available");
      option.disabled = true;
      select.appendChild(option);
    } else {
      profileEntries.forEach(([id, profile]) => {
        const option = this.document.createElement("option");
        option.value = id;
        option.textContent = profile.name || id;
        if (id === this.cache.currentProfile) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    }

    this.updateProfileInfo();
  }

  // Update profile information display - using cached state (broadcast/cache pattern)
  updateProfileInfo() {
    // Use cached state instead of request/response - follows broadcast/cache pattern
    const modeBtns = this.document.querySelectorAll(".mode-btn");
    modeBtns.forEach((element) => {
      const btn = /** @type {HTMLButtonElement} */ (element);
      btn.classList.toggle(
        "active",
        Boolean(
          this.cache.profile &&
            btn.dataset.mode === this.cache.currentEnvironment,
        ),
      );
      btn.disabled = !this.cache.currentProfile;
    });

    const keyCount = this.document.getElementById("keyCount");
    const aliasCount = this.document.getElementById("aliasCount");

    if (!keyCount || !aliasCount) return;

    if (this.cache.currentEnvironment === "alias") {
      // Hide key count, show alias count
      keyCount.style.display = "none";
      aliasCount.style.display = "";

      // Update alias count (total aliases in profile)
      const totalAliases = Object.keys(this.cache.aliases || {}).length;
      const aliasText =
        totalAliases === 1
          ? this.i18n.t("alias_lowercase")
          : this.i18n.t("aliases_lowercase");
      aliasCount.textContent = `${totalAliases} ${aliasText}`;
    } else {
      // Show key count, hide alias count
      keyCount.style.display = "";
      aliasCount.style.display = "none";

      // Update key count (existing logic)
      if (this.cache.profile) {
        const currentBuild =
          this.cache.profile.builds?.[this.cache.currentEnvironment];
        const count = Object.keys(currentBuild?.keys || {}).length;
        const keyText = count === 1 ? this.i18n.t("key") : this.i18n.t("keys");
        keyCount.textContent = `${count} ${keyText}`;
      } else {
        keyCount.textContent = this.i18n.t("no_profile");
      }
    }

    // Update modified indicator
    const indicator = this.document.getElementById("modifiedIndicator");
    if (indicator) {
      indicator.style.display = this._isModified ? "inline" : "none";
    }
  }

  // Show new profile modal
  showNewProfileModal() {
    const title = this.document.getElementById("profileModalTitle");
    const nameInput = /** @type {HTMLInputElement | null} */ (
      this.document.getElementById("profileName")
    );
    const descInput = /** @type {HTMLTextAreaElement | null} */ (
      this.document.getElementById("profileDescription")
    );

    if (title) title.textContent = this.i18n.t("new_profile");
    if (nameInput) {
      nameInput.value = "";
      nameInput.placeholder = "Enter profile name";
    }
    if (descInput) {
      descInput.value = "";
    }

    this.currentModal = "new";
    this.modalManager?.show("profileModal");
  }

  // Show clone profile modal - using cached state (broadcast/cache pattern)
  showCloneProfileModal() {
    // Use cached state instead of request/response - follows broadcast/cache pattern
    if (!this.cache.profile) {
      this.showToast(this.i18n.t("no_profile_selected_to_clone"), "warning");
      return;
    }

    const title = this.document.getElementById("profileModalTitle");
    const nameInput = /** @type {HTMLInputElement | null} */ (
      this.document.getElementById("profileName")
    );
    const descInput = /** @type {HTMLTextAreaElement | null} */ (
      this.document.getElementById("profileDescription")
    );

    if (title) title.textContent = this.i18n.t("clone_profile");
    if (nameInput) {
      nameInput.value = `${this.cache.profile.name} Copy`;
      nameInput.placeholder = "Enter new profile name";
    }
    if (descInput) {
      descInput.value = `Copy of ${this.cache.profile.name}`;
    }

    this.currentModal = "clone";
    this.modalManager?.show("profileModal");
  }

  // Show rename profile modal - using cached state (broadcast/cache pattern)
  showRenameProfileModal() {
    // Use cached state instead of request/response - follows broadcast/cache pattern
    if (!this.cache.profile) {
      this.showToast(this.i18n.t("no_profile_selected_to_rename"), "warning");
      return;
    }

    const title = this.document.getElementById("profileModalTitle");
    const nameInput = /** @type {HTMLInputElement | null} */ (
      this.document.getElementById("profileName")
    );
    const descInput = /** @type {HTMLTextAreaElement | null} */ (
      this.document.getElementById("profileDescription")
    );

    if (title) title.textContent = this.i18n.t("rename_profile");
    if (nameInput) {
      nameInput.value = this.cache.profile.name || "";
      nameInput.placeholder = "Enter profile name";
    }
    if (descInput) {
      descInput.value = this.cache.profile.description || "";
    }

    this.currentModal = "rename";
    this.modalManager?.show("profileModal");
  }

  // Handle profile save from modal
  async handleProfileSave() {
    const nameInput = /** @type {HTMLInputElement | null} */ (
      this.document.getElementById("profileName")
    );
    const descInput = /** @type {HTMLTextAreaElement | null} */ (
      this.document.getElementById("profileDescription")
    );

    if (!nameInput) return;

    const name = nameInput.value.trim();
    const description = descInput ? descInput.value.trim() : "";

    if (!name) {
      this.showToast(this.i18n.t("profile_name_required"), "error");
      return;
    }

    try {
      let result;
      switch (this.currentModal) {
        case "new": {
          // Use DataCoordinator directly for better performance
          result = await this.request("data:create-profile", {
            name,
            description,
          });
          if (result?.success) {
            await this.request("data:switch-profile", {
              profileId: result.profileId,
            });
            await this.renderProfiles();
            // Key grid will be updated automatically via events
            this.updateProfileInfo();
            this.showToast(result.message, "success");
          }
          break;
        }
        case "clone": {
          const sourceId = this.cache.currentProfile;
          if (!sourceId) {
            this.showToast(
              this.i18n.t("no_profile_selected_to_clone"),
              "warning",
            );
            break;
          }
          // Use DataCoordinator directly for better performance
          result = await this.request("data:clone-profile", {
            sourceId,
            newName: name,
          });
          if (result?.success) {
            await this.renderProfiles();
            this.showToast(result.message, "success");
          }
          break;
        }
        case "rename": {
          const profileId = this.cache.currentProfile;
          if (!profileId) {
            this.showToast(
              this.i18n.t("no_profile_selected_to_rename"),
              "warning",
            );
            break;
          }
          // Use DataCoordinator directly for better performance
          result = await this.request("data:rename-profile", {
            profileId,
            newName: name,
            description,
          });
          if (result?.success) {
            await this.renderProfiles();
            this.updateProfileInfo();
            this.showToast(
              result.message || this.i18n.t("profile_renamed"),
              "success",
            );
          }
          break;
        }
      }

      this.modalManager?.hide("profileModal");
      this.currentModal = null;
    } catch (error) {
      this.showToast(errorMessage(error), "error");
    }
  }

  // Confirm profile deletion - using cached state (broadcast/cache pattern)
  async confirmDeleteProfile() {
    // Use cached state instead of request/response - follows broadcast/cache pattern
    if (!this.cache.profile || !this.cache.currentProfile) {
      this.showToast(this.i18n.t("no_profile_selected_to_delete"), "warning");
      return;
    }

    if (!this.confirmDialog) return;

    const message = this.i18n.t("confirm_delete_profile", {
      profileName: this.cache.profile.name,
    });
    const title = this.i18n.t("confirm_delete");

    if (
      await this.confirmDialog.confirm(
        message,
        title,
        "danger",
        "profileDelete",
      )
    ) {
      this.deleteCurrentProfile();
    }
  }

  // Delete the current profile - using DataCoordinator directly
  async deleteCurrentProfile() {
    try {
      const profileId = this.cache.currentProfile;
      if (!profileId) {
        this.showToast(this.i18n.t("no_profile_selected_to_delete"), "warning");
        return;
      }
      // Use DataCoordinator directly for better performance
      const result = await this.request("data:delete-profile", {
        profileId,
      });
      if (result.success) {
        if (result.switchedProfile) {
          // Key grid will be updated automatically via events
          // Command chain rendering is now handled by CommandChainUI via events
          this.updateProfileInfo();
        }
        this.renderProfiles();
        this.showToast(result.message, "success");
      }
    } catch (error) {
      this.showToast(errorMessage(error), "error");
    }
  }

  // Late-join handshake – receive initial snapshot from services
  /**
   * @param {import('../../types/events/component-state.js').ComponentStateReply} reply
   */
  handleInitialState({ sender }) {
    // ComponentBase handles caching, we just need to update the UI
    if (sender === "DataCoordinator") {
      // UI hydration
      this.renderProfiles();
      this.updateProfileInfo();
    }
  }

  // Provide serialisable snapshot for other late-joiners (rarely needed)
  /** @returns {import('../../types/events/component-state.js').ComponentState<'ProfileUI'>} */
  getCurrentState() {
    return {
      currentProfile: this.cache.currentProfile,
      currentEnvironment: this.cache.currentEnvironment,
      modified: this._isModified,
    };
  }
}
