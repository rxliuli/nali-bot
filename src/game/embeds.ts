import { Button, Components, Embed } from 'discord-hono'
import type { Card, Deck, GuessEntry, PlayerScore } from './types'
import { buildMapUrl } from './map'
import { resolveImageUrl } from '../config'

const COLOR_QUESTION = 0x2b6cb0
const COLOR_ANSWER = 0x38a169
const COLOR_MAP = 0xed8936

/** One bilingual line for the optional hint. */
function hintLine(card: Card): string {
  const zh = card.hint?.zh
  const en = card.hint?.en
  if (zh && en) return `💡 Hint: ${zh} / ${en}`
  if (zh) return `💡 Hint: ${zh}`
  if (en) return `💡 Hint: ${en}`
  return ''
}

/** The question card shown by /play: photo + deck + countdown + hint. */
export function buildQuestionEmbed(deck: Deck, card: Card, imagePath: string, endsAt: number): Embed {
  const secondsLeft = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
  const hint = hintLine(card)
  const lines = [
    `Deck: **${deck.name.zh} / ${deck.name.en}**`,
    '',
    `⏱️ **${secondsLeft}** seconds left`,
  ]
  if (hint) lines.push(hint)
  lines.push('', 'Click the button below to guess')
  return new Embed()
    .title('🏙️ Guess the city!')
    .description(lines.join('\n'))
    .image({ url: resolveImageUrl(imagePath) })
    .color(COLOR_QUESTION)
}

/** The "我要猜" button attached to the question card. */
export function buildGuessButton(): Components {
  return new Components().row(
    new Button('guess', 'Guess').emoji('🤔'),
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

/** Reveal messages: answer + photo, then map + round results + leaderboard. */
export function buildRevealEmbeds(
  card: Card,
  deck: Deck,
  imagePath: string,
  correctGuesses: GuessEntry[],
  scores: PlayerScore[],
): Embed[] {
  const label = card.images.find((i) => i.path === imagePath)?.label
  const hint = hintLine(card)
  const answerEmbed = new Embed()
    .title(`🎯 ${deck.name.zh} / ${deck.name.en}`)
    .description(
      `The answer is **${card.display.zh} / ${card.display.en}**\n` +
        (label?.zh || label?.en
          ? `📍 You saw: **${label.zh ?? ''}${label.zh && label.en ? ' / ' : ''}${label.en ?? ''}**\n`
          : '') +
        (hint ? `${hint}\n` : '') +
        'Photo above',
    )
    .image({ url: resolveImageUrl(imagePath) })
    .color(COLOR_ANSWER)

  const statsEmbed = new Embed()
    .title(`🗺️ ${card.display.en} on the map`)
    .image({ url: buildMapUrl(card.lat, card.lng) })
    .color(COLOR_MAP)

  if (correctGuesses.length === 0) {
    statsEmbed.fields({ name: 'Correct', value: '😢 Nobody got it this round', inline: false })
  } else {
    const lines = correctGuesses.map((g, i) => {
      const medal = MEDALS[i] ?? `#${i + 1}`
      return `${medal} **${g.username}**`
    })
    statsEmbed.fields({ name: `Correct (${correctGuesses.length})`, value: lines.join('\n'), inline: false })
  }

  if (scores.length > 0) {
    const top = [...scores].sort((a, b) => b.score - a.score).slice(0, 5)
    const lines = top.map((s, i) => {
      const medal = MEDALS[i] ?? `${i + 1}.`
      const firstNote = s.firsts > 0 ? ` (firsts ×${s.firsts})` : ''
      return `${medal} **${s.username}** — ${s.score} pts${firstNote}`
    })
    statsEmbed.fields({ name: '🏆 Channel leaderboard', value: lines.join('\n'), inline: false })
  }

  return [answerEmbed, statsEmbed]
}
