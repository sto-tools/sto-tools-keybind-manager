import UIComponentBase from "../UIComponentBase.js";
import FileSystemService from "../services/FileSystemService.js";
import {
  errorMessage,
  eventElement,
  resolveDocument,
  resolveI18n,
} from "./uiTypes.js";

const runtime = /** @type {import('./uiTypes.js').RuntimeGlobals} */ (
  globalThis
);

/*
 * FileExplorerUI – a UI component for managing file operations in the browser's file system.
 *
 * Responsibilities:
 * 1. Provide a file explorer interface for users to navigate and preview files.
 * 2. Provide a preview of the selected file's content.
 * 3. Provide a download button for the selected file.
 */

export default class FileExplorerUI extends UIComponentBase {
  /**
   * @param {{
   *   eventBus?: import('./uiTypes.js').EventBus,
   *   storage?: import('../services/StorageService.js').default,
   *   ui?: import('./uiTypes.js').UIServiceLike,
   *   fileSystem?: FileSystemService,
   *   document?: Document,
   *   i18n?: import('./uiTypes.js').I18nLike
   * }} [options]
   */
  constructor({
    eventBus,
    storage,
    ui,
    fileSystem,
    document = window.document,
    i18n,
  } = {}) {
    super(eventBus);
    this.componentName = "FileExplorerUI";

    this.storage = storage || runtime.storageService || null;
    this.ui = ui || runtime.stoUI || null;
    this.fileSystem = fileSystem || FileSystemService._getInstance();
    this.document = resolveDocument(document);
    this.i18n = resolveI18n(i18n);

    this.modalId = "fileExplorerModal";
    this.treeId = "fileTree";
    this.contentId = "fileContent";

    this.selectedNode = null;
  }

  // Lifecycle hooks
  onInit() {
    this.setupEventListeners();
  }

  // Event handling – DOM & app-bus
  setupEventListeners() {
    // Listen for file-explorer:open event from HeaderMenuUI
    this.eventBus?.on("file-explorer:open", () => {
      this.openExplorer();
    });

    // Open Explorer button (toolbar)
    this.onDom("fileExplorerBtn", "click", () => {
      this.openExplorer();
    });

    // Delegate clicks on tree nodes
    this.onDom(this.treeId, "click", (e) => {
      const node = eventElement(e)?.closest(".tree-node");
      if (!(node instanceof HTMLElement)) return;
      this.selectNode(node);
    });

    // Copy preview content → clipboard
    this.onDom("copyFileContentBtn", "click", async () => {
      const contentEl = this.document.getElementById(this.contentId);
      if (!contentEl) return;
      const text = contentEl.textContent || "";
      if (!text.trim()) {
        this.showToast(this.i18n.t("nothing_to_copy"), "warning");
        return;
      }
      const result = await this.request("utility:copy-to-clipboard", {
        text,
      });
      if (result?.success) {
        this.showToast(this.i18n.t(result?.message), "success");
      } else {
        this.showToast(this.i18n.t(result?.message), "error");
      }
    });

    // Download preview file
    this.onDom("downloadFileBtn", "click", async () => {
      if (!this.selectedNode) return;
      const { type, profileId, environment } = this.selectedNode;
      if (!profileId) return;
      const contentEl = this.document.getElementById(this.contentId);
      if (!contentEl) return;
      const text = contentEl.textContent || "";
      if (!text.trim()) return;

      let filename = this.i18n.t("default_export_filename");
      if (this.storage) {
        const profile = this.storage.getProfile(profileId);
        try {
          if (!profile?.name) {
            throw new Error(`Profile ${profileId} is unavailable`);
          }
          if (type === "build") {
            filename = await this.request("export:generate-filename", {
              profile,
              extension: "txt",
              environment: environment || undefined,
            });
          } else if (type === "aliases") {
            filename = await this.request("export:generate-alias-filename", {
              profile,
              extension: "txt",
            });
          }
        } catch (error) {
          console.error(
            "Failed to generate filename via ExportService:",
            error,
          );
          // Keep default filename
        }
      }
      this.downloadFile(text, filename, "text/plain");
    });
  }

  // UI actions
  openExplorer() {
    this.buildTree();
    // Reset preview
    const contentEl = this.document.getElementById(this.contentId);
    if (contentEl) {
      contentEl.textContent = this.i18n.t(
        "select_an_item_on_the_left_to_preview_export",
      );
    }
    this.emit("modal:show", { modalId: this.modalId });
  }

