import { DurableObject } from 'cloudflare:workers'
import { webhook } from 'discord-hono'
import type { Bindings } from '../env'
import type { Card, CardImage, Deck, GuessEntry, PlayerScore, RoundState } from '../game/types'
import { ROUND_MS } from '../game/types'
import { getCard, getDeck } from '../game/decks'
import { judgeAnswer } from '../game/judge'
import { buildRevealEmbeds } from '../game/embeds'

const KEY_ROUND = 'round'
const KEY_SCORES = 'scores'
const KEY_LAST_CARD = 'lastCardId'
const KEY_LAST_IMAGE = 'lastImage'

export type StartRoundResult =
  | { ok: true; cardId: string; deckId: string; imagePath: string; endsAt: number }
  | { ok: false; reason: 'round-in-progress' | 'unknown-deck' | 'no-images' }

export type CanGuessResult =
  | { ok: true }
  | { ok: false; reason: 'no-round' | 'revealed' | 'already-correct' }

export type SubmitGuessResult =
  | { ok: false; reason: 'no-round' | 'revealed' | 'already-correct' }
  | { ok: true; correct: boolean; firstCorrect: boolean }

export type StopRoundResult = { ok: boolean; reason?: 'no-round' }

/**
 * One game room per channel (`idFromName(channelId)`):
 * round state, per-channel scores, and the timed reveal (alarm).
 *
 * The reveal is sent through the /play interaction's webhook token
 * (`POST /webhooks/{application.id}/{interaction.token}`) — the only way to
 * message a channel without a guild member context (user-installed app).
 */
