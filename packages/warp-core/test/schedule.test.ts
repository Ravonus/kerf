// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest'
import {
  type DragPreview,
  agendaItems,
  allDayBars,
  at,
  calendarDrag,
  conflicts,
  countByDay,
  dateOf,
  dayDots,
  daySegments,
  dragCreate,
  dragMove,
  dragResize,
  dstShift,
  eventKey,
  eventName,
  eventsOn,
  isFree,
  laneKey,
  layoutDay,
  mergeRanges,
  minuteOf,
  monthCells,
  monthSummary,
  moveKey,
  moveSlots,
  nextRange,
  nowIn,
  overlaps,
  rangeIssues,
  sharedFree,
  shownIn,
  slotOf,
  slotTimes,
  snapTo,
  spanMinutes,
  startOfWeek,
  stepDate,
  suggestSlots,
  timeOptions,
  toZone,
  viewDays,
  viewRange,
  weekDates,
  weekValid,
  withinHours,
  yearKey,
  yearLevel,
  yearMonths,
  yearTotal,
  zoneMinute,
  type Attendee,
  type CalEvent,
} from '../src/schedule'

const ev = (id: string, start: string, end: string, o: Partial<CalEvent> = {}): CalEvent => ({
  id,
  title: id,
  start,
  end,
  ...o,
})
const on = (s: string, e: string) => [`2026-10-28T${s}`, `2026-10-28T${e}`] as const

describe('time arithmetic', () => {
  test('at runs past either end of a day', () => {
    expect(at('2026-10-28', 600)).toBe('2026-10-28T10:00')
    expect(at('2026-10-28', 1500)).toBe('2026-10-29T01:00')
    expect(at('2026-10-28', -30)).toBe('2026-10-27T23:30')
  })
  test('slots read and write an event', () => {
    const e = ev('a', '2026-10-28T23:00', '2026-10-29T01:00')
    expect(spanMinutes(e.start, e.end)).toBe(120)
    expect(slotOf(e)).toMatchObject({ date: '2026-10-28', s: 1380, e: 1500 })
    expect(slotTimes(slotOf(e))).toEqual({ start: e.start, end: e.end })
    expect(dateOf(e.start)).toBe('2026-10-28')
    expect(minuteOf('2026-10-28')).toBe(0)
  })
})

describe('layout', () => {
  const seg = (id: string, s: number, e: number) => ({ id, s, e })
  test('a lone event fills the column', () => {
    expect(layoutDay([seg('a', 60, 120)]).get('a')).toEqual({ col: 0, cols: 1, span: 1 })
  })
  test('events that only touch stay in separate clusters', () => {
    const l = layoutDay([seg('a', 60, 120), seg('b', 120, 180)])
    expect(l.get('a')!.cols).toBe(1)
    expect(l.get('b')!.cols).toBe(1)
  })
  test('the specimen Wednesday: three overlapping, each on the leftmost free lane', () => {
    const l = layoutDay([seg('interview', 600, 660), seg('sync', 630, 675), seg('pair', 645, 720)])
    expect(l.get('interview')).toEqual({ col: 0, cols: 3, span: 1 })
    expect(l.get('sync')).toEqual({ col: 1, cols: 3, span: 1 })
    expect(l.get('pair')).toEqual({ col: 2, cols: 3, span: 1 })
  })
  test('a long block spans right across lanes that stay free', () => {
    const l = layoutDay([seg('a', 0, 60), seg('b', 0, 30), seg('c', 0, 30), seg('d', 40, 200)])
    expect(l.get('a')).toEqual({ col: 0, cols: 3, span: 1 })
    expect(l.get('d')).toEqual({ col: 1, cols: 3, span: 2 })
  })
  test('a lane frees up and is reused', () => {
    const l = layoutDay([seg('a', 0, 100), seg('b', 0, 30), seg('c', 40, 80)])
    expect(l.get('c')!.col).toBe(1)
  })
  test('daySegments clips a multi-day event and skips a midnight end', () => {
    const e = ev('a', '2026-10-27T22:00', '2026-10-29T00:00')
    expect(daySegments([e], '2026-10-27')[0]).toMatchObject({
      s: 1320,
      e: 1440,
      head: true,
      tail: false,
    })
    expect(daySegments([e], '2026-10-28')[0]).toMatchObject({
      s: 0,
      e: 1440,
      head: false,
      tail: true,
    })
    expect(daySegments([e], '2026-10-29')).toEqual([])
  })
  test('all-day bars span columns, stack in rows, and clip to the days shown', () => {
    const days = weekDates('2026-10-28', 1)
    const bars = allDayBars(
      [
        ev('a', '2026-10-26', '2026-10-27', { allDay: true }),
        ev('b', '2026-10-26', '2026-10-26', { allDay: true }),
        ev('c', '2026-10-20', '2026-10-28', { allDay: true }),
        ev('t', '2026-10-28T09:00', '2026-10-28T10:00'),
      ],
      days,
    )
    expect(bars.map((b) => [b.id, b.col, b.span, b.row])).toEqual([
      ['c', 0, 3, 0],
      ['a', 0, 2, 1],
      ['b', 0, 1, 2],
    ])
  })
  test('eventsOn leads with all-day', () => {
    const list = eventsOn(
      [ev('t', ...on('09:00', '10:00')), ev('a', '2026-10-28', '2026-10-28', { allDay: true })],
      '2026-10-28',
    )
    expect(list.map((e) => e.id)).toEqual(['a', 't'])
  })
})

