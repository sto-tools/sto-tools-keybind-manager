/**
 * Observe publications without revoking already acknowledged durability. Call
 * this only outside an exclusive owner/workflow tail.
 * @param {PromiseLike<unknown>[]} publications
 */
export async function settleOwnerPublications(publications) {
  const outcomes = await Promise.allSettled(publications);
  for (const outcome of outcomes) {
    if (outcome.status === "rejected")
      console.error("owner_publication_failed", outcome.reason);
  }
}
