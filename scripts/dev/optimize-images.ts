/**
 * Optimize photos for a deck — the one script that keeps deck folders tidy.
 *
 * For every card in `decks/<deck>/deck.json` it looks for photos dropped into
 * the deck folder as `<cardId>.<ext>` (first) and `<cardId>-<N>.<ext>` (extras),
 * e.g. `beijing.jpg` + `beijing-2.jpg` + `beijing-3.jpg` (jpg/jpeg/png/heic/
 * heif/tif/tiff), then for each:
 *   1. optimizes it (EXIF orientation applied, resized to max 1200px,
 *      metadata incl. GPS stripped, encoded as WebP quality 80)
 *   2. renames it to `<cardId>.webp` / `<cardId>-<N>.webp`
 *   3. deletes the source (or moves it to `decks/<deck>/.archive/` with --keep)
 *   4. writes the `images` array into deck.json (MERGE — preserves existing
 *      entries whose webp files still exist and hand-written `label` fields)
 *
 * Only ONE copy of each image remains in the deck folder.
 *
 * Usage (from repo root, via tsx):
 *   tsx scripts/dev/optimize-images.ts              # convert everything, delete sources
 *   tsx scripts/dev/optimize-images.ts --keep       # archive sources instead of deleting
 *   tsx scripts/dev/optimize-images.ts --check      # verify every card has ≥1 image
 *   tsx scripts/dev/optimize-images.ts --max 1600 --quality 82
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import type { Card, Deck } from '../../src/game/types'
import { getDecks } from './_decks'

const ROOT = join(import.meta.dirname, '..', '..')
const DECKS_DIR = join(ROOT, 'decks')

// camera/export source formats (webp is the OUTPUT format, never an input)
const SOURCE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'tif', 'tiff']
const WEBP_EXT = 'webp'

const args = process.argv.slice(2)
const CHECK_ONLY = args.includes('--check')
const KEEP = args.includes('--keep')
const MAX_DIM = Number(args[args.indexOf('--max') + 1]) || 1200
const QUALITY = Number(args[args.indexOf('--quality') + 1]) || 80

const decks = getDecks()
if (decks.length === 0) {
  console.error('No decks found in decks/')
  process.exit(1)
}

/** Output filename for image #n of a card (1-based; #1 has no suffix). */
function outputName(cardId: string, n: number): string {
  return n === 1 ? `${cardId}.${WEBP_EXT}` : `${cardId}-${n}.${WEBP_EXT}`
}

/** Repo-root-relative path for image #n of a card. */
function imagePath(deckId: string, cardId: string, n: number): string {
  return `decks/${deckId}/${outputName(cardId, n)}`
}

interface Source { n: number; path: string }

/** All source photos for a card, sorted: beijing.jpg, beijing-2.jpg, beijing-3.jpg…
 * Scans the folder so gaps in numbering are fine (e.g. only `urumqi-3.jpg`). */
function findSources(deckId: string, cardId: string): Source[] {
  const dir = join(DECKS_DIR, deckId)
  const re = new RegExp(`^${cardId}(?:-(\\d+))?\\.(${SOURCE_EXTENSIONS.join('|')})$`)
  return readdirSync(dir)
    .map((f): Source | null => {
      const m = f.match(re)
      return m ? { n: Number(m[1] ?? 1), path: join(dir, f) } : null
    })
    .filter((x): x is Source => x !== null)
    .sort((a, b) => a.n - b.n)
}