describe('overlap', () => {
  const a = ev('a', ...on('10:00', '11:00')),
    b = ev('b', ...on('10:30', '11:30')),
    c = ev('c', ...on('11:00', '12:00'))
  test('touching is not overlapping, and an event never collides with itself', () => {
    expect(overlaps(a, b)).toBe(true)
    expect(overlaps(a, c)).toBe(false)
    expect(overlaps(a, a)).toBe(false)
  })
  test('conflicts at a proposed slot, by resource on a timeline', () => {
    expect(conflicts([a, b, c], a).map((e) => e.id)).toEqual(['b'])
    expect(
      conflicts([a, b, c], a, { date: '2026-10-28', s: 690, e: 750 }).map((e) => e.id),
    ).toEqual(['c'])
    expect(
      conflicts([{ ...b, resource: 'x' }], a, {
        date: '2026-10-28',
        s: 630,
        e: 660,
        resource: 'y',
      }),
    ).toEqual([])
  })
  test('mergeRanges joins touching ranges', () => {
    expect(
      mergeRanges([
        [60, 90],
        [0, 30],
        [30, 45],
        [80, 120],
      ]),
    ).toEqual([
      [0, 45],
      [60, 120],
    ])
  })
})

describe('views', () => {
  test('a week from the first day, in either convention', () => {
    expect(startOfWeek('2026-10-28', 1)).toBe('2026-10-26')
    expect(startOfWeek('2026-10-28', 0)).toBe('2026-10-25')
    expect(viewDays('week', '2026-10-28', 1)).toHaveLength(7)
    expect(viewDays('day', '2026-10-28', 1)).toEqual(['2026-10-28'])
    expect(viewDays('week', '2026-10-28', 1, 3)).toEqual(['2026-10-28', '2026-10-29', '2026-10-30'])
  })
  test('ranges cover what each view shows', () => {
    expect(viewRange('week', '2026-10-28', 1)).toEqual({ start: '2026-10-26', end: '2026-11-01' })
    expect(viewRange('month', '2026-10-28', 1)).toEqual({ start: '2026-09-28', end: '2026-11-08' })
    expect(viewRange('year', '2026-10-28', 1)).toEqual({ start: '2026-01-01', end: '2026-12-31' })
    expect(viewRange('timeline', '2026-10-28', 1)).toEqual({
      start: '2026-10-28',
      end: '2026-10-28',
    })
  })
  test('stepping', () => {
    expect(stepDate('week', '2026-10-28', 1)).toBe('2026-11-04')
    expect(stepDate('day', '2026-10-31', 1)).toBe('2026-11-01')
    expect(stepDate('month', '2026-01-31', 1)).toBe('2026-02-28')
    expect(stepDate('year', '2026-10-28', -1)).toBe('2025-10-28')
  })
  test('month cells are six weeks and mark the days outside', () => {
    const w = monthCells('2026-10-28', 1)
    expect(w).toHaveLength(6)
    expect(w[0]!.cells[0]).toEqual({ iso: '2026-09-28', outside: true })
    expect(w[0]!.cells[3]).toEqual({ iso: '2026-10-01', outside: false })
  })
  test('names read as the spec says', () => {
    expect(
      eventName(
        ev('x', '2026-10-26T10:00', '2026-10-26T11:30', {
          title: 'Design crit',
          location: 'Studio',
          tentative: true,
        }),
        'en-US',
      ),
    ).toBe('Design crit, Monday 10:00 to 11:30, Studio, tentative')
    expect(
      eventName(ev('x', '2026-10-26', '2026-10-26', { title: 'Offsite', allDay: true }), 'en-US'),
    ).toBe('Offsite, Monday, all day')
  })
})

