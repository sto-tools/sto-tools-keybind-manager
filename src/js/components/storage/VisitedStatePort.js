/**
 * Exact first-run sentinel persistence and compare-current compensation only.
 * Truthiness and welcome lifecycle behavior belong to the startup owner.
 * @typedef {{loadExact: () => string | null, markVisited: () => void, compensate: (expected: string, prior: string | null) => boolean}} VisitedStatePort
 */
export {};
