import { Modal, TextInput } from 'discord-hono'
import type { Button, ComponentHandler } from 'discord-hono'
import type { Env } from '../env'
import { getChannelId, getUserId } from '../game/util'

/** "我要猜" button → open the guess modal (or an ephemeral explanation). */
export const guessButton: ComponentHandler<Env, Button<any>> = async (c) => {
  const channelId = c.interaction.channel_id
  const userId = getUserId(c.interaction)
  if (!channelId || !userId) {
    return c.flags('EPHEMERAL').res('Could not determine channel or user')
  }

  const stub = c.env.GameRoom.getByName(channelId)
  const can = await stub.canOpenGuess(userId)
  if (!can.ok) {
    const msg =
      can.reason === 'already-correct'
        ? 'You already answered correctly 🎉'
        : 'Round over — start a new one with /play'
    return c.flags('EPHEMERAL').res(msg)
  }

  return c.resModal(
    new Modal('guess_answer', 'Guess the city').row(
      new TextInput('answer', 'Your answer')
        .placeholder('e.g. Harbin')
        .min_length(1)
        .max_length(60)
        .required(),
    ),
  )
}