function humanSize(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

async function optimize(deckId: string, cardId: string, n: number, input: string): Promise<void> {
  const out = join(DECKS_DIR, deckId, outputName(cardId, n))
  const before = statSync(input).size
  await sharp(input)
    .rotate() // apply EXIF orientation
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(out)
  const after = statSync(out).size
  const ratio = ((1 - after / before) * 100).toFixed(0)
  console.log(`  ${outputName(cardId, n)}: ${humanSize(before)} → ${humanSize(after)} (${ratio}% smaller)`)

  // dispose of the source: delete, or archive when --keep
  if (KEEP) {
    const archiveDir = join(DECKS_DIR, deckId, '.archive')
    mkdirSync(archiveDir, { recursive: true })
    const ext = input.slice(input.lastIndexOf('.'))
    renameSync(input, join(archiveDir, outputName(cardId, n).replace(/\.webp$/, ext)))
  } else {
    rmSync(input)
  }
}

/** Write the `images` array for one card — MERGE, never replace. */
function syncImages(deck: Deck, deckId: string, card: Card, sources: Source[]): void {
  const existing = new Map((card.images ?? []).map((i) => [i.path, i.label]))
  const merged = new Map<string, { path: string; label?: { zh: string; en: string } }>()

  // keep existing entries whose files still exist
  for (const [path, label] of existing) {
    const fileName = path.split('/').pop()
    if (fileName && existsSync(join(DECKS_DIR, deckId, fileName))) {
      merged.set(path, { path, ...(label ? { label } : {}) })
    }
  }
  // upsert entries for newly optimized sources
  for (const { n } of sources) {
    const path = imagePath(deckId, card.id, n)
    const label = existing.get(path)
    merged.set(path, { path, ...(label ? { label } : {}) })
  }

  card.images = [...merged.values()].sort((a, b) => imageNumber(a.path) - imageNumber(b.path))
  writeDeck(deck)
}

/** Image number from a path: "…/beijing-2.webp" → 2, "…/beijing.webp" → 1. */
function imageNumber(path: string): number {
  const m = path.match(/-\d+\.webp$/)
  return m ? Number(m[1]) : 1
}

function writeDeck(deck: Deck): void {
  writeFileSync(join(DECKS_DIR, deck.id, 'deck.json'), JSON.stringify(deck, null, 2) + '\n')
}

function check(): void {
  let problems = 0
  for (const { deck } of decks) {
    const deckId = deck.id
    for (const card of deck.cards) {
      const images = card.images ?? []
      if (images.length === 0) {
        console.error(`✗ ${deckId}/${card.id}: no images — drop photos and re-run optimize-images`)
        problems++
        continue
      }
      for (const img of images) {
        const fileName = img.path.split('/').pop()
        if (!fileName || !existsSync(join(DECKS_DIR, deckId, fileName))) {
          console.error(`✗ ${deckId}/${card.id}: missing file for "${img.path}"`)
          problems++
        }
      }
    }
    // stray files in the deck folder that don't belong to any card
    for (const f of readdirSync(join(DECKS_DIR, deckId))) {
      if (f === 'deck.json' || f === '.archive' || f.startsWith('.')) continue
      const base = f.replace(/-\d+\.\w+$/, '').replace(/\.[^.]+$/, '')
      if (!deck.cards.some((c) => c.id === base)) {
        console.warn(`⚠ ${deckId}/${f}: no card with id "${base}" — ignored`)
      }
    }
  }
  const total = decks.reduce((n, d) => n + d.deck.cards.length, 0)
  if (problems === 0) {
    console.log(`✅ all ${total} cards across ${decks.length} deck(s) have ≥1 optimized image`)
  }
  process.exit(problems === 0 ? 0 : 1)
}

async function main(): Promise<void> {
  let totalImages = 0
  for (const { deck } of decks) {
    const deckId = deck.id
    const deckDir = join(DECKS_DIR, deckId)
    mkdirSync(deckDir, { recursive: true })
    const missing: string[] = []
    for (const card of deck.cards) {
      const sources = findSources(deckId, card.id)
      if (sources.length === 0) {
        // no new source photo: fine if the card is already optimized
        if (existsSync(join(deckDir, `${card.id}.${WEBP_EXT}`))) continue
        missing.push(card.id)
        continue
      }
      for (const s of sources) {
        await optimize(deckId, card.id, s.n, s.path)
        totalImages++
      }
      syncImages(deck, deckId, card, sources)
    }
    if (missing.length > 0) {
      console.error(`\n❌ ${deckId}: missing photos for ${missing.length} card(s): ${missing.join(', ')}`)
      console.error(`   Drop photos into decks/${deckId}/ named <cardId>.jpg (or <cardId>-2.jpg for extra views) and re-run.`)
      process.exit(1)
    }
  }
  console.log(`\n✅ ${totalImages} image(s) optimized (max ${MAX_DIM}px, webp quality ${QUALITY})`)
  if (KEEP) console.log('   sources archived to decks/<deck>/.archive/ (gitignored)')
  else console.log('   sources deleted (single copy kept)')
}

if (CHECK_ONLY) check()
else void main()
