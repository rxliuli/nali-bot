import type { CommandHandler } from 'discord-hono'
import type { Env } from '../env'
import { getChannelId } from '../game/util'

/** /stop — end the current round early and reveal. */
export const stop: CommandHandler<Env> = async (c) => {
  const channelId = getChannelId(c.interaction)
  if (!channelId) return c.flags('EPHEMERAL').res('无法确定频道 / Could not determine channel')

  const stub = c.env.GameRoom.getByName(channelId)
  const result = await stub.stopRound()
  if (!result.ok) {
    return c.flags('EPHEMERAL').res('当前没有进行中的回合 / No round in progress')
  }
  return c.flags('EPHEMERAL').res('已提前结束本轮，揭晓中… / Round ended early, revealing…')
}