describe('zones', () => {
  test('wall time converts across zones', () => {
    expect(toZone('2026-10-28T10:00', 'America/New_York', 'Asia/Tokyo')).toBe('2026-10-28T23:00')
    expect(toZone('2026-10-28T10:00', 'Asia/Tokyo', 'Asia/Tokyo')).toBe('2026-10-28T10:00')
  })
  test('an event in another zone shows in the calendar zone', () => {
    const e = ev('a', '2026-10-28T15:00', '2026-10-28T16:00', { tz: 'Europe/Lisbon' })
    expect(shownIn(e, 'America/New_York').start).toBe('2026-10-28T11:00')
    expect(shownIn(e, 'Europe/Lisbon')).toBe(e)
    expect(shownIn(e)).toBe(e)
  })
  test('dstShift sees the clocks go back inside an event', () => {
    expect(dstShift(ev('a', '2026-11-01T00:30', '2026-11-01T03:30'), 'America/New_York')).toBe(-60)
    expect(dstShift(ev('b', '2026-10-28T00:30', '2026-10-28T03:30'), 'America/New_York')).toBe(0)
    expect(
      dstShift(ev('c', '2026-11-01', '2026-11-01', { allDay: true }), 'America/New_York'),
    ).toBe(0)
  })
  test('nowIn reads a given instant in a zone', () => {
    expect(nowIn('UTC', Date.UTC(2026, 9, 28, 10, 40))).toBe('2026-10-28T10:40')
    expect(nowIn('Asia/Tokyo', Date.UTC(2026, 9, 28, 20, 0))).toBe('2026-10-29T05:00')
  })
})

describe('snapping and drags', () => {
  const o = { date: '2026-10-28', s: 600, e: 690 }
  test('snap', () => {
    expect(snapTo(607)).toBe(600)
    expect(snapTo(608)).toBe(615)
    expect(snapTo(602, 5)).toBe(600)
    expect(snapTo(603, 5)).toBe(605)
  })
  test('a move keeps its length and stays in the day', () => {
    expect(dragMove(o, 22, '2026-10-29')).toEqual({
      date: '2026-10-29',
      s: 615,
      e: 705,
      resource: undefined,
    })
    expect(dragMove(o, 2000, o.date).e).toBe(1440)
    expect(dragMove(o, -2000, o.date).s).toBe(0)
  })
  test('a resize never ends before one step in', () => {
    expect(dragResize(o, 37).e).toBe(720)
    expect(dragResize(o, -500).e).toBe(615)
    expect(dragResize(o, 2000).e).toBe(1440)
  })
  test('a create draws either way from its anchor', () => {
    expect(dragCreate(o.date, 600, 660)).toEqual({ date: o.date, s: 600, e: 660 })
    expect(dragCreate(o.date, 600, 540)).toEqual({ date: o.date, s: 540, e: 615 })
    expect(dragCreate(o.date, 600, 600)).toEqual({ date: o.date, s: 600, e: 615 })
    expect(dragCreate(o.date, 1439, 1439).e).toBe(1440)
  })
})

