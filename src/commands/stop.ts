import type { CommandHandler } from 'discord-hono'
import type { Env } from '../env'
import { getChannelId } from '../game/util'

/** /stop — end the current round early and reveal. */
export const stop: CommandHandler<Env> = async (c) => {
  const channelId = getChannelId(c.interaction)
  if (!channelId) return c.flags('EPHEMERAL').res('Could not determine the channel')

  const stub = c.env.GameRoom.getByName(channelId)
  const result = await stub.stopRound()
  if (!result.ok) {
    return c.flags('EPHEMERAL').res('No round in progress')
  }
  return c.flags('EPHEMERAL').res('Round ended early — revealing…')
}
