import type { ModalHandler } from 'discord-hono'
import type { Env } from '../env'
import { getChannelId, getUserId, getUsername } from '../game/util'

/** Guess modal submit → judge via the channel's GameRoom, ephemeral feedback. */
export const guessModal: ModalHandler<Env> = async (c) => {
  const channelId = c.interaction.channel_id
  const userId = getUserId(c.interaction)
  if (!channelId || !userId) {
    return c.flags('EPHEMERAL').res('Could not determine channel or user')
  }

  const answer = (c.get('answer') ?? '').trim()
  if (!answer) {
    return c.flags('EPHEMERAL').res('Please enter an answer')
  }

  const stub = c.env.GameRoom.getByName(channelId)
  const result = await stub.submitGuess({
    userId,
    username: getUsername(c.interaction),
    answer,
  })

  if (!result.ok) {
    if (result.reason === 'already-correct') {
      return c.flags('EPHEMERAL').res('You already answered correctly 🎉')
    }
    return c.flags('EPHEMERAL').res('Round over — start a new one with /play')
  }

  if (result.correct) {
    return c
      .flags('EPHEMERAL')
      .res(
        result.firstCorrect
          ? '✅ Correct! First correct answer, +2 pts 🎉'
          : '✅ Correct! +1 pt',
      )
  }
  return c.flags('EPHEMERAL').res('❌ Not quite, try again')
}
