// The live pack's logic: arrivals, the toast policy, the preferences model, meetings, the transport model.
import { describe, expect, test, vi } from 'vitest'
import {
  applyPrefs, arrivals, backoffCap, bellCount, bellLabel, connectionAnnouncement, countdownLabel, countdownParts, dayLabel, filterNotes, formatMs, freshIds, galleryCols,
  groupByDay, hueOf, latencyTone, levelMeter, litBars, liveState, newHands, notifyPolicy, percentile, pipStep, prefCell, speakerFollow, tileLabel, toggleChanges, transportError,
  transportSim, triState, unreadCount, worstLive, type PrefEvent, type TransportConfig,
} from '../src/live'

const tickMO = () => new Promise(r => setTimeout(r, 0))
const list = (ids: string[]) => {
  const el = document.createElement('ul')
  el.innerHTML = ids.map(i => `<li data-id="${i}"></li>`).join('')
  return el
}
const add = (el: HTMLElement, id: string) => { const li = document.createElement('li'); li.dataset.id = id; el.prepend(li); return li }

describe('arrivals', () => {
  test('freshIds keeps order and remembers', () => {
    const seen = new Set(['a'])
    expect(freshIds(seen, ['b', 'a', 'c'])).toEqual(['b', 'c'])
    expect(freshIds(seen, ['b'])).toEqual([])
  })
  test('the first render never animates; only new ids do, and the mark comes off', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const el = list(['a', 'b'])
    const onArrive = vi.fn()
    const act = arrivals(el, { hold: 100, onArrive })
    expect(el.querySelector('[data-arrive]')).toBeNull()
    const row = add(el, 'c')
    await Promise.resolve(); await Promise.resolve()
    expect(row.hasAttribute('data-arrive')).toBe(true)
    expect(el.querySelectorAll('[data-arrive]').length).toBe(1)
    expect(onArrive).toHaveBeenCalledWith(['c'])
    vi.advanceTimersByTime(100)
    expect(row.hasAttribute('data-arrive')).toBe(false)
    act.destroy()
    vi.useRealTimers()
  })
  test('with `ids`, a row known before it comes into view (a tab change) does not replay', async () => {
    const el = list(['a'])
    const onArrive = vi.fn()
    const act = arrivals(el, { ids: ['a', 'hidden'], onArrive })
    const row = add(el, 'hidden')
    await tickMO()
    expect(row.hasAttribute('data-arrive')).toBe(false)
    const fresh = add(el, 'new')
    act.update({ ids: ['a', 'hidden', 'new'], onArrive })
    await tickMO()
    expect(fresh.hasAttribute('data-arrive')).toBe(true)
    expect(onArrive).toHaveBeenCalledTimes(1)
    act.destroy()
  })
  test('with `ids`, a row that renders just after the update still arrives; a filtered one does not later', async () => {
    const el = list(['a'])
    const act = arrivals(el, { ids: ['a'] })
    act.update({ ids: ['a', 'b', 'c'] })
    const b = add(el, 'b')
    await tickMO(); await tickMO()
    expect(b.hasAttribute('data-arrive')).toBe(true)
    const c = add(el, 'c')
    await tickMO()
    expect(c.hasAttribute('data-arrive')).toBe(false)
    act.destroy()
  })
})

describe('notes', () => {
  const notes = [{ id: '1', kind: 'mention', day: 'Today' }, { id: '2', read: true, kind: 'comment', day: 'Today' }, { id: '3', read: true, kind: 'mention', day: 'Yesterday' }]
  test('filters and counts', () => {
    expect(filterNotes(notes, 'unread').map(n => n.id)).toEqual(['1'])
    expect(filterNotes(notes, 'mentions').map(n => n.id)).toEqual(['1', '3'])
    expect(unreadCount(notes)).toBe(1)
  })
  test('groups by day in order', () => expect(groupByDay(notes).map(g => [g.day, g.rows.length])).toEqual([['Today', 2], ['Yesterday', 1]]))
  test('day labels', () => {
    expect(dayLabel('2026-10-30', '2026-10-30')).toBe('Today')
    expect(dayLabel('2026-10-29', '2026-10-30')).toBe('Yesterday')
    expect(dayLabel('2026-10-01', '2026-10-30')).toBe('Oct 1')
  })
  test('the bell says the count', () => {
    expect(bellLabel(3)).toBe('Notifications, 3 unread')
    expect(bellLabel(0)).toBe('Notifications')
    expect(bellCount(12)).toBe('9+')
  })
})

