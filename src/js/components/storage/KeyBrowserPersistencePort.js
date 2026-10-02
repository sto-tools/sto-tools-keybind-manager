/**
 * Key-browser presentation persistence only; no profile or bindset data writes.
 * Only the exact legacy category mode `key-type` selects that category namespace.
 * @typedef {import('../../types/events/base.js').KeyViewMode} KeyViewMode
 * @typedef {{mode: KeyViewMode, collapsedCategories: {command: string[], keyType: string[]}, collapsedBindsets: string[]}} KeyBrowserPersistenceSnapshot
 * @typedef {{load: () => KeyBrowserPersistenceSnapshot, replaceMode: (mode: KeyViewMode) => void, replaceCategory: (categoryId: string, mode: string, collapsed: boolean) => void, replaceBindset: (bindsetName: string, collapsed: boolean) => void, isCategoryCollapsed: (categoryId: string, mode: string) => boolean, isBindsetCollapsed: (bindsetName: string) => boolean}} KeyBrowserPersistencePort
 */
export {};