describe('keyboard', () => {
  const s = { date: '2026-10-28', s: 600, e: 660 }
  const days = weekDates('2026-10-28', 1)
  test('move mode', () => {
    expect(moveKey('ArrowDown', false, s)).toMatchObject({ s: 615, e: 675 })
    expect(moveKey('ArrowUp', false, s)).toMatchObject({ s: 585, e: 645 })
    expect(moveKey('ArrowUp', true, s)).toMatchObject({ s: 600, e: 645 })
    expect(moveKey('ArrowDown', true, s)).toMatchObject({ s: 600, e: 675 })
    expect(moveKey('ArrowRight', false, s, { days })).toMatchObject({ date: '2026-10-29' })
    expect(moveKey('ArrowLeft', false, s, { days, rtl: true })).toMatchObject({
      date: '2026-10-29',
    })
    expect(moveKey('Enter', false, s)).toBe('drop')
    expect(moveKey('Escape', false, s)).toBe('cancel')
    expect(moveKey('x', false, s)).toBeNull()
  })
  test('a move stops at the shown days and the day edges', () => {
    expect(moveKey('ArrowRight', false, { ...s, date: '2026-11-01' }, { days })).toMatchObject({
      date: '2026-11-01',
    })
    expect(moveKey('ArrowUp', false, { date: s.date, s: 0, e: 60 })).toMatchObject({ s: 0 })
    expect(moveKey('ArrowDown', false, { date: s.date, s: 1380, e: 1440 })).toMatchObject({
      e: 1440,
    })
  })
  test('on a timeline ←→ run the lane and ↑↓ change rows', () => {
    const r = { resources: ['a', 'b'] }
    expect(moveKey('ArrowRight', false, { ...s, resource: 'a' }, r)).toMatchObject({
      s: 615,
      resource: 'a',
    })
    expect(moveKey('ArrowDown', false, { ...s, resource: 'a' }, r)).toMatchObject({
      s: 600,
      resource: 'b',
    })
    expect(moveKey('ArrowDown', false, { ...s, resource: 'b' }, r)).toMatchObject({ resource: 'b' })
  })
  const list = [
    ev('a', '2026-10-26T09:00', '2026-10-26T10:00'),
    ev('b', '2026-10-26T14:00', '2026-10-26T15:00'),
    ev('c', '2026-10-28T13:30', '2026-10-28T14:00'),
    ev('d', '2026-10-28T09:00', '2026-10-28T09:30'),
  ]
  test('roving goes through time, then to the nearest of the next day with events', () => {
    expect(eventKey('ArrowDown', 'a', list)).toBe('b')
    expect(eventKey('ArrowUp', 'a', list)).toBeNull()
    expect(eventKey('ArrowRight', 'b', list)).toBe('c')
    expect(eventKey('ArrowRight', 'a', list)).toBe('d')
    expect(eventKey('ArrowLeft', 'c', list)).toBe('b')
    expect(eventKey('ArrowLeft', 'a', list)).toBeNull()
    expect(eventKey('End', 'a', list)).toBe('c')
    expect(eventKey('x', 'a', list)).toBeNull()
  })
  test('lane keys skip an empty row', () => {
    const rows = [
      [
        { id: 'a', s: 100 },
        { id: 'b', s: 300 },
      ],
      [],
      [
        { id: 'c', s: 280 },
        { id: 'd', s: 90 },
      ],
    ]
    expect(laneKey('ArrowRight', 'a', rows)).toBe('b')
    expect(laneKey('ArrowDown', 'a', rows)).toBe('d')
    expect(laneKey('ArrowUp', 'c', rows)).toBe('b')
    expect(laneKey('End', 'a', rows)).toBe('b')
  })
})

