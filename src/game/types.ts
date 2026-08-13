/** A single city card. */
export interface Card {
  /** Unique id within the deck, e.g. "beijing". */
  id: string
  /** 1..N photos of this city; `path` is repo-root-relative (resolved via resolveImageUrl). */
  images: CardImage[]
  lat: number
  lng: number
  /** Acceptable answers. Chinese names + pinyin aliases live in the respective pools. */
  answers: {
    /** e.g. ["哈尔滨", "哈尔滨市"] */
    zh: string[]
    /** e.g. ["harbin", "haerbin"] */
    en: string[]
  }
  /** Canonical display names, shown on reveal. */
  display: {
    zh: string
    en: string
  }
  /** Optional text hint shown on the question card. */
  hint?: { zh?: string; en?: string }
}

/** One photo of a city. `label` names the specific place shown (reveal only, never on the question). */
export interface CardImage {
  path: string // e.g. "decks/cn-cities/beijing-2.webp"
  label?: { zh: string; en: string }
}

/** A deck of city cards. */
export interface Deck {
  id: string // e.g. "cn-cities"
  name: { zh: string; en: string }
  cards: Card[]
}

/** One player's guess within a round. */
export interface GuessEntry {
  answer: string
  correct: boolean
  at: number
  username: string
}

/** State of a single round in a channel (stored in the channel's GameRoom DO). */
export interface RoundState {
  cardId: string
  deckId: string
  /** The exact photo shown this round (for the reveal + same-photo dedup). */
  imagePath: string
  channelId: string
  /** The /play interaction token — used by the alarm to POST the reveal message. Valid ~15 min. */
  interactionToken: string
  startedAt: number
  endsAt: number // startedAt + ROUND_MS
  /** userId -> guess entry. Keeps the first correct guess timestamp per user. */
  guesses: Record<string, GuessEntry>
  revealed: boolean
  /** userId of the first player to answer correctly in this round. */
  firstCorrectUserId?: string
}

/** Persistent per-channel score of one player. */
export interface PlayerScore {
  userId: string
  username: string
  score: number
  /** Number of rounds in which this player answered first. */
  firsts: number
}

export const ROUND_MS = 60_000
