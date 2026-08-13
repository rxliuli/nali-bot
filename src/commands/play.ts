import type { CommandHandler } from 'discord-hono'
import type { Env } from '../env'
import { getCard, getDeck } from '../game/decks'
import { buildGuessButton, buildQuestionEmbed } from '../game/embeds'
import { getChannelId } from '../game/util'

/** /play [deck] — start a round in this channel. */
export const play: CommandHandler<Env> = async (c) => {
  const channelId = getChannelId(c.interaction)
  if (!channelId) return c.flags('EPHEMERAL').res('Could not determine the channel')

  const deckId = c.get('deck') ?? 'cn-cities'
  const stub = c.env.GameRoom.getByName(channelId)
  const result = await stub.startRound({
    deckId,
    channelId,
    interactionToken: c.interaction.token,
  })

  if (!result.ok) {
    if (result.reason === 'unknown-deck') {
      return c.flags('EPHEMERAL').res('Unknown deck')
    }
    if (result.reason === 'no-images') {
      return c
        .flags('EPHEMERAL')
        .res('No photos ready yet — run the optimize script first')
    }
    return c
      .flags('EPHEMERAL')
      .res('A round is already in progress — wait for it or use /stop')
  }

  const deck = getDeck(result.deckId)
  const card = getCard(result.deckId, result.cardId)
  if (!deck || !card) {
    return c.flags('EPHEMERAL').res('Deck data error')
  }

  return c.res({
    embeds: [buildQuestionEmbed(deck, card, result.imagePath, result.endsAt)],
    components: buildGuessButton(),
  })
}