describe('agenda', () => {
  const list = [
    ev('o', '2026-10-28', '2026-10-28', { allDay: true }),
    ev('a', ...on('09:00', '09:15')),
    ev('b', ...on('10:00', '11:00')),
    ev('c', ...on('13:00', '13:30')),
  ]
  test('all-day, the now marker in time order, and gaps of an hour or more', () => {
    expect(agendaItems(list, '2026-10-28', '2026-10-28T10:40').map((i) => i.kind)).toEqual([
      'allday',
      'event',
      'event',
      'now',
      'free',
      'event',
    ])
    expect(agendaItems(list, '2026-10-28').find((i) => i.kind === 'free')).toMatchObject({
      minutes: 120,
    })
  })
  test('now lands last after the day, and not at all on another day', () => {
    expect(agendaItems(list, '2026-10-28', '2026-10-28T20:00').at(-1)!.kind).toBe('now')
    expect(agendaItems(list, '2026-10-27', '2026-10-28T10:00')).toEqual([])
  })
  test('dots are unique sources, three at most', () => {
    const many = [1, 1, 2, 3, 4].map((cal, i) => ev(`e${i}`, ...on('09:00', '10:00'), { cal }))
    expect(dayDots(many, '2026-10-28')).toEqual([1, 2, 3])
  })
  test('move slots disable what is taken, ignoring the event itself', () => {
    const e = ev('a', ...on('08:00', '09:00'))
    const s = moveSlots([e, ev('b', ...on('10:00', '11:00'))], e, '2026-10-28', 60, 480, 660)
    expect(s.map((x) => x.busy)).toEqual([false, false, false, true, true, true])
  })
})

describe('year', () => {
  test('density levels', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(yearLevel)).toEqual([0, 1, 1, 2, 2, 3, 3])
  })
  test('counts spread multi-day events and a midnight end stays on its day', () => {
    const c = countByDay([
      ev('a', '2026-10-26', '2026-10-27', { allDay: true }),
      ev('b', '2026-10-27T22:00', '2026-10-28T00:00'),
    ])
    expect(c).toEqual({ '2026-10-26': 1, '2026-10-27': 2 })
  })
  test('a month summary finds the busiest day', () => {
    const c = { '2026-10-02': 2, '2026-10-28': 7, '2026-11-01': 9 }
    expect(monthSummary(c, '2026-10-15')).toEqual({ total: 9, busiest: '2026-10-28', most: 7 })
    expect(yearTotal(c, 2026)).toBe(18)
    expect(yearMonths(2026)[11]).toBe('2026-12-01')
  })
  test('keys', () => {
    expect(yearKey('m', false, '2026-10-28', 1, false)).toBe('month')
    expect(yearKey('T', false, '2026-10-28', 1, false)).toBe('today')
    expect(yearKey('ArrowRight', false, '2026-12-31', 1, false)).toBe('2027-01-01')
    expect(yearKey('PageDown', true, '2026-10-28', 1, false)).toBe('2027-10-28')
  })
})

describe('planner', () => {
  const people: Attendee[] = [
    {
      id: 'you',
      name: 'You',
      busy: [
        [540, 555],
        [600, 720],
      ],
    },
    {
      id: 'ana',
      name: 'Ana',
      busy: [
        [480, 600],
        [780, 840],
      ],
    },
  ]
  const busy = people.map((p) => p.busy!)
  test('free time', () => {
    expect(isFree(busy, 720, 60)).toBe(true)
    expect(isFree(busy, 700, 60)).toBe(false)
    expect(sharedFree(busy, 480, 900)).toEqual([
      [720, 780],
      [840, 900],
    ])
  })
  test('suggestions are free, spaced, and capped at three', () => {
    const s = suggestSlots(people, '2026-10-28', { len: 30 })
    expect(s).toEqual([720, 840, 900])
    expect(suggestSlots(people, '2026-10-28', { len: 300 })).toEqual([])
  })
  test("working hours count in each person's own zone", () => {
    const p: Attendee[] = [
      { id: 'a', name: 'A', zone: 'America/New_York' },
      { id: 'b', name: 'B', zone: 'Asia/Tokyo' },
    ]
    expect(zoneMinute('2026-10-28', 600, 'America/New_York', 'Asia/Tokyo')).toBe(1380)
    expect(withinHours(p, '2026-10-28', 600, 30, 'America/New_York')).toBe(1)
  })
  test('working-hour fit outranks earliest', () => {
    const p: Attendee[] = [{ id: 'a', name: 'A', hours: [840, 1020] }]
    expect(suggestSlots(p, '2026-10-28', { len: 30, limit: 1 })).toEqual([840])
  })
})

