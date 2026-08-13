import { describe, expect, it } from 'vitest'
import type { Card } from '../src/game/types'
import {
  containsChinese,
  damerauLevenshtein,
  fullToHalf,
  judgeAnswer,
  normalizeEn,
  normalizeZh,
} from '../src/game/judge'

/** Fixture cards — tests must not depend on deck data files. */
const harbin: Card = {
  id: 'harbin',
  images: [{ path: 'decks/cn-cities/harbin.webp' }],
  lat: 45.8038,
  lng: 126.5349,
  answers: {
    zh: ['哈尔滨', '哈尔滨市'],
    en: ['harbin', 'haerbin'],
  },
  display: { zh: '哈尔滨', en: 'Harbin' },
}

const xian: Card = {
  id: 'xian',
  images: [{ path: 'decks/cn-cities/xian.webp' }],
  lat: 34.3416,
  lng: 108.9398,
  answers: {
    zh: ['西安', '西安市'],
    en: ['xian', "xi'an"],
  },
  display: { zh: '西安', en: "Xi'an" },
}

const philadelphia: Card = {
  id: 'philadelphia',
  images: [{ path: 'decks/cn-cities/philadelphia.webp' }],
  lat: 39.9526,
  lng: -75.1652,
  answers: {
    zh: ['费城', '费城市'],
    en: ['philadelphia'],
  },
  display: { zh: '费城', en: 'Philadelphia' },
}

const urumqi: Card = {
  id: 'urumqi',
  images: [{ path: 'decks/cn-cities/urumqi.webp' }],
  lat: 43.8256,
  lng: 87.6168,
  answers: {
    zh: ['乌鲁木齐', '乌鲁木齐市'],
    en: ['urumqi', 'wulumuqi', 'ürümqi'],
  },
  display: { zh: '乌鲁木齐', en: 'Ürümqi' },
}

const guangzhou: Card = {
  id: 'guangzhou',
  images: [{ path: 'decks/cn-cities/guangzhou.webp' }],
  lat: 23.1291,
  lng: 113.2644,
  answers: {
    zh: ['广州', '广州市'],
    en: ['guangzhou', 'canton'],
  },
  display: { zh: '广州', en: 'Guangzhou' },
}

describe('normalization', () => {
  it('trims and lowercases', () => {
    expect(normalizeEn('  Harbin  ')).toBe('harbin')
  })

  it('converts fullwidth ASCII to halfwidth', () => {
    expect(fullToHalf('ＨＡＲＢＩＮ　１２３')).toBe('HARBIN 123')
    expect(normalizeEn('ｈａｒｂｉｎ')).toBe('harbin')
    expect(normalizeZh('哈尔滨　市')).toBe('哈尔滨')
  })

  it('strips trailing 市 / 省 / 特别行政区 from Chinese', () => {
    expect(normalizeZh('哈尔滨市')).toBe('哈尔滨')
    expect(normalizeZh('广东省')).toBe('广东')
    expect(normalizeZh('香港特别行政区')).toBe('香港')
    expect(normalizeZh('哈尔滨')).toBe('哈尔滨')
  })

  it('strips spaces, apostrophes, hyphens and dots from English', () => {
    expect(normalizeEn("Xi'an")).toBe('xian')
    expect(normalizeEn('St. Louis')).toBe('stlouis')
    expect(normalizeEn('New York City')).toBe('newyorkcity')
    expect(normalizeEn('Washington D.C.')).toBe('washingtondc')
    expect(normalizeEn('Ürümqi')).toBe('ürümqi')
  })

  it('detects Chinese characters', () => {
    expect(containsChinese('哈尔滨')).toBe(true)
    expect(containsChinese('harbin')).toBe(false)
    expect(containsChinese('Harbin 哈尔滨')).toBe(true)
  })
})

describe('exact matching', () => {
  it('matches the plain Chinese name (simplified/traditional not handled, aliases cover it)', () => {
    expect(judgeAnswer('广州', guangzhou)).toBe(true)
    expect(judgeAnswer('廣州', guangzhou)).toBe(false) // traditional — no alias for it
  })

  it('matches 哈尔滨市 == 哈尔滨', () => {
    expect(judgeAnswer('哈尔滨市', harbin)).toBe(true)
    expect(judgeAnswer('哈尔滨', harbin)).toBe(true)
  })

  it("matches Xi'an == xian", () => {
    expect(judgeAnswer('xian', xian)).toBe(true)
    expect(judgeAnswer("Xi'an", xian)).toBe(true)
    expect(judgeAnswer('西安', xian)).toBe(true)
  })

  it('matches pinyin wulumuqi to 乌鲁木齐', () => {
    expect(judgeAnswer('wulumuqi', urumqi)).toBe(true)
    expect(judgeAnswer('urumqi', urumqi)).toBe(true)
    expect(judgeAnswer('乌鲁木齐', urumqi)).toBe(true)
  })

  it('matches case-insensitively and with fullwidth input', () => {
    expect(judgeAnswer('HARBIN', harbin)).toBe(true)
    expect(judgeAnswer('ｈａｒｂｉｎ', harbin)).toBe(true)
  })
})

describe('fuzzy matching (English only)', () => {
  it('tolerates a single typo', () => {
    expect(judgeAnswer('harbin', harbin)).toBe(true)
    expect(judgeAnswer('harbim', harbin)).toBe(true) // one substitution
    expect(judgeAnswer('harbi', harbin)).toBe(true) // one deletion
    expect(judgeAnswer('harbinn', harbin)).toBe(true) // one insertion
  })

  it('"Filadelphia" fuzzy-matches "philadelphia" (distance 2, length ≥ 5)', () => {
    expect(damerauLevenshtein('filadelphia', 'philadelphia')).toBe(2)
    expect(judgeAnswer('Filadelphia', philadelphia)).toBe(true)
  })

  it('does not fuzzy-match Chinese answers', () => {
    expect(judgeAnswer('哈尔摈', harbin)).toBe(false) // one typo in Chinese → still rejected
    expect(judgeAnswer('哈尔', harbin)).toBe(false)
  })
})

describe('wrong answers are not misjudged', () => {
  it('rejects unrelated cities', () => {
    expect(judgeAnswer('beijing', harbin)).toBe(false)
    expect(judgeAnswer('北京', harbin)).toBe(false)
    expect(judgeAnswer('shanghai', philadelphia)).toBe(false)
    expect(judgeAnswer('miami', philadelphia)).toBe(false)
  })

  it('rejects empty / whitespace-only input', () => {
    expect(judgeAnswer('', harbin)).toBe(false)
    expect(judgeAnswer('   ', harbin)).toBe(false)
  })

  it('rejects far-away typos (length ≥ 5 guard keeps distance 2 sane)', () => {
    expect(judgeAnswer('chicago', philadelphia)).toBe(false)
    expect(judgeAnswer('newyorkcity', philadelphia)).toBe(false)
  })
})
