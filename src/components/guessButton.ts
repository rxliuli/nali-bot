import { Modal, TextInput } from 'discord-hono'
import type { Button, ComponentHandler } from 'discord-hono'
import type { Env } from '../env'
import { getChannelId, getUserId } from '../game/util'

/** "我要猜" button → open the guess modal (or an ephemeral explanation). */
export const guessButton: ComponentHandler<Env, Button<any>> = async (c) => {
  const channelId = c.interaction.channel_id
  const userId = getUserId(c.interaction)
  if (!channelId || !userId) {
    return c.flags('EPHEMERAL').res('无法确定频道或用户 / Could not determine channel or user')
  }

  const stub = c.env.GameRoom.getByName(channelId)
  const can = await stub.canOpenGuess(userId)
  if (!can.ok) {
    const msg =
      can.reason === 'already-correct'
        ? '你已经答对啦 🎉 / You already answered correctly'
        : '本轮已结束，用 /play 开始新一轮吧 / Round over — start a new one with /play'
    return c.flags('EPHEMERAL').res(msg)
  }

  return c.resModal(
    new Modal('guess_answer', '猜城市 / Guess the city').row(
      new TextInput('answer', '你的答案 / Your answer')
        .placeholder('例：哈尔滨 / e.g. Harbin')
        .min_length(1)
        .max_length(60)
        .required(),
    ),
  )
}