describe('availability', () => {
  test('range issues', () => {
    expect(
      rangeIssues([
        [540, 720],
        [780, 1020],
      ]),
    ).toEqual(['', ''])
    expect(rangeIssues([[720, 540]])).toEqual(['Ends before it starts'])
    expect(
      rangeIssues([
        [540, 720],
        [700, 800],
      ]),
    ).toEqual(['Overlaps another range', 'Overlaps another range'])
    expect(
      rangeIssues([
        [540, 720],
        [720, 800],
      ]),
    ).toEqual(['', ''])
  })
  test('an off day is never invalid', () => {
    expect(weekValid([{ day: 1, on: false, ranges: [[720, 540]] }])).toBe(true)
    expect(weekValid([{ day: 1, on: true, ranges: [[720, 540]] }])).toBe(false)
  })
  test('the next range sits an hour on and stays in the list', () => {
    expect(nextRange([[540, 720]])).toEqual([780, 900])
    expect(nextRange([[540, 1320]])).toEqual([1290, 1320])
    expect(timeOptions()).toHaveLength(33)
  })
})

describe('calendarDrag', () => {
  const setup = (overrides: Partial<Parameters<typeof calendarDrag>[1]> = {}) => {
    const root = document.body.appendChild(document.createElement('div'))
    root.innerHTML = `<div data-part="col" data-date="2026-10-28"><div data-part="event" data-id="a"><span data-part="resize"></span></div></div><div data-part="col" data-date="2026-10-29"></div>`
    const [a, b] = [...root.querySelectorAll<HTMLElement>('[data-part="col"]')]
    const rect = (l: number, r: number) => ({
      left: l,
      right: r,
      top: 0,
      bottom: 1440,
      width: r - l,
      height: 1440,
      x: l,
      y: 0,
      toJSON() {},
    })
    a!.getBoundingClientRect = () => rect(0, 100)
    b!.getBoundingClientRect = () => rect(100, 200)
    const log: [string, unknown?, unknown?][] = []
    const action = calendarDrag(root, {
      slot: (id) => (id === 'a' ? { date: '2026-10-28', s: 600, e: 660 } : null),
      onPreview: (p) => log.push(['preview', p]),
      onDrop: (p) => log.push(['drop', p]),
      onPress: (id) => log.push(['press', id]),
      onLongPress: (id) => log.push(['long', id]),
      onSlot: (d, m) => log.push(['slot', d, m]),
      ...overrides,
    })
    const fire = (
      t: EventTarget,
      type: string,
      x: number,
      y: number,
      extra: PointerEventInit = {},
    ) => {
      const e = new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
        cancelable: true,
        ...extra,
      })
      Object.assign(e, { pointerId: 1, pointerType: extra.pointerType ?? 'mouse' })
      t.dispatchEvent(e)
    }
    return {
      root,
      a,
      b,
      log,
      action,
      fire,
      event: root.querySelector<HTMLElement>('[data-part="event"]')!,
      resize: root.querySelector<HTMLElement>('[data-part="resize"]')!,
    }
  }

  test('under 4px is not a drag', () => {
    const { event, log, fire, root } = setup()
    fire(event, 'pointerdown', 10, 610)
    fire(event, 'pointermove', 11, 612)
    fire(event, 'pointerup', 11, 612)
    expect(log).toEqual([])
    root.remove()
  })
  test('a move snaps, crosses days and drops', () => {
    const { event, log, fire, root } = setup()
    fire(event, 'pointerdown', 10, 610)
    fire(root, 'pointermove', 150, 642)
    fire(root, 'pointerup', 150, 642)
    expect(log.at(-1)).toEqual([
      'drop',
      expect.objectContaining({ mode: 'move', id: 'a', date: '2026-10-29', s: 630, e: 690 }),
    ])
    root.remove()
  })
  test('Alt snaps to 5', () => {
    const { event, log, fire, root } = setup()
    fire(event, 'pointerdown', 10, 610)
    fire(root, 'pointermove', 10, 617, { altKey: true })
    expect((log.at(-1)![1] as DragPreview).s).toBe(605)
    root.remove()
  })
  test('Escape cancels and drops nothing', () => {
    const { event, log, fire, root } = setup()
    fire(event, 'pointerdown', 10, 610)
    fire(root, 'pointermove', 10, 700)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    fire(root, 'pointerup', 10, 700)
    expect(log.at(-1)).toEqual(['preview', null])
    expect(log.some((l) => l[0] === 'drop')).toBe(false)
    root.remove()
  })
  test('the handle resizes', () => {
    const { resize, log, fire, root } = setup()
    fire(resize, 'pointerdown', 10, 660)
    fire(root, 'pointermove', 10, 690)
    fire(root, 'pointerup', 10, 690)
    expect(log.at(-1)![1]).toMatchObject({ mode: 'resize', s: 600, e: 690 })
    root.remove()
  })
  test('empty slots draw a draft', () => {
    const { b, log, fire, root } = setup()
    fire(b!, 'pointerdown', 150, 600)
    fire(b!, 'pointermove', 150, 660)
    fire(b!, 'pointerup', 150, 660)
    expect(log.at(-1)![1]).toMatchObject({ mode: 'create', date: '2026-10-29', s: 600, e: 660 })
    root.remove()
  })
  test('readOnly and locked events never drag, but still press', () => {
    const one = setup({ readOnly: true })
    one.fire(one.event, 'pointerdown', 10, 610)
    one.fire(one.root, 'pointermove', 10, 700)
    expect(one.log).toEqual([])
    one.event.click()
    expect(one.log).toEqual([['press', 'a']])
    one.root.remove()
    const two = setup({ slot: () => null })
    two.fire(two.event, 'pointerdown', 10, 610)
    two.fire(two.root, 'pointermove', 10, 700)
    expect(two.log).toEqual([])
    two.root.remove()
  })
  test('a click after a drag is swallowed', () => {
    const { event, log, fire, root } = setup()
    fire(event, 'pointerdown', 10, 610)
    fire(root, 'pointermove', 10, 700)
    fire(root, 'pointerup', 10, 700)
    event.click()
    expect(log.some((l) => l[0] === 'press')).toBe(false)
    root.remove()
  })
  test('a touch long-press lifts, a touch move cancels it, and a touch never drags', () => {
    vi.useFakeTimers()
    const { event, log, fire, root } = setup()
    fire(event, 'pointerdown', 10, 610, { pointerType: 'touch' })
    vi.advanceTimersByTime(399)
    expect(log).toEqual([])
    vi.advanceTimersByTime(1)
    expect(log).toEqual([['long', 'a']])
    log.length = 0
    fire(event, 'pointerdown', 10, 610, { pointerType: 'touch' })
    fire(event, 'pointermove', 10, 640, { pointerType: 'touch' })
    vi.advanceTimersByTime(500)
    expect(log).toEqual([])
    vi.useRealTimers()
    root.remove()
  })
  test('a double click on an empty slot asks for one', () => {
    const { b, log, fire, root } = setup()
    fire(b!, 'dblclick', 150, 607)
    expect(log).toEqual([['slot', '2026-10-29', 600]])
    root.remove()
  })
  test('destroy lets go', () => {
    const { event, log, fire, action, root } = setup()
    action.destroy()
    fire(event, 'pointerdown', 10, 610)
    event.click()
    expect(log).toEqual([])
    root.remove()
  })
})
