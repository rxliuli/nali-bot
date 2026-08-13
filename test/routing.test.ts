import { testVerifyTrue } from 'discord-hono'
import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../src/index'
import type { Env } from '../src/env'
import type { GameRoom } from '../src/do/GameRoom'
import cnCities from '../decks/cn-cities/deck.json'

const app = buildApp({ verify: testVerifyTrue })

const SIGNED = {
  'content-type': 'application/json',
  'x-signature-ed25519': 'f'.repeat(128),
  'x-signature-timestamp': '1',
}

/** POST a raw interaction payload through the app (verify bypassed). */
async function send(body: unknown) {
  return app.fetch(
    new Request('https://example.com/interaction', {
      method: 'POST',
      headers: SIGNED,
      body: JSON.stringify(body),
    }),
    env as unknown as Env['Bindings'],
  )
}

const CHANNEL = 'routing-ch-1'

function command(name: string, options?: { name: string; type: number; value: unknown }[]) {
  return {
    type: 2,
    id: '1000000000000000000',
    application_id: 'test-app-id',
    channel_id: CHANNEL,
    guild_id: 'guild-1',
    token: 'tok-1',
    member: { user: { id: 'u-1', username: 'Alice', global_name: 'Alice' } },
    data: { id: 'cmd', name, type: 1, options },
  }
}

const button = (userId: string, username: string, token = 'tok-2') => ({
  type: 3,
  id: '1000000000000000000',
  application_id: 'test-app-id',
  channel_id: CHANNEL,
  guild_id: 'guild-1',
  token,
  member: { user: { id: userId, username, global_name: username } },
  data: { custom_id: 'guess', component_type: 2 },
})

const modalSubmit = (userId: string, username: string, answer: string, token = 'tok-3') => ({
  type: 5,
  id: '1000000000000000000',
  application_id: 'test-app-id',
  channel_id: CHANNEL,
  guild_id: 'guild-1',
  token,
  member: { user: { id: userId, username, global_name: username } },
  data: {
    custom_id: 'guess_answer',
    components: [{ type: 1, components: [{ type: 4, custom_id: 'answer', value: answer }] }],
  },
})

async function cardFor(s: DurableObjectStub<GameRoom>) {
  const round = await s.getRound()
  expect(round).not.toBeNull()
  const card = (cnCities as unknown as { cards: { id: string; display: { zh: string } }[] }).cards.find(
    (c) => c.id === round!.cardId,
  )!
  return card
}

describe('interaction routing (M1/M2 flow)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('answers PING with type 1 (endpoint verification)', async () => {
    const res = await send({ type: 1 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ type: 1 })
  })

  it('/ping returns pong (registered command must have a handler)', async () => {
    const res = await send(command('ping'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { type: number; data: { content: string } }
    expect(body.type).toBe(4)
    expect(body.data.content).toBe('pong')
  })

  it('/play returns a question embed + guess button', async () => {
    const res = await send(command('play', [{ name: 'deck', type: 3, value: 'cn-cities' }]))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      type: number
      data: { embeds: { title?: string; description?: string; image?: { url: string } }[]; components: unknown[] }
    }
    expect(body.type).toBe(4) // CHANNEL_MESSAGE_WITH_SOURCE
    expect(body.data.embeds[0]!.title).toContain('Guess the city!')
    expect(body.data.embeds[0]!.description).toContain('💡 Hint:') // English label + bilingual content
    expect(body.data.embeds[0]!.image!.url).toContain('cdn.jsdelivr.net')
    expect(body.data.components.length).toBeGreaterThan(0)
  })

  it('rejects a second /play while a round is running (ephemeral)', async () => {
    await send(command('play', []))
    const res = await send(command('play', []))
    const body = (await res.json()) as { data: { flags: number; content: string } }
    expect(body.data.flags).toBe(64) // EPHEMERAL
    expect(body.data.content).toContain('already in progress')
  })

  it('button opens the guess modal', async () => {
    await send(command('play', []))
    const res = await send(button('u-2', 'Bob'))
    const body = (await res.json()) as { type: number; data: { custom_id: string } }
    expect(body.type).toBe(9) // MODAL
    expect(body.data.custom_id).toBe('guess_answer')
  })

  it('modal submit gives ephemeral correct/wrong feedback', async () => {
    await send(command('play', []))
    const s = env.GameRoom.getByName(CHANNEL)
    const card = await cardFor(s)

    // wrong answer → ephemeral "not quite"
    const wrong = await send(modalSubmit('u-1', 'Alice', '东京'))
    expect(((await wrong.json()) as { data: { flags: number; content: string } }).data).toMatchObject({
      flags: 64,
      content: expect.stringContaining('Not quite'),
    })

    // correct answer → ephemeral "correct"
    const right = await send(modalSubmit('u-1', 'Alice', card.display.zh))
    const rightBody = (await right.json()) as { data: { flags: number; content: string } }
    expect(rightBody.data.flags).toBe(64)
    expect(rightBody.data.content).toContain('Correct')

    // already-correct user is blocked on the next button click
    const blocked = await send(button('u-1', 'Alice'))
    expect(((await blocked.json()) as { data: { flags: number; content: string } }).data.content).toContain(
      'You already answered',
    )
  })

  it('/stop reveals via webhook and clears the round', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await send(command('play', []))
    const res = await send(command('stop'))
    const body = (await res.json()) as { data: { flags: number; content: string } }
    expect(body.data.flags).toBe(64)
    expect(body.data.content).toContain('Round ended early')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = (fetchMock.mock.calls[0] as unknown[])[0] as string
    expect(url).toBe('https://discord.com/api/webhooks/test-app-id/tok-1')
  })

  it('/rank shows a public leaderboard embed', async () => {
    await send(command('play', []))
    await send(command('stop'))
    const res = await send(command('rank'))
    const body = (await res.json()) as { type: number; data: { embeds: { title: string }[] } }
    expect(body.type).toBe(4)
    expect(body.data.embeds[0]!.title).toContain('Leaderboard')
  })
})
