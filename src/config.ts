/**
 * Where deck images are served from.
 *
 * v1 serves the committed WebP files under decks/ via jsDelivr's GitHub
 * CDN (requires a PUBLIC repo). Fill in the owner/repo once the repo exists:
 *   https://cdn.jsdelivr.net/gh/rxliuli/nali-bot@main
 *
 * Moving to R2 later = change this one constant.
 */
const CDN_BASE = 'https://cdn.jsdelivr.net/gh/rxliuli/nali-bot@main'

/** Resolve a repo-root-relative image path (e.g. "decks/cn-cities/beijing.webp") to a full URL. */
export function resolveImageUrl(path: string): string {
  return CDN_BASE + '/' + path
}