export class GameRoom extends DurableObject<Bindings> {
  private round: RoundState | null = null
  private scores: Record<string, PlayerScore> = {}

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => {
      this.round = (await ctx.storage.get<RoundState>(KEY_ROUND)) ?? null
      this.scores = (await ctx.storage.get<Record<string, PlayerScore>>(KEY_SCORES)) ?? {}
    })
  }

  /** Start a new round. Rejects if one is already in progress. */
  async startRound(input: {
    deckId: string
    channelId: string
    interactionToken: string
  }): Promise<StartRoundResult> {
    if (this.round && !this.round.revealed) {
      return { ok: false, reason: 'round-in-progress' }
    }
    const deck = getDeck(input.deckId)
    if (!deck) return { ok: false, reason: 'unknown-deck' }

    const lastCardId = await this.ctx.storage.get<string>(KEY_LAST_CARD)
    const lastImage = await this.ctx.storage.get<string>(KEY_LAST_IMAGE)
    const card = pickCard(deck, lastCardId)
    if (!card) return { ok: false, reason: 'no-images' }
    const image = pickImage(card, lastImage)
    const now = Date.now()
    const round: RoundState = {
      cardId: card.id,
      deckId: deck.id,
      imagePath: image.path,
      channelId: input.channelId,
      interactionToken: input.interactionToken,
      startedAt: now,
      endsAt: now + ROUND_MS,
      guesses: {},
      revealed: false,
    }

    await this.ctx.storage.put(KEY_ROUND, round)
    await this.ctx.storage.put(KEY_LAST_CARD, card.id)
    await this.ctx.storage.put(KEY_LAST_IMAGE, image.path)
    this.round = round
    await this.ctx.storage.setAlarm(round.endsAt)

    return { ok: true, cardId: card.id, deckId: deck.id, imagePath: image.path, endsAt: round.endsAt }
  }

  /** May the user open the guess modal? */
  async canOpenGuess(userId: string): Promise<CanGuessResult> {
    const round = this.round
    if (!round || round.revealed) {
      return { ok: false, reason: round ? 'revealed' : 'no-round' }
    }
    if (round.guesses[userId]?.correct) {
      return { ok: false, reason: 'already-correct' }
    }
    return { ok: true }
  }

  /** Judge a guess and record it. Wrong answers may be retried. */
  async submitGuess(input: {
    userId: string
    username: string
    answer: string
  }): Promise<SubmitGuessResult> {
    const round = this.round
    if (!round || round.revealed) {
      return { ok: false, reason: round ? 'revealed' : 'no-round' }
    }
    const existing = round.guesses[input.userId]
    if (existing?.correct) {
      return { ok: false, reason: 'already-correct' }
    }

    const card = getCard(round.deckId, round.cardId)
    if (!card) {
      // Corrupt state — nothing sane to judge against.
      return { ok: false, reason: 'no-round' }
    }
    const correct = judgeAnswer(input.answer, card)
    const at = Date.now()
    round.guesses[input.userId] = {
      answer: input.answer,
      correct,
      at,
      username: input.username,
    } satisfies GuessEntry
    let firstCorrect = false
    if (correct && !round.firstCorrectUserId) {
      round.firstCorrectUserId = input.userId
      firstCorrect = true
    }

    await this.ctx.storage.put(KEY_ROUND, round)
    this.round = round
    return { ok: true, correct, firstCorrect }
  }

  /** End the current round immediately and reveal. */
  async stopRound(): Promise<StopRoundResult> {
    if (!this.round || this.round.revealed) {
      return { ok: false, reason: 'no-round' }
    }
    await this.reveal()
    return { ok: true }
  }

  /** Top-10 leaderboard for this channel. */
  async getRanking(): Promise<PlayerScore[]> {
    return Object.values(this.scores).sort((a, b) => b.score - a.score).slice(0, 10)
  }

  /** Read-only view of the current round (debug/tests). */
  async getRound(): Promise<{ cardId: string; deckId: string; revealed: boolean } | null> {
    if (!this.round) return null
    return { cardId: this.round.cardId, deckId: this.round.deckId, revealed: this.round.revealed }
  }

  /** Alarm handler — timed reveal. */
  override async alarm(): Promise<void> {
    await this.reveal()
  }

  /** Reveal the answer, update scores, send the reveal message, clear the round. */
  private async reveal(): Promise<void> {
    const round = this.round
    if (!round || round.revealed) return

    // Mark revealed and persist BEFORE sending anything, so a concurrent
    // /stop (or a duplicate alarm) cannot double-reveal.
    round.revealed = true
    await this.ctx.storage.put(KEY_ROUND, round)
    await this.ctx.storage.deleteAlarm()
    this.round = round

    const correctGuesses = Object.entries(round.guesses)
      .filter(([, g]) => g.correct)
      .sort(([, a], [, b]) => a.at - b.at)
      .map(([userId, g]) => ({ userId, ...g }))

    // Scores: +1 per correct answer, +1 extra for the first correct answer.
    for (const g of correctGuesses) {
      const prev = this.scores[g.userId]
      const score: PlayerScore = prev ?? {
        userId: g.userId,
        username: g.username,
        score: 0,
        firsts: 0,
      }
      score.username = g.username
      score.score += 1
      if (g.userId === round.firstCorrectUserId) {
        score.score += 1
        score.firsts += 1
      }
      this.scores[g.userId] = score
    }
    await this.ctx.storage.put(KEY_SCORES, this.scores)

    const card = getCard(round.deckId, round.cardId)
    const deck = getDeck(round.deckId)
    if (card && deck) {
      const embeds = buildRevealEmbeds(card, deck, round.imagePath, correctGuesses, Object.values(this.scores))
      const url = `https://discord.com/api/webhooks/${this.env.DISCORD_APPLICATION_ID}/${round.interactionToken}`
      try {
        const res = await webhook(url, { embeds: embeds.map((e) => e.toJSON()) })
        if (!res.ok) {
          // e.g. token expired/revoked — log and move on, do not retry.
          const body = await res.text().catch(() => '')
          console.error(`[nali] reveal followup failed: ${res.status} ${res.statusText} ${body}`)
        }
      } catch (e) {
        console.error('[nali] reveal followup error', e)
      }
    }

    await this.ctx.storage.delete(KEY_ROUND)
    this.round = null
  }
}

/** A card that has at least one photo; prefer a different card than last round. */
function pickCard(deck: Deck, lastCardId?: string): Card | undefined {
  const withImages = deck.cards.filter((c) => c.images.length > 0)
  const candidates = lastCardId ? withImages.filter((c) => c.id !== lastCardId) : withImages
  const safe = candidates.length > 0 ? candidates : withImages
  return safe[Math.floor(Math.random() * safe.length)]
}

/** A photo different from last round's, when possible. */
function pickImage(card: Card, lastImage?: string): CardImage {
  const candidates = lastImage ? card.images.filter((i) => i.path !== lastImage) : card.images
  const safe = candidates.length > 0 ? candidates : card.images
  return safe[Math.floor(Math.random() * safe.length)]!
}
