import type { Card, Deck } from './types'
import cnCities from '../../decks/cn-cities/deck.json'

// Only the China deck ships in v1 (the US deck returns when curated photos exist).
const decks: Deck[] = [cnCities as unknown as Deck]

export function getDeck(id: string): Deck | undefined {
  return decks.find((d) => d.id === id)
}

export function getCard(deckId: string, cardId: string): Card | undefined {
  return getDeck(deckId)?.cards.find((c) => c.id === cardId)
}

/** Choices for the /play deck option. */
export function listDeckChoices(): { name: string; value: string }[] {
  return decks.map((d) => ({
    name: `${d.name.en} / ${d.name.zh}`,
    value: d.id,
  }))
}