describe('notifyPolicy', () => {
  const setup = (open = false) => {
    let n = 0
    const o = { open: () => open, show: vi.fn((t: any) => t.id ?? `t${++n}`), dismiss: vi.fn(), announce: vi.fn() }
    return { o, p: notifyPolicy(o) }
  }
  test('inbox open: no toast, one summary after a second of quiet', () => {
    vi.useFakeTimers()
    const { o, p } = setup(true)
    p.push({ title: 'a' }); p.push({ title: 'b' }); p.push({ title: 'c' })
    expect(o.show).not.toHaveBeenCalled()
    expect(o.announce).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(o.announce.mock.calls).toEqual([['3 new notifications']])
    vi.useRealTimers()
  })
  test('inbox open: one arrival reads as itself, an urgent one at once and assertively', () => {
    vi.useFakeTimers()
    const { o, p } = setup(true)
    p.push({ title: 'Raj needs you', urgent: true })
    expect(o.announce).toHaveBeenCalledWith('Raj needs you', true)
    p.push({ title: 'a' })
    vi.advanceTimersByTime(1000)
    expect(o.announce).toHaveBeenLastCalledWith('New notification: a')
    vi.useRealTimers()
  })
  test('closed: one toast per item, a burst collapses into one', () => {
    vi.useFakeTimers()
    const { o, p } = setup()
    p.push({ title: 'a' }); p.push({ title: 'b' })
    expect(o.show).toHaveBeenCalledTimes(2)
    p.push({ title: 'c' })
    expect(o.dismiss.mock.calls.flat()).toEqual(['t1', 't2'])
    expect(o.show.mock.lastCall![0]).toMatchObject({ title: '3 new notifications' })
    p.push({ title: 'd' })
    expect(o.show.mock.lastCall![0]).toMatchObject({ id: 't3', title: '4 new notifications' })
    vi.useRealTimers()
  })
  test('spaced arrivals keep three up at most', () => {
    vi.useFakeTimers()
    const { o, p } = setup()
    for (const t of ['a', 'b', 'c', 'd']) { p.push({ title: t }); vi.advanceTimersByTime(1100) }
    expect(o.show).toHaveBeenCalledTimes(4)
    expect(o.dismiss.mock.calls.flat()).toEqual(['t1'])
    vi.useRealTimers()
  })
})

describe('connection', () => {
  test('native statuses map to four states', () => {
    expect(['open', 'connecting', 'reconnecting', 'closed', 'unauthorized', 'live'].map(liveState)).toEqual(['live', 'connecting', 'reconnecting', 'offline', 'offline', 'live'])
    expect(worstLive(['live', 'reconnecting', 'connecting'])).toBe('reconnecting')
  })
  test('announces per §4.4', () => {
    expect(connectionAnnouncement(undefined, 'connecting')).toBeNull()
    expect(connectionAnnouncement('connecting', 'live')).toBeNull()
    expect(connectionAnnouncement('live', 'reconnecting')!.assertive).toBeUndefined()
    expect(connectionAnnouncement('live', 'offline')!.assertive).toBe(true)
    expect(connectionAnnouncement('offline', 'live', 4)!.text).toBe('Back online. 4 updates.')
    expect(connectionAnnouncement('offline', 'offline')).toBeNull()
  })
})

describe('preferences', () => {
  const ev: PrefEvent[] = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'sec', label: 'S' }, { id: 'no', label: 'N' }]
  const rules = { locked: { sec: ['email'] }, offered: { no: ['push'] } }
  const v = { a: { email: true }, b: { email: false }, sec: { email: true } }
  test('cells', () => expect(['a', 'b', 'sec', 'no'].map(e => prefCell(v, rules, e, 'email'))).toEqual(['on', 'off', 'locked', 'na']))
  test('tri-state ignores locked and not-offered cells', () => {
    expect(triState(v, ev, rules, 'email')).toBe('mixed')
    expect(triState({ a: { email: true }, b: { email: true } }, ev, rules, 'email')).toBe('on')
    expect(triState({}, ev.slice(2), rules, 'email')).toBeNull()
  })
  test('mixed goes to all on; on goes off; locked cells never move', () => {
    expect(toggleChanges(v, ev, rules, 'email')).toEqual([{ event: 'a', channel: 'email', on: true }, { event: 'b', channel: 'email', on: true }])
    const all = applyPrefs(v, toggleChanges(v, ev, rules, 'email'))
    expect(toggleChanges(all, ev, rules, 'email').every(c => !c.on)).toBe(true)
    expect(v.a.email).toBe(true) // not mutated
  })
})

