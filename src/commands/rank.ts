import { Embed } from 'discord-hono'
import type { CommandHandler } from 'discord-hono'
import type { Env } from '../env'
import { getChannelId } from '../game/util'

const MEDALS = ['🥇', '🥈', '🥉']

/** /rank — this channel's cumulative leaderboard (top 10). */
export const rank: CommandHandler<Env> = async (c) => {
  const channelId = getChannelId(c.interaction)
  if (!channelId) return c.flags('EPHEMERAL').res('Could not determine the channel')

  const stub = c.env.GameRoom.getByName(channelId)
  const scores = await stub.getRanking()
  if (scores.length === 0) {
    return c
      .flags('EPHEMERAL')
      .res('No scores yet — start a round with /play!')
  }

  const lines = scores.map((s, i) => {
    const medal = MEDALS[i] ?? `${i + 1}.`
    const firstNote = s.firsts > 0 ? ` (firsts ×${s.firsts})` : ''
    return `${medal} **${s.username}** — ${s.score} pts${firstNote}`
  })
  return c.res({
    embeds: [
      new Embed()
        .title('🏆 Leaderboard')
        .description(lines.join('\n'))
        .color(0xed8936),
    ],
  })
}
