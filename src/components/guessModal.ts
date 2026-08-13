import type { ModalHandler } from 'discord-hono'
import type { Env } from '../env'
import { getChannelId, getUserId, getUsername } from '../game/util'

/** Guess modal submit → judge via the channel's GameRoom, ephemeral feedback. */
export const guessModal: ModalHandler<Env> = async (c) => {
  const channelId = c.interaction.channel_id
  const userId = getUserId(c.interaction)
  if (!channelId || !userId) {
    return c.flags('EPHEMERAL').res('无法确定频道或用户 / Could not determine channel or user')
  }

  const answer = (c.get('answer') ?? '').trim()
  if (!answer) {
    return c.flags('EPHEMERAL').res('请输入答案 / Please enter an answer')
  }

  const stub = c.env.GameRoom.getByName(channelId)
  const result = await stub.submitGuess({
    userId,
    username: getUsername(c.interaction),
    answer,
  })

  if (!result.ok) {
    if (result.reason === 'already-correct') {
      return c.flags('EPHEMERAL').res('你已经答对啦 🎉 / You already answered correctly')
    }
    return c.flags('EPHEMERAL').res('本轮已结束，用 /play 开始新一轮吧 / Round over — start a new one with /play')
  }

  if (result.correct) {
    return c
      .flags('EPHEMERAL')
      .res(
        result.firstCorrect
          ? '✅ 答对了！你是本轮第一个答对的，+2 分 🎉 / Correct! First correct answer, +2 pts'
          : '✅ 答对了！+1 分 / Correct! +1 pt',
      )
  }
  return c.flags('EPHEMERAL').res('❌ 不对，再想想（可以重猜）/ Not quite, try again')
}