describe('meetings', () => {
  test('tile names', () => {
    expect(tileLabel({ id: 'k', name: 'Kofi Mensah', role: 'host', isSpeaking: true })).toBe('Kofi Mensah, host, speaking')
    expect(tileLabel({ id: 'a', name: 'Ana Ruiz', isMuted: true })).toBe('Ana Ruiz, muted')
  })
  test('columns, hues, hands', () => {
    expect([4, 7, 12].map(galleryCols)).toEqual([2, 3, 4])
    expect(hueOf('ana')).toBe(hueOf('ana'))
    expect(hueOf('kofi')).toBeLessThanOrEqual(8)
    expect(newHands([{ id: 'a', name: 'A' }, { id: 'b', name: 'B', handRaised: true }], [{ id: 'a', name: 'A', handRaised: true }, { id: 'b', name: 'B', handRaised: true }]).map(p => p.id)).toEqual(['a'])
  })
  test('the speaker holds 1.5 s: a blip never takes the stage', () => {
    vi.useFakeTimers()
    let t = 0
    const on = vi.fn()
    const f = speakerFollow(on, { now: () => t })
    f.update('kofi')
    expect(on).toHaveBeenCalledWith('kofi')
    t = 200; f.update('ana')
    vi.advanceTimersByTime(400); t = 600; f.update('kofi') // back before the hold ran out
    vi.advanceTimersByTime(2000)
    expect(on).toHaveBeenCalledTimes(1)
    t = 3000; f.update('mei')
    vi.advanceTimersByTime(0)
    expect(on).toHaveBeenLastCalledWith('mei')
    f.destroy()
    vi.useRealTimers()
  })
  test('pip corners by arrow key', () => {
    expect(pipStep('bottom-right', 'ArrowUp')).toBe('top-right')
    expect(pipStep('top-right', 'ArrowLeft')).toBe('top-left')
    expect(pipStep('top-left', 'ArrowUp')).toBe('top-left')
  })
  test('the meter reads --level and keeps aria-valuenow true', async () => {
    expect(litBars(0.5)).toBe(8)
    const el = document.createElement('div')
    el.innerHTML = '<i></i>'.repeat(16)
    const m = levelMeter(el)
    el.style.setProperty('--level', '0.25')
    await tickMO()
    expect(el.querySelectorAll('[data-on]').length).toBe(4)
    expect(el.getAttribute('aria-valuenow')).toBe('4')
    m.destroy()
  })
  test('countdown', () => {
    expect(countdownParts(252000).map(p => p.value)).toEqual(['04', '12'])
    expect(countdownParts(3723000).map(p => p.unit)).toEqual(['hr', 'min', 'sec'])
    expect(countdownParts(-5).map(p => p.value)).toEqual(['00', '00'])
    expect(countdownLabel(50000)).toBe('Starts in 1 minute')
  })
})

describe('transport', () => {
  const base: TransportConfig = { wire: 'default', bus: 'postgres', preset: 'multi', network: 'good' }
  const run = (c: Partial<TransportConfig> = {}) => {
    let t = 0
    const s = transportSim({ ...base, ...c }, { random: () => 0.5, now: () => t, pace: ms => ms })
    s.start()
    return { s, tick: (ms: number) => { t += ms; vi.advanceTimersByTime(ms) } }
  }
  test('figures', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(3)
    expect(percentile([], 0.5)).toBeNull()
    expect([100, 250, 1000].map(latencyTone)).toEqual([undefined, 'caution', 'critical'])
    expect(formatMs(4.2)).toBe('4.2 ms')
    expect([1, 3, 9].map(backoffCap)).toEqual([1, 4, 30])
    expect(transportError({ wire: 'default', bus: 'memory', preset: 'multi' })!.title).toContain('R002')
    expect(transportError({ wire: 'tabs', bus: 'memory', preset: 'multi' })).toBeNull()
  })
  test('connects, drops, retries and resumes from its cursor', () => {
    vi.useFakeTimers()
    const { s, tick } = run()
    expect(s.lanes().live.state).toBe('connecting')
    tick(1000)
    expect(s.lanes().channel.state).toBe('live')
    s.drop()
    expect(s.lanes().live.state).toBe('reconnecting')
    expect(s.lanes().live.note).toMatch(/^Retry 1 in/)
    tick(3000)
    expect(s.lanes().live.state).toBe('live')
    expect(s.lanes().live.note).toMatch(/^Resumed from 7:/)
    s.destroy(); vi.useRealTimers()
  })
  test('WebSocket blocked: the channel lane is offline, SSE stays live, no fallback', () => {
    vi.useFakeTimers()
    const { s, tick } = run()
    tick(1000)
    s.configure({ network: 'wsblock' })
    expect(s.lanes().channel.state).toBe('offline')
    expect(s.lanes().channel.note).toContain('no fallback in v0')
    expect(s.lanes().stream.state).toBe('live')
    s.destroy(); vi.useRealTimers()
  })
  test('R002 keeps the lanes offline until fixed; durable-object needs Cloudflare', () => {
    vi.useFakeTimers()
    const { s, tick } = run({ bus: 'memory' })
    expect(s.lanes().live.state).toBe('offline')
    s.configure({ bus: 'redis' })
    tick(1000)
    expect(s.lanes().live.state).toBe('live')
    s.configure({ preset: 'cf' }); s.configure({ bus: 'durable-object' }); s.configure({ preset: 'single' })
    expect(s.config.bus).toBe('postgres')
    s.destroy(); vi.useRealTimers()
  })
  test('Fall behind resets the epoch; pings fill samples', () => {
    vi.useFakeTimers()
    const { s, tick } = run()
    tick(1000)
    s.ping()
    expect(s.lanes().live.samples.length).toBe(1)
    s.fallBehind()
    tick(5000)
    expect(s.lanes().live.note).toBe('Too far behind · reset, refetched')
    expect(s.lanes().live.cursor.startsWith('8:')).toBe(true)
    s.destroy(); vi.useRealTimers()
  })
  test('tabs only has nothing to drop', () => {
    vi.useFakeTimers()
    const { s } = run({ wire: 'tabs' })
    expect(s.drop()).toBe(false)
    expect(s.lanes().live.cursor).toBe('n/a')
    s.destroy(); vi.useRealTimers()
  })
})
