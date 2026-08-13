import type { CommandHandler } from 'discord-hono'
import type { Env } from '../env'
import { getCard, getDeck } from '../game/decks'
import { buildGuessButton, buildQuestionEmbed } from '../game/embeds'
import { getChannelId } from '../game/util'

/** /play [deck] — start a round in this channel. */
export const play: CommandHandler<Env> = async (c) => {
  const channelId = getChannelId(c.interaction)
  if (!channelId) return c.flags('EPHEMERAL').res('无法确定频道 / Could not determine channel')

  const deckId = c.get('deck') ?? 'cn-cities'
  const stub = c.env.GameRoom.getByName(channelId)
  const result = await stub.startRound({
    deckId,
    channelId,
    interactionToken: c.interaction.token,
  })

  if (!result.ok) {
    if (result.reason === 'unknown-deck') {
      return c.flags('EPHEMERAL').res('未知牌组 / Unknown deck')
    }
    if (result.reason === 'no-images') {
      return c
        .flags('EPHEMERAL')
        .res('牌组还没有可用的图片，先运行优化脚本 / No photos ready yet — run the optimize script first')
    }
    return c
      .flags('EPHEMERAL')
      .res('本频道已有一轮进行中，等它结束或使用 /stop 提前结束 / A round is already in progress — wait for it or use /stop')
  }

  const deck = getDeck(result.deckId)
  const card = getCard(result.deckId, result.cardId)
  if (!deck || !card) {
    return c.flags('EPHEMERAL').res('牌组数据异常 / Deck data error')
  }

  return c.res({
    embeds: [buildQuestionEmbed(deck, card, result.imagePath, result.endsAt)],
    components: buildGuessButton(),
  })
}
