/**
 * Lint deck folders: catch broken references and orphaned files.
 *
 * Pure static check — reads deck.json + the folder, mutates nothing, makes no
 * network requests. Run after any hand-edit of deck.json, after removing a
 * city, or in CI (`npm test` includes it as a vitest case).
 *
 * CLI:  tsx scripts/dev/lint-decks.ts     # exit 1 on errors, 0 on pass/warnings
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface LintProblem {
  level: 'error' | 'warn'
  message: string
}

const ROOT = join(import.meta.dirname, '..', '..')
const DECKS_DIR = join(ROOT, 'decks')

/** Lint every deck folder; returns problems sorted deck-by-deck. */
export function lintDeckFolders(): LintProblem[] {
  const problems: LintProblem[] = []
  const report = (level: LintProblem['level'], message: string) => problems.push({ level, message })

  const deckDirs = readdirSync(DECKS_DIR).filter((f) => !f.startsWith('.') && f !== '.gitkeep')
  if (deckDirs.length === 0) {
    report('error', 'no decks found in decks/')
    return problems
  }

  for (const deckId of deckDirs) {
    const deckDir = join(DECKS_DIR, deckId)
    const deckJsonPath = join(deckDir, 'deck.json')
    if (!existsSync(deckJsonPath)) {
      report('error', `${deckId}: missing deck.json`)
      continue
    }

    let deck: { id?: string; cards?: { id?: string; images?: { path?: string; label?: unknown }[] }[] }
    try {
      deck = JSON.parse(readFileSync(deckJsonPath, 'utf8'))
    } catch (e) {
      report('error', `${deckId}/deck.json: invalid JSON (${(e as Error).message})`)
      continue
    }

    if (deck.id !== deckId) {
      report('error', `${deckId}: deck.id is "${deck.id}" but the folder is "${deckId}"`)
    }

    // unique card ids + valid id format
    const seenIds = new Set<string>()
    for (const card of deck.cards ?? []) {
      const id = card.id ?? ''
      if (seenIds.has(id)) report('error', `${deckId}: duplicate card id "${id}"`)
      seenIds.add(id)
      if (!/^[a-z0-9-]+$/.test(id)) report('error', `${deckId}/${id}: card id must match ^[a-z0-9-]+$`)
    }

    // referenced image paths
    const referenced = new Set<string>()
    for (const card of deck.cards ?? []) {
      const cardId = card.id ?? '?'
      const images = card.images ?? []
      if (images.length === 0) {
        report('warn', `${deckId}/${cardId}: no images — unplayable until photos are added`)
      }
      for (const img of images) {
        const path = img?.path
        if (typeof path !== 'string' || path.length === 0) {
          report('error', `${deckId}/${cardId}: image entry is missing "path"`)
          continue
        }
        const expectedPrefix = `decks/${deckId}/`
        if (!path.startsWith(expectedPrefix)) {
          report('error', `${deckId}/${cardId}: "${path}" must start with "${expectedPrefix}"`)
          continue
        }
        const fileName = path.slice(expectedPrefix.length)
        const validName =
          fileName === `${cardId}.webp` || new RegExp(`^${cardId}-\\d+\\.webp$`).test(fileName)
        if (!validName) {
          report('error', `${deckId}/${cardId}: "${path}" filename should be ${cardId}.webp or ${cardId}-<N>.webp`)
          continue
        }
        if (referenced.has(path)) {
          report('error', `${deckId}: "${path}" is referenced more than once`)
          continue
        }
        referenced.add(path)
        if (!existsSync(join(deckDir, fileName))) {
          report('error', `${deckId}/${cardId}: MISSING FILE "${path}" — broken image link`)
        }
        const label = img.label
        if (label !== undefined && (typeof label !== 'object' || !(label as { zh?: string }).zh || !(label as { en?: string }).en)) {
          report('warn', `${deckId}/${cardId}: label for "${fileName}" should be { zh, en }`)
        }
      }
    }

    // orphan files in the deck folder
    for (const f of readdirSync(deckDir)) {
      if (f === 'deck.json' || f.startsWith('.')) continue
      if (referenced.has(`decks/${deckId}/${f}`)) continue
      if (f.endsWith('.webp')) {
        report('error', `${deckId}/${f}: ORPHAN — not referenced by any card (delete it or add a reference)`)
      } else {
        report('warn', `${deckId}/${f}: stray file not referenced by any card (leftover source photo?)`)
      }
    }
  }

  return problems
}

// CLI entry
const problems = lintDeckFolders()
let errors = 0
let warnings = 0
for (const p of problems) {
  console[p.level === 'error' ? 'error' : 'warn'](`${p.level === 'error' ? '✗' : '⚠'} ${p.message}`)
  if (p.level === 'error') errors++
  else warnings++
}
if (errors > 0) {
  console.error(`\n❌ ${errors} error(s), ${warnings} warning(s)`)
  process.exit(1)
}
console.log(`\n✅ decks OK${warnings ? ` (${warnings} warning(s))` : ''}`)
