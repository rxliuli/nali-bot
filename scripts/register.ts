/**
 * Register global slash commands via the Discord REST API.
 *
 * Requires DISCORD_APPLICATION_ID and DISCORD_TOKEN (run with `pnpm register`,
 * which loads `.env`). Global commands are cached for up to ~1 hour (usually a
 * few minutes) — Ctrl+R in the client to refresh while debugging.
 *
 * IMPORTANT: user-install mode requires GLOBAL commands (guild commands do not
 * support user install context). Every command carries:
 *   integration_types: [1]        (USER_INSTALL)
 *   contexts: [0, 1, 2]           (GUILD, BOT_DM, PRIVATE_CHANNEL)
 */
import { Command, Option, register } from 'discord-hono'
import { listDeckChoices } from '../src/game/decks'

/** Minimal .env loader (vite-node has no --env-file; zero dependencies). */
import { readFileSync, existsSync } from 'node:fs'
if (existsSync('.env')) {
  for (const raw of readFileSync('.env', 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

const integrationTypes = [1] as const
const contexts = [0, 1, 2] as const

const commands = [
  new Command('ping', '测试 / Test')
    .integration_types(...integrationTypes)
    .contexts(...contexts),

  new Command('play', '开始一轮猜城市游戏 / Start a city guessing round')
    .integration_types(...integrationTypes)
    .contexts(...contexts)
    .options(
      new Option('deck', '选择牌组 / Choose a deck', 'String')
        .required(false)
        .choices(...listDeckChoices().map((c) => ({ name: c.name, value: c.value }))),
    ),

  new Command('stop', '提前结束当前回合 / End the current round early')
    .integration_types(...integrationTypes)
    .contexts(...contexts),

  new Command('rank', '查看本频道排行榜 / View this channel’s leaderboard')
    .integration_types(...integrationTypes)
    .contexts(...contexts),
]

const applicationId = process.env.DISCORD_APPLICATION_ID
const token = process.env.DISCORD_TOKEN

if (!applicationId || !token) {
  console.error('Missing DISCORD_APPLICATION_ID or DISCORD_TOKEN — check .env')
  process.exit(1)
}

register(commands, applicationId, token)
  .then((log) => console.log(log))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