  buildTree() {
    const treeEl = this.document.getElementById(this.treeId);
    if (!treeEl || !this.storage) return;
    treeEl.innerHTML = "";

    const data = this.storage.getAllData();
    const profiles = data.profiles || {};

    Object.entries(profiles).forEach(([profileId, profile]) => {
      const profileNode = this.createNode("profile", profile.name, {
        profileId,
      });

      // Child container
      const childrenContainer = this.document.createElement("div");
      childrenContainer.className = "tree-children";

      // Space Build
      if (profile.builds && profile.builds.space) {
        const spaceNode = this.createNode("build", this.i18n.t("space_build"), {
          profileId,
          environment: "space",
        });
        childrenContainer.appendChild(spaceNode);
      }

      // Ground Build
      if (profile.builds && profile.builds.ground) {
        const groundNode = this.createNode(
          "build",
          this.i18n.t("ground_build"),
          {
            profileId,
            environment: "ground",
          },
        );
        childrenContainer.appendChild(groundNode);
      }

      // Aliases node (aggregated)
      const aliasNode = this.createNode("aliases", this.i18n.t("aliases"), {
        profileId,
      });
      childrenContainer.appendChild(aliasNode);

      profileNode.appendChild(childrenContainer);
      treeEl.appendChild(profileNode);
    });
  }

  /**
   * @param {string} type
   * @param {string} label
   * @param {Record<string, string>} [dataset]
   */
  createNode(type, label, dataset = {}) {
    const node = this.document.createElement("div");
    node.className = `tree-node ${type}`;
    node.textContent = label;
    node.dataset.type = type;
    Object.entries(dataset).forEach(([k, v]) =>
      node.setAttribute(`data-${k}`, v),
    );
    return node;
  }

  /** @param {HTMLElement} node */
  async selectNode(node) {
    // Remove previous selection
    const prevSel = this.document.querySelector(".tree-node.selected");
    if (prevSel) prevSel.classList.remove("selected");
    node.classList.add("selected");

    const type = node.dataset.type || node.getAttribute("data-type");
    const profileId = node.getAttribute("data-profileid");
    const environment = node.getAttribute("data-environment");

    this.selectedNode = { type, profileId, environment };

    if (!profileId || !this.storage) return;

    try {
      let exportContent = "";
      if (type === "build") {
        exportContent = await this.generateBuildExport(profileId, environment);
      } else if (type === "aliases") {
        exportContent = await this.generateAliasExport(profileId);
      } else {
        exportContent = this.i18n.t(
          "select_a_space_ground_build_or_aliases_to_preview_export",
        );
      }

      const contentEl = this.document.getElementById(this.contentId);
      if (contentEl)
        contentEl.textContent =
          exportContent || this.i18n.t("no_content_available");
    } catch (err) {
      console.error("Failed to generate export content:", err);
      this.ui?.showToast?.(this.i18n.t("failed_to_generate_export"), "error");
    }
  }

  // Export helpers – use request/response to ExportService
  /**
   * @param {string} profileId
   * @param {string | null} environment
   */
  async generateBuildExport(profileId, environment) {
    if (!this.storage || !environment) return "";
    const profile = this.storage.getProfile(profileId);
    if (!profile || !profile.builds || !profile.builds[environment]) return "";

    return await this.request("export:generate-keybind-file", {
      profileId,
      environment,
    }).catch((error) => {
      console.error(
        "Failed to generate keybind export via ExportService:",
        error,
      );
      return `; Failed to generate export: ${errorMessage(error)}`;
    });
  }

  /** @param {string} profileId */
  async generateAliasExport(profileId) {
    if (!this.storage) return "";
    const rootProfile = this.storage.getProfile(profileId);
    if (!rootProfile) return "";

    return await this.request("export:generate-alias-file", {
      profileId,
    }).catch((error) => {
      console.error(
        "Failed to generate alias export via ExportService:",
        error,
      );
      return `; Failed to generate export: ${errorMessage(error)}`;
    });
  }

  /**
   * @param {string} content
   * @param {string} filename
   * @param {string} mimeType
   */
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = this.document.createElement("a");
    a.href = url;
    a.download = filename;
    this.document.body.appendChild(a);
    a.click();
    this.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
