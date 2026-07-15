/**
 * Compatibility-only topics emitted as a side effect of DOM registration.
 * They are intentionally absent from EventProtocol and are accepted only by
 * the typed onDom/onDomDebounced surfaces below.
 */
export type LiteralLegacyDomMirrorTopic =
  | "about-open"
  | "alias-category-header"
  | "alias-chain-add"
  | "alias-chain-delete"
  | "alias-chain-duplicate"
  | "alias-filter"
  | "alias-filter-key"
  | "alias-item-click"
  | "alias-search-toggle"
  | "alias-show-all"
  | "alias-strategy-cancel"
  | "alias-strategy-confirm"
  | "alias-strategy-regen-cancel"
  | "alias-strategy-regen-confirm"
  | "aliases-import"
  | "app-reset"
  | "backup-toggle"
  | "bindset-add-key"
  | "bindset-create"
  | "bindset-delete"
  | "bindset-escape"
  | "bindset-manage"
  | "bindset-manager-open"
  | "bindset-menu-btn"
  | "bindset-menu-outside"
  | "bindset-option-selected"
  | "bindset-outside-click"
  | "bindset-remove-key"
  | "bindset-rename"
  | "bindset-section-header-click"
  | "bindset-selection-cancel"
  | "bindset-selection-confirm"
  | "bindset-selection-regen-cancel"
  | "bindset-selection-regen-confirm"
  | "bindset-target-change"
  | "bindset-toggle"
  | "cancel-key-selection"
  | "category-header-click"
  | "command-category-header"
  | "command-chain-clear"
  | "command-chain-validate"
  | "command-clear-filter"
  | "command-item-click"
  | "command-search"
  | "command-search-key"
  | "command-search-toggle"
  | "commandchain-action"
  | "commandchain-copy-alias"
  | "commandchain-copy-preview"
  | "commandchain-edit-customizable"
  | "commandchain-group-header"
  | "commandchain-palindromic-toggle"
  | "commandchain-placement-toggle"
  | "commandchain-stabilize"
  | "confirm-dialog-no"
  | "confirm-dialog-regen-no"
  | "confirm-dialog-regen-yes"
  | "confirm-dialog-yes"
  | "confirm-import"
  | "confirm-key-selection"
  | "data-load-default"
  | "document-click-outside"
  | "enhanced-bindset-selection-cancel"
  | "enhanced-bindset-selection-confirm"
  | "enhanced-bindset-selection-regen-cancel"
  | "enhanced-bindset-selection-regen-confirm"
  | "file-explorer-open"
  | "fileExplorer-copy-content"
  | "fileExplorer-download"
  | "fileExplorer-open"
  | "fileExplorer-tree-click"
  | "import-dialog-cancel"
  | "import-dialog-ground"
  | "import-dialog-regen-cancel"
  | "import-dialog-regen-ground"
  | "import-dialog-regen-space"
  | "import-dialog-space"
  | "import-from-key-or-alias"
  | "import-toggle"
  | "inform-dialog-ok"
  | "inform-dialog-regen-ok"
  | "kbf-import"
  | "key-add"
  | "key-delete"
  | "key-duplicate"
  | "key-element-click"
  | "key-filter"
  | "key-filter-key"
  | "key-search-toggle"
  | "keybinds-export"
  | "keybinds-import"
  | "language-change"
  | "language-toggle"
  | "layout-change"
  | "location-specific-toggle"
  | "overwrite-confirm-no"
  | "overwrite-confirm-regen-no"
  | "overwrite-confirm-regen-yes"
  | "overwrite-confirm-yes"
  | "parameter-command-save"
  | "parameter-modal-close"
  | "pref-cat"
  | "pref-save"
  | "preferences-open"
  | "profile-clone"
  | "profile-delete"
  | "profile-new"
  | "profile-rename"
  | "profile-save"
  | "profile-switch"
  | "project-open"
  | "project-save"
  | "settings-toggle"
  | "show-all-keys"
  | "single-bindset-selection-cancel"
  | "single-bindset-selection-confirm"
  | "single-bindset-selection-regen-cancel"
  | "single-bindset-selection-regen-confirm"
  | "sync-now"
  | "theme-toggle"
  | "toggle-capture-mode"
  | "toggle-key-view"
  | "validation-dialog-ok"
  | "vfx-effect-change"
  | "vfx-ground-clear-all"
  | "vfx-ground-select-all"
  | "vfx-open"
  | "vfx-playersay-change"
  | "vfx-save"
  | "vfx-space-clear-all"
  | "vfx-space-select-all"
  | "virtual-key-click";

export type InputDialogDomMirrorTopic =
  `input-dialog-${"submit" | "cancel" | "input" | "keydown"}${"" | "-regen"}`;
export type ModeChangeDomMirrorTopic =
  `mode-change-${"space" | "ground" | "alias"}`;
export type BindsetMenuDomMirrorTopic =
  `bindset-menu-${"create" | "clone" | "rename" | "delete"}`;
export type PreferenceDomMirrorTopic = `pref-${
  | "language"
  | "translateGeneratedMessages"
  | "autoSave"
  | "autoSync"
  | "autoSyncInterval"
  | "bindToAliasMode"
  | "bindsetsEnabled"}`;

export type DynamicLegacyDomMirrorTopic =
  | InputDialogDomMirrorTopic
  | ModeChangeDomMirrorTopic
  | BindsetMenuDomMirrorTopic
  | PreferenceDomMirrorTopic;

export type LegacyDomMirrorTopic =
  | LiteralLegacyDomMirrorTopic
  | DynamicLegacyDomMirrorTopic;

export type DomMirrorHandler = (event: Event) => unknown;
export type DomMirrorDetach = () => void;

export interface LegacyDomMirrorSurface {
  onDom(
    target: string | EventTarget,
    domEvent: string,
    handler: DomMirrorHandler,
  ): DomMirrorDetach;
  onDom(
    target: string | EventTarget,
    domEvent: string,
    busEvent: LegacyDomMirrorTopic,
    handler?: DomMirrorHandler,
  ): DomMirrorDetach;

  onDomDebounced(
    target: string | EventTarget,
    domEvent: string,
    handler: DomMirrorHandler,
    delay?: number,
  ): DomMirrorDetach;
  onDomDebounced(
    target: string | EventTarget,
    domEvent: string,
    busEvent: LegacyDomMirrorTopic,
    handler?: DomMirrorHandler | number,
    delay?: number,
  ): DomMirrorDetach;
}
