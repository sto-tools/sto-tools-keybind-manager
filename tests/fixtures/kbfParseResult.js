/**
 * Complete a parser double with the exact aggregate fields checked by the KBF
 * result boundary. Individual tests remain responsible for their nested data.
 *
 * @param {any} result
 */
export const completeKBFParseResult = (result) => ({
  ...result,
  stats: {
    ...result.stats,
    totalBindsets: Object.keys(result.bindsets).length,
    totalKeys: Object.values(result.bindsets).reduce(
      (count, bindset) => count + Object.keys(bindset.keys || {}).length,
      0,
    ),
    totalAliases: Object.keys(result.aliases || {}).length,
    processedLayers: result.stats?.processedLayers || [],
    skippedActivities: result.stats?.skippedActivities || 0,
  },
});
