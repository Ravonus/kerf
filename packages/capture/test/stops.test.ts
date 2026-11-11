import { parseStop, resolveStop, stopName, type SectionMap } from '@kerf-js/capture'

// A 900 px viewport over a hero (one viewport), a tall section (three) and a short footer.
const MAP: SectionMap = {
  viewportHeight: 900,
  documentHeight: 900 + 2700 + 400,
  sections: [
    { index: 0, id: 'hero', top: 0, height: 900 },
    { index: 1, id: 'tall', top: 900, height: 2700 },
    { index: 2, id: null, top: 3600, height: 400 },
  ],
}

test('a stop is written as pixels, a section at a share, or pixels past a section top', () => {
  expect(parseStop('1200')).toBe(1200)
  expect(parseStop('tall@0.5')).toEqual({ section: 'tall', at: 0.5 })
  expect(parseStop('1@.25')).toEqual({ section: 1, at: 0.25 })
  expect(parseStop('tall+300')).toEqual({ section: 'tall', px: 300 })
  expect(parseStop('tall-120')).toEqual({ section: 'tall', px: -120 })
  expect(() => parseStop('tall@')).toThrow(/a stop is/)
})

test('a tall section runs from its top at the top to its bottom at the bottom', () => {
  expect(resolveStop({ section: 'tall', at: 0 }, MAP)).toBe(900)
  expect(resolveStop({ section: 1, at: 0.5 }, MAP)).toBe(1800)
  expect(resolveStop({ section: 'tall', at: 1 }, MAP)).toBe(2700)
  expect(resolveStop({ section: 'tall', px: 300 }, MAP)).toBe(1200)
})

test('a short section runs from entering below to leaving above, clamped to the page', () => {
  expect(resolveStop({ section: 2, at: 0 }, MAP)).toBe(2700)
  expect(resolveStop({ section: 2, at: 0.5 }, MAP)).toBe(3100)
  expect(resolveStop({ section: 2, at: 1 }, MAP)).toBe(3100)
  expect(resolveStop({ section: 'hero', at: 0 }, MAP)).toBe(0)
  expect(resolveStop(-50, MAP)).toBe(0)
  expect(resolveStop(99_999, MAP)).toBe(3100)
})

test('an unknown section is an error, and each stop has a file name', () => {
  expect(() => resolveStop({ section: 'gone', at: 0 }, MAP)).toThrow(/no section "gone"/)
  expect([1200, { section: 'tall', at: 0.5 }, { section: 2, px: -40 }].map(stopName)).toEqual([
    'y1200',
    'tall@0.50',
    '2-40',
  ])
})
