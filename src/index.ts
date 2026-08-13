import { DiscordHono } from 'discord-hono'
import type { InitOptions } from 'discord-hono'
import type { Env } from './env'
import { play } from './commands/play'
import { stop } from './commands/stop'
import { rank } from './commands/rank'
import { guessButton } from './components/guessButton'
import { guessModal } from './components/guessModal'

export { GameRoom } from './do/GameRoom'

/**
 * Nali (Nǎlǐ 哪里) — a city-guessing game bot for language exchange servers.
 *
 * User-installed app: no guild member context, so ALL outbound messages
 * (including the timed reveal) go through interaction webhook tokens.
 */
export function buildApp(options?: InitOptions<Env>): DiscordHono<Env> {
  return new DiscordHono<Env>(options)
    .command('ping', (c) => c.res('pong'))
    .command('play', play)
    .command('stop', stop)
    .command('rank', rank)
    .component('guess', guessButton)
    .modal('guess_answer', guessModal)
}

export default buildApp()
