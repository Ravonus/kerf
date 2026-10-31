// The rich inputs' logic (04): dates and times without a DOM.
import { describe, expect, test } from 'vitest'
import { addMonths, balance, cardBrand, cardMask, caretAfter, fmtRange, formatDuration, formatPhone, inferCountry, isoWeek, monthWeeks, occurrences, parseDate, parseDuration, parseRule, parseTime, pickRange, press, PHONE_COUNTRIES, ruleSentence, segmentParts, stringifyRule, totalSeconds, addressFormat, withAddressPart, signatureSvg } from '../src/index'

describe('dates', () => {
  test('month arithmetic clamps to the month', () => expect(addMonths('2026-01-31', 1)).toBe('2026-02-28'))
  test('ISO weeks cross years', () => expect(isoWeek('2027-01-01')).toMatchObject({ year: 2026, week: 53 }))
  test('a month grid has full weeks', () => { for (const w of monthWeeks('2026-10-01', 1)) expect(w.length).toBe(7) })
  test('parsing is day-first in en-GB', () => expect(parseDate('3/4/2026', 'en-GB')).toBe('2026-04-03'))
  test('times parse 12-hour text', () => expect(parseTime('2:30 pm')).toBe('14:30'))
  test('ranges share what they can', () => expect(fmtRange('2026-10-12', '2026-10-16', 'en-US')).toContain('12'))
  test('a second click before the first swaps', () => expect(pickRange({ start: '2026-10-12', end: null }, '2026-10-02')).toEqual({ start: '2026-10-02', end: '2026-10-12' }))
})

describe('segments', () => {
  test('parts follow the locale', () => {
    const order = (l: string) => segmentParts('date', l).filter((p: any) => !p.literal).map((p: any) => p.name ?? p)
    expect(order('en-US')).not.toEqual(order('de-DE'))
  })
  test('press is exported', () => expect(typeof press).toBe('function'))
})

describe('durations', () => {
  test('balance', () => expect(formatDuration(balance(totalSeconds(parseDuration('PT90M')), ['h', 'm']))).toBe('PT1H30M'))
})

describe('recurrence', () => {
  test('round trips unknown parts', () => expect(stringifyRule(parseRule('FREQ=WEEKLY;BYSETPOS=2'))).toBe('FREQ=WEEKLY;BYSETPOS=2'))
  test('every two weeks', () => expect(occurrences(parseRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE'), '2026-10-28', 2)).toEqual(['2026-10-28', '2026-11-11']))
  test('the last Friday', () => expect(occurrences(parseRule('FREQ=MONTHLY;BYDAY=-1FR'), '2026-10-01', 2)).toEqual(['2026-10-30', '2026-11-27']))
  test('COUNT stops', () => expect(occurrences(parseRule('FREQ=DAILY;COUNT=2'), '2026-10-28', 5).length).toBe(2))
  test('sentence', () => expect(ruleSentence(parseRule('FREQ=MONTHLY;BYDAY=-1FR'), '2026-10-30', 'en-US')).toBe('Every month on the last Friday'))
})

describe('identity', () => {
  const us = PHONE_COUNTRIES.find(c => c.code === 'US')!
  test('phones format', () => expect(formatPhone('4155550132', us).shown).toBe('(415) 555-0132'))
  test('the caret stays behind its digit', () => expect(caretAfter('(415) 555', 4)).toBe(7))
  test('a pasted +44 is the UK', () => expect(inferCountry('+442079460958', us)?.code).toBe('GB'))
  test('card brands', () => { expect(cardBrand('378282')).toBe('American Express'); expect(cardMask('4242')).toBe('•••• 4242') })
  test('Japan runs big to small', () => expect(addressFormat('JP').fields[0][0]).toBe('postalCode'))
  test('address parts', () => expect(withAddressPart({ country: 'US', lines: ['a'] }, 'line2', 'b').lines).toEqual(['a', 'b']))
  test('signature svg', () => expect(signatureSvg([[[0, 0, 2], [1, 1, 2]]])).toContain('<path d="M0 0Q'))
})
