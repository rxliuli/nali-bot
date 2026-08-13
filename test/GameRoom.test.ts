import { env, runDurableObjectAlarm } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bindings } from '../src/env'
import type { GameRoom } from '../src/do/GameRoom'
import cnCities from '../decks/cn-cities/deck.json'

const APP_ID = 'test-app-id'
const stub = (name = `ch-${Math.random().toString(36).slice(2)}`): DurableObjectStub<GameRoom> =>
  env.GameRoom.getByName(name)

/** Stub global fetch so the reveal webhook never leaves the test runtime. */
function stubFetch() {
  const calls: { url: string; body: unknown }[] = []
  const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) })
    return new Response(JSON.stringify({ id: 'msg-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

async function startRound(s: DurableObjectStub<GameRoom>, token = 'tok-1') {
  const r = await s.startRound({ deckId: 'cn-cities', channelId: 'ch-1', interactionToken: token })
  if (!r.ok) throw new Error('startRound failed: ' + r.reason)
  const card = (cnCities as unknown as { cards: { id: string; display: { zh: string; en: string } }[] }).cards.find(
    (c) => c.id === r.cardId,
  )!
  return { result: r, card }
}

describe('GameRoom: round lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('starts a round and rejects a concurrent one in the same channel', async () => {
    const s = stub()
    const first = await s.startRound({ deckId: 'cn-cities', channelId: 'ch-1', interactionToken: 'tok-1' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.deckId).toBe('cn-cities')
    expect(first.endsAt).toBeGreaterThan(Date.now())

    const second = await s.startRound({ deckId: 'cn-cities', channelId: 'ch-1', interactionToken: 'tok-2' })
    expect(second).toEqual({ ok: false, reason: 'round-in-progress' })
  })

  it('rejects an unknown deck', async () => {
    const s = stub()
    expect(await s.startRound({ deckId: 'nope', channelId: 'ch-1', interactionToken: 't' })).toEqual({
      ok: false,
      reason: 'unknown-deck',
    })
  })

  it('keeps rounds isolated per channel', async () => {
    const s1 = stub('ch-a')
    const s2 = stub('ch-b')
    expect((await s1.startRound({ deckId: 'cn-cities', channelId: 'ch-a', interactionToken: 't' })).ok).toBe(true)
    // ch-b is free even though ch-a has a round
    expect((await s2.startRound({ deckId: 'cn-cities', channelId: 'ch-b', interactionToken: 't' })).ok).toBe(true)
  })

  it('canOpenGuess reflects round state', async () => {
    const s = stub()
    expect(await s.canOpenGuess('u-1')).toEqual({ ok: false, reason: 'no-round' })
    await startRound(s)
    expect(await s.canOpenGuess('u-1')).toEqual({ ok: true })
  })
})

describe('GameRoom: guessing', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('judges correct / wrong and flags the first correct answer', async () => {
    const s = stub()
    const { card } = await startRound(s)

    const wrong = await s.submitGuess({ userId: 'u-1', username: 'Alice', answer: '东京' })
    expect(wrong).toEqual({ ok: true, correct: false, firstCorrect: false })

    const right = await s.submitGuess({ userId: 'u-1', username: 'Alice', answer: card.display.zh })
    expect(right).toEqual({ ok: true, correct: true, firstCorrect: true })

    // second correct user does not get the first-correct bonus
    const right2 = await s.submitGuess({ userId: 'u-2', username: 'Bob', answer: card.display.en })
    expect(right2).toEqual({ ok: true, correct: true, firstCorrect: false })
  })

  it('blocks an already-correct user from guessing again', async () => {
    const s = stub()
    const { card } = await startRound(s)
    await s.submitGuess({ userId: 'u-1', username: 'Alice', answer: card.display.zh })
    expect(await s.canOpenGuess('u-1')).toEqual({ ok: false, reason: 'already-correct' })
    expect(await s.submitGuess({ userId: 'u-1', username: 'Alice', answer: card.display.en })).toEqual({
      ok: false,
      reason: 'already-correct',
    })
  })

  it('allows retries after a wrong answer', async () => {
    const s = stub()
    const { card } = await startRound(s)
    await s.submitGuess({ userId: 'u-1', username: 'Alice', answer: '巴黎' })
    const second = await s.submitGuess({ userId: 'u-1', username: 'Alice', answer: '巴黎' })
    expect(second).toEqual({ ok: true, correct: false, firstCorrect: false })
  })

  it('rejects guesses after the round is over', async () => {
    const s = stub()
    await startRound(s)
    await s.stopRound()
    expect(await s.submitGuess({ userId: 'u-1', username: 'Alice', answer: '北京' })).toEqual({
      ok: false,
      reason: 'no-round',
    })
  })
})

