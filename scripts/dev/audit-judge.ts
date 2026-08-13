// Dev audit: check that no input which should belong to card A (its aliases,
// and near-misses) could be judged correct for a DIFFERENT card in the same deck.
// Run: tsx scripts/dev/audit-judge.ts
import { judgeAnswer, damerauLevenshtein, normalizeEn } from '../../src/game/judge'
import { getDecks } from './_decks'

let problems = 0

for (const { deck } of getDecks()) {
  const deckId = deck.id
  for (const card of deck.cards) {
    // Every alias of every other card in the deck must NOT match this card,
    // and neither may the other card's display name.
    for (const other of deck.cards) {
      if (other.id === card.id) continue
      for (const zh of other.answers.zh) {
        if (judgeAnswer(zh, card)) {
          console.log(`COLLISION zh: "${zh}" (${other.id}) matches ${card.id}`)
          problems++
        }
      }
      for (const en of other.answers.en) {
        if (judgeAnswer(en, card)) {
          console.log(`COLLISION en: "${en}" (${other.id}) matches ${card.id}`)
          problems++
        }
      }
      for (const disp of [other.display.zh, other.display.en]) {
        if (judgeAnswer(disp, card)) {
          console.log(`COLLISION display: "${disp}" (${other.id}) matches ${card.id}`)
          problems++
        }
      }
    }
  }
  // Also report the closest near-miss per card pair (informational)
  console.log(`\n== ${deckId} close pairs (distance ≤ 2) ==`)
  for (const card of deck.cards) {
    for (const other of deck.cards) {
      if (other.id >= card.id) continue
      for (const a of card.answers.en) {
        for (const b of other.answers.en) {
          const d = damerauLevenshtein(normalizeEn(a), normalizeEn(b))
          if (d <= 2) console.log(`  ${card.id} "${a}" ~ ${other.id} "${b}" (d=${d})`)
        }
      }
    }
  }
}

console.log(problems === 0 ? '\n✅ No judge collisions' : `\n❌ ${problems} collisions found`)
process.exit(problems === 0 ? 0 : 1)
