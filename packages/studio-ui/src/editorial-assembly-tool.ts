import { canonicalReviewedAssetId } from './editorial-review-store';

/** Reviewed-source identity for montage picks: a model sometimes mangles a long asset id, so a pick
 *  naming a unique near-miss of one reviewed source (a long shared prefix) is that source. */
const REVIEWED_ID_PREFIX_MIN = 'local_'.length + 8;

export function healReviewedSourceId(raw: string, sourceIds: ReadonlySet<string>): string | null {
  const canonical = canonicalReviewedAssetId(raw);
  if (!canonical) return null;
  if (sourceIds.has(canonical)) return canonical;
  if (canonical.length < REVIEWED_ID_PREFIX_MIN) return null;
  let best: string | null = null;
  let bestLength = 0;
  let ambiguous = false;
  for (const id of sourceIds) {
    let length = 0;
    while (length < canonical.length && length < id.length && canonical[length] === id[length]) length += 1;
    if (length > bestLength) {
      best = id;
      bestLength = length;
      ambiguous = false;
    } else if (length === bestLength && best && id !== best) {
      ambiguous = true;
    }
  }
  return !ambiguous && bestLength >= REVIEWED_ID_PREFIX_MIN ? best : null;
}
