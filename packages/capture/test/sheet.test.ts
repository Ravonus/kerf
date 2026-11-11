import { frameStats, sheetLayout } from '@weft-js/capture'

test('tiles fill rows left to right with a gap between and around them', () => {
  const layout = sheetLayout(5, { tileWidth: 100, tileHeight: 50, cols: 2, gap: 4 })
  expect([layout.width, layout.height]).toEqual([2 * 100 + 3 * 4, 3 * 50 + 4 * 4])
  expect(layout.cells.map(({ x, y }) => [x, y])).toEqual([
    [4, 4],
    [108, 4],
    [4, 58],
    [108, 58],
    [4, 112],
  ])
})

test('without a column count a sheet is near square, and a caption adds to each row', () => {
  const layout = sheetLayout(10, { tileWidth: 10, tileHeight: 10, gap: 0, label: 5 })
  expect(layout.cells.filter((c) => c.y === 0)).toHaveLength(4)
  expect(layout.height).toBe(3 * 15)
  expect(sheetLayout(2, { tileWidth: 10, tileHeight: 10, cols: 9 }).cells[1]).toEqual({
    x: 18,
    y: 4,
  })
})

test('frame stats carry the slow end: p5 fps and the frames over 33 and 50 ms', () => {
  const gaps = [...Array(95).fill(16.7), 40, 40, 40, 60, 60]
  const stats = frameStats(gaps)
  expect(stats.count).toBe(100)
  expect(stats.medianMs).toBe(16.7)
  expect(stats.p5Fps).toBe(25)
  expect([stats.over33, stats.over50, stats.over33Share]).toEqual([5, 2, 0.05])
  expect(stats.maxMs).toBe(60)
})
