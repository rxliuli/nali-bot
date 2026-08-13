// Shared helper for dev scripts: load all decks from decks/*/deck.json.
// Run scripts from the repo root via tsx.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Deck } from '../../src/game/types'

export interface DeckWithDir {
  dir: string
  deck: Deck
}

const ROOT = join(import.meta.dirname, '..', '..')

export function getDecks(): DeckWithDir[] {
  const dir = join(ROOT, 'decks')
  return readdirSync(dir)
    .filter((f) => !f.startsWith('.') && f !== '.gitkeep')
    .sort()
    .map((f) => ({
      dir: join(dir, f),
      deck: JSON.parse(readFileSync(join(dir, f, 'deck.json'), 'utf8')) as Deck,
    }))
}
