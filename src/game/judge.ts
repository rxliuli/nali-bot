import type { Card } from './types'

/**
 * Answer judgment — pure functions, heavily unit-tested.
 *
 * Normalization pipeline:
 * 1. trim + fullwidth→halfwidth + lowercase
 * 2. If the input contains Chinese characters, match against the `zh` alias pool;
 *    otherwise match against the `en` alias pool (English names + pinyin).
 * 3. Chinese: strip trailing "市 / 省 / 特别行政区".
 * 4. English: strip all non-alphanumeric characters (spaces, `'`, `-`, `.`, …),
 *    so "Xi'an" == "xian" and "St. Louis" == "stlouis".
 * 5. Exact match first; if that fails, allow a small typo tolerance on English
 *    (Damerau-Levenshtein distance ≤ 1, or ≤ 2 for inputs of length ≥ 5).
 *    Chinese gets no fuzzy tolerance.
 */

/** Fullwidth ASCII (U+FF01..U+FF5E) → halfwidth; ideographic space → space. */
export function fullToHalf(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (code === 0x3000) {
      out += ' '
    } else if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCodePoint(code - 0xfee0)
    } else {
      out += ch
    }
  }
  return out
}

export function containsChinese(s: string): boolean {
  return /[\u3400-\u9fff]/.test(s)
}

/** Step 1 + 3: normalize a Chinese answer. */
export function normalizeZh(raw: string): string {
  // fullwidth→halfwidth, trim, lowercase, then drop all whitespace
  // (e.g. “哈尔滨 市” → “哈尔滨市”).
  let s = fullToHalf(raw).trim().toLowerCase().replace(/\s+/g, '')
  for (const suffix of ['特别行政区', '市', '省']) {
    if (s.endsWith(suffix)) s = s.slice(0, -suffix.length)
  }
  return s
}

/** Step 1 + 4: normalize an English / pinyin answer. */
export function normalizeEn(raw: string): string {
  return fullToHalf(raw).trim().toLowerCase().replace(/[\s'\-.]/g, '')
}

/** Damerau-Levenshtein distance (optimal string alignment). */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i]![0] = i
  for (let j = 0; j <= n; j++) dp[0]![j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1, // deletion
        dp[i]![j - 1]! + 1, // insertion
        dp[i - 1]![j - 1]! + cost, // substitution
      )
      // transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + 1)
      }
    }
  }
  return dp[m]![n]!
}

/**
 * Typo tolerance: an input may match an alias if it is close enough.
 * - distance ≤ 1 always (single typo / transposition)
 * - distance 2 only when the strings are long enough that similarity stays
 *   ≥ 0.8 (i.e. max length ≥ 10) — e.g. "Filadelphia" → "philadelphia" (2/12),
 *   but NOT "hangzhou" → "guangzhou" (2/9), "xiamen" → "xian" (2/6),
 *   "boston" → "houston" (2/7).
 * Short inputs are exact-match only, to avoid false positives.
 */
export function fuzzyMatch(input: string, alias: string): boolean {
  const d = damerauLevenshtein(input, alias)
  if (d <= 1) return true
  if (d === 2) {
    const maxLen = Math.max(input.length, alias.length)
    return 1 - d / maxLen >= 0.8
  }
  return false
}

/**
 * Judge whether a raw player answer matches the card.
 * Returns true when the answer is acceptable.
 */
export function judgeAnswer(rawInput: string, card: Card): boolean {
  const input = fullToHalf(rawInput).trim().toLowerCase()
  if (!input) return false

  const zhAliases = card.answers.zh.map(normalizeZh)
  const enAliases = card.answers.en.map(normalizeEn)

  if (containsChinese(input)) {
    const s = normalizeZh(input)
    return zhAliases.includes(s)
  }

  // English / pinyin input
  if (enAliases.includes(input)) return true
  return enAliases.some((alias) => fuzzyMatch(input, alias))
}