describe('GameRoom: reveal (stop + alarm)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stopRound reveals via the /play interaction webhook token', async () => {
    const calls = stubFetch()
    const s = stub()
    await startRound(s, 'tok-abc')

    expect(await s.stopRound()).toEqual({ ok: true })
    expect(calls.length).toBe(1)
    expect(calls[0]!.url).toBe(`https://discord.com/api/webhooks/${APP_ID}/tok-abc`)
    const embeds = calls[0]!.body as { embeds: { title?: string; description?: string }[] }
    expect(embeds.embeds[0]!.title).toContain('China / 中国城市') // English-first deck name
    expect(embeds.embeds[0]!.description).toContain('The answer is')
    expect(embeds.embeds[1]!.title).toContain('on the map')

    // round is cleared — stop again is a no-op
    expect(await s.stopRound()).toEqual({ ok: false, reason: 'no-round' })
  })

  it('alarm reveals automatically', async () => {
    const calls = stubFetch()
    const s = stub()
    await startRound(s, 'tok-alarm')

    const ran = await runDurableObjectAlarm(s)
    expect(ran).toBe(true)
    expect(calls.length).toBe(1)
    expect(calls[0]!.url).toContain('/tok-alarm')

    // alarm is cleared after reveal
    expect(await runDurableObjectAlarm(s)).toBe(false)
  })

  it('alarm does not reveal twice when it races a /stop', async () => {
    const calls = stubFetch()
    const s = stub()
    await startRound(s, 'tok-race')

    await s.stopRound() // reveals first
    expect(calls.length).toBe(1)
    expect(await runDurableObjectAlarm(s)).toBe(false) // alarm already cleared
    expect(calls.length).toBe(1)
  })

  it('reveal shows the asked photo with its location label', async () => {
    const calls = stubFetch()
    const s = stub()
    const { result } = await startRound(s, 'tok-label')
    await s.stopRound()

    const body = calls[0]!.body as { embeds: { description?: string; image?: { url: string } }[] }
    const answerEmbed = body.embeds[0]!
    // the reveal shows the same photo that was asked
    expect(answerEmbed.image!.url).toContain(result.imagePath)
    // and names the specific place — English first, then Chinese
    expect(answerEmbed.description).toContain('📍 You saw:')
    expect(answerEmbed.description).toMatch(/You saw: \*\*[^\n]+\/ [^\n]+\*\*/)
  })

  it('avoids repeating the same photo in consecutive rounds', async () => {
    const s = stub()
    const first = await startRound(s, 'tok-1')
    await s.stopRound()
    const second = await startRound(s, 'tok-2')
    expect(second.result.imagePath).not.toBe(first.result.imagePath)
  })

  it('logs and ignores a failed reveal (e.g. expired token)', async () => {
    const fetchMock = vi.fn(async () => new Response('Unknown Webhook', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const s = stub()
    await startRound(s, 'tok-expired')

    const ran = await runDurableObjectAlarm(s)
    expect(ran).toBe(true) // alarm consumed even though the webhook 404s
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // round still cleaned up
    expect(await s.stopRound()).toEqual({ ok: false, reason: 'no-round' })
  })
})

describe('GameRoom: scoring and ranking', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('awards +1 per correct answer and +1 for the first correct answer', async () => {
    stubFetch()
    const s = stub()

    // Round 1: Alice first (correct), Bob correct after.
    let { card } = await startRound(s)
    await s.submitGuess({ userId: 'u-1', username: 'Alice', answer: card.display.zh })
    await s.submitGuess({ userId: 'u-2', username: 'Bob', answer: card.display.en })
    await s.stopRound()

    let ranking = await s.getRanking()
    expect(ranking).toHaveLength(2)
    expect(ranking[0]).toMatchObject({ userId: 'u-1', username: 'Alice', score: 2, firsts: 1 })
    expect(ranking[1]).toMatchObject({ userId: 'u-2', username: 'Bob', score: 1, firsts: 0 })

    // Round 2: only Bob answers (first) — Bob now 2+2, Alice stays 2.
    ;({ card } = await startRound(s))
    await s.submitGuess({ userId: 'u-2', username: 'Bob', answer: card.display.zh })
    await s.stopRound()

    ranking = await s.getRanking()
    expect(ranking[0]).toMatchObject({ userId: 'u-2', username: 'Bob', score: 3, firsts: 1 })
    expect(ranking[1]).toMatchObject({ userId: 'u-1', username: 'Alice', score: 2, firsts: 1 })
  })

  it('wrong answers do not score', async () => {
    stubFetch()
    const s = stub()
    const { card } = await startRound(s)
    await s.submitGuess({ userId: 'u-1', username: 'Alice', answer: '东京' })
    expect(card.display.zh).toBeTruthy()
    await s.stopRound()
    expect(await s.getRanking()).toEqual([])
  })

  it('ranks by score descending, top 10', async () => {
    stubFetch()
    const s = stub()
    const users = Array.from({ length: 12 }, (_, i) => ({ userId: `u-${i}`, username: `User${i}` }))
    // everyone guesses the same card — first one gets the bonus
    const { card } = await startRound(s)
    for (const u of users) {
      await s.submitGuess({ ...u, answer: card.display.zh })
    }
    await s.stopRound()

    const ranking = await s.getRanking()
    expect(ranking).toHaveLength(10)
    expect(ranking[0]!.score).toBe(2)
    expect(ranking[1]!.score).toBe(1)
  })
})
