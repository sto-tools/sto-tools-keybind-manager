/**
 * Command presentation persistence only; owner identity and broadcasts stay
 * with CommandPresentationService.
 * @typedef {import('../../types/events/base.js').CommandGroupType} CommandGroupType
 * @typedef {{collapsedCategories: string[], collapsedGroups: CommandGroupType[]}} CommandPresentationPersistenceSnapshot
 * @typedef {{load: () => CommandPresentationPersistenceSnapshot, replaceCategory: (categoryId: string, collapsed: boolean) => void, replaceGroup: (group: CommandGroupType, collapsed: boolean) => void}} CommandPresentationPersistencePort
 */
export {};
