// The live pack driven as a user: keyboard paths, states, error paths, focus moves, announcements.
import { fireEvent } from '@testing-library/dom'
import { state } from '@weft-js/core'
import { flush, render } from '@weft-js/core/test'
import { ActivityFeed } from '../src/live/ActivityFeed'
import { Bell } from '../src/live/Bell'
import { ConnectionBanner, ConnectionPill } from '../src/live/Connection'
import type { LiveState } from '../src/parts'
import { Inbox, type Note } from '../src/live/Inbox'
import { ControlBar, MeetingRoom, type Participant } from '../src/live/MeetingRoom'
import { notify } from '../src/live/notify'
import { NotificationPreferences } from '../src/live/NotificationPreferences'
import { Countdown, Lobby, Prejoin, ScheduledLobby } from '../src/live/Prejoin'
import { PushSoftAsk } from '../src/live/PushSoftAsk'
import { TransportPicker } from '../src/live/TransportPicker'
import { toast, Toaster } from '../src/Toast'
import { CHANNELS, GROUPS, LOCKED, NOTES, OFFERED, PEOPLE, PREFS } from './fixtures/pack-live'

beforeAll(() => { (HTMLElement.prototype as { showPopover: (this: HTMLElement) => void }).showPopover ??= function () { this.toggleAttribute('data-shown', true) }; (HTMLElement.prototype as { hidePopover: () => void }).hidePopover ??= function () {} })
const key = (el: Element, k: string, o: object = {}) => fireEvent.keyDown(el, { key: k, ...o })
const press = (c: ParentNode, name: string | RegExp) => {
  const b = [...c.querySelectorAll<HTMLElement>('button')].find(x => { const n = x.getAttribute('aria-label') ?? x.textContent ?? ''; return typeof name === 'string' ? n.trim() === name : name.test(n) })
  if (!b) throw new Error(`no button ${name}`)
  b.click()
  return b
}
const said = async (assertive = false) => {
  await new Promise(r => { setTimeout(r, 70) })
  return document.querySelector(`[data-scope="announcer"][aria-live="${assertive ? 'assertive' : 'polite'}"]`)!.textContent
}
const mount = (fn: () => unknown) => render(fn)
beforeEach(() => { render(() => <Toaster />) })
const tick = () => new Promise(r => { setTimeout(r, 0) })

function inbox(extra: Record<string, unknown> = {}) {
  const items = state<Note[]>(NOTES)
  const r = mount(() => <Inbox items={items} open={false} onRead={id => (items.value = items.value.map(n => (n.id === id ? { ...n, read: true } : n)))} onReadAll={() => (items.value = items.value.map(n => ({ ...n, read: true })))} onDismiss={id => (items.value = items.value.filter(n => n.id !== id))} onRestore={n => (items.value = [n, ...items.value])} {...extra} />)
  return { items, c: r.container, rows: () => [...r.container.querySelectorAll<HTMLElement>('[data-scope="notification"]')] }
}

describe('Inbox', () => {
  test('a role=feed of articles, grouped by day, with the tab and panel wired', () => {
    const { c, rows } = inbox()
    const f = c.querySelector('[role="feed"]')!
    expect(rows().length).toBe(5)
    expect(rows()[0]!.tagName).toBe('ARTICLE')
    expect(rows()[0]!.getAttribute('aria-label')).toBe('Mei Tanaka mentioned you in Overlap layout, unread, 9 min')
    expect([...f.querySelectorAll('[data-part="group"]')].map(g => g.textContent)).toEqual(['Today', 'Yesterday'])
    expect(c.querySelector('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe(c.querySelector('[role="tab"][aria-selected="true"]')!.id)
    expect(rows().filter(r => r.tabIndex === 0).length).toBe(1)
  })
  test('tabs filter one panel by keyboard; the unread count follows', async () => {
    const { c, rows } = inbox()
    const list = c.querySelector('[role="tablist"]')!
    key(list, 'ArrowRight'); await flush()
    expect(document.activeElement!.textContent).toContain('Unread')
    expect(rows().length).toBe(2)
    expect(c.querySelector('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe(document.activeElement!.id)
    key(list, 'End'); await flush()
    expect(rows().length).toBe(1)
  })
  test('PageDown and PageUp move between articles; a read patches the same node', async () => {
    const { rows } = inbox()
    await tick()
    const first = rows()[0]!
    first.focus()
    key(first, 'PageDown')
    expect(document.activeElement).toBe(rows()[1])
    key(rows()[1]!, 'PageUp')
    expect(document.activeElement).toBe(first)
    key(first, 'Enter'); await flush()
    expect(rows()[0]).toBe(first)
    expect(first.hasAttribute('data-read')).toBe(true)
    expect(first.getAttribute('aria-label')).not.toContain('unread')
  })
  test('mark all as read patches, announces', async () => {
    const { c, rows } = inbox()
    const nodes = rows()
    press(c, 'Mark all as read'); await flush()
    rows().forEach((r, i) => expect(r).toBe(nodes[i]))
    expect(rows().every(r => r.hasAttribute('data-read'))).toBe(true)
    expect(await said()).toBe('All notifications marked as read')
  })
  test('dismiss slides out, moves focus, offers Undo in a toast, Undo restores', async () => {
    const { c, rows, items } = inbox()
    const first = rows()[0]!
    first.focus()
    key(first, 'Delete'); await flush()
    expect(first.getAttribute('data-state')).toBe('dismissed')
    expect(document.activeElement).toBe(rows()[1])
    await new Promise(r => { setTimeout(r, 260) }); await flush()
    expect(items.value.length).toBe(4)
    expect(await said()).toContain('Notification dismissed')
    press(document.body, 'Undo'); await flush()
    expect(items.value.length).toBe(5)
    expect(c.querySelector('[data-id="n1"]')).not.toBeNull()
    document.querySelectorAll('[data-scope="toast"][data-part="root"]').forEach(t => toast.dismiss((t as HTMLElement).dataset.id!))
  })
  test('a new row arrives; scrolled, it counts in the "n new" pill, which goes back up', async () => {
    const { c, items } = inbox()
    await tick(); await tick()
    expect(c.querySelector('[data-arrive]')).toBeNull()
    const feed = c.querySelector<HTMLElement>('[role="feed"]')!
    feed.scrollTop = 50
    items.value = [{ ...NOTES[0]!, id: 'n9' }, ...items.value]; await flush(); await tick(); await flush()
    expect(c.querySelector('[data-id="n9"]')!.hasAttribute('data-arrive')).toBe(true)
    const pill = c.querySelector<HTMLElement>('[data-part="new-pill"]')!
    expect(pill.textContent).toBe('1 new')
    pill.click(); await flush()
    expect(c.querySelector('[data-part="new-pill"]')).toBeNull()
    expect(feed.scrollTop).toBe(0)
  })
  test('actions call back and leave the row alone; empty and loading states', () => {
    const onAction = vi.fn()
    const { c } = inbox({ onAction })
    press(c, 'Approve')
    expect(onAction.mock.calls[0]![1]).toBe('approve')
    const empty = mount(() => <Inbox items={[]} />)
    expect(empty.container.querySelector('[data-scope="empty-state"]')!.textContent).toContain('caught up')
    const load = mount(() => <Inbox items={undefined} />)
    expect(load.container.querySelector('[role="feed"]')!.getAttribute('aria-busy')).toBe('true')
    expect(load.container.querySelector('[data-scope="empty-state"]')).toBeNull()
  })
  test('2 s visible in an open inbox reads a row', async () => {
    const seen: IntersectionObserverCallback[] = []
    const was = (window as unknown as Record<string, unknown>).IntersectionObserver
    ;(window as unknown as Record<string, unknown>).IntersectionObserver = class { constructor(cb: IntersectionObserverCallback) { seen.push(cb) } observe() {} disconnect() {} unobserve() {} }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const onRead = vi.fn()
    const { container: c } = mount(() => <Inbox items={NOTES} open onRead={onRead} />)
    await Promise.resolve()
    const row = c.querySelector('[data-id="n1"]')!
    seen.forEach(cb => cb([{ target: row, isIntersecting: true } as unknown as IntersectionObserverEntry], null as unknown as IntersectionObserver))
    vi.advanceTimersByTime(1999)
    expect(onRead).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onRead).toHaveBeenCalledWith('n1')
    vi.useRealTimers()
    ;(window as unknown as Record<string, unknown>).IntersectionObserver = was
  })
})

describe('Bell', () => {
  test('names the count, hides at zero, bumps when it rises', async () => {
    const n = state(0)
    const { container: c } = render(() => <Bell count={n} />)
    const b = c.querySelector('button')!
    const badge = c.querySelector<HTMLElement>('[data-scope="badge"]')!
    expect(b.getAttribute('aria-label')).toBe('Notifications')
    expect(badge.hidden).toBe(true)
    await tick()
    n.value = 12; await flush()
    expect(b.getAttribute('aria-label')).toBe('Notifications, 12 unread')
    expect(badge.textContent).toBe('9+')
    expect(badge.hasAttribute('data-bump')).toBe(true)
  })
  test('opens its panel; a getter counts', async () => {
    const onOpen = vi.fn()
    const { container: c } = render(() => <Bell count={() => 2} onOpen={onOpen} inbox={open => <p data-open={open.value ? '1' : '0'}>panel</p>} />)
    await tick()
    const b = c.querySelector('button')!
    b.click(); await flush()
    expect(b.getAttribute('aria-expanded')).toBe('true')
    expect(c.querySelector('p')!.dataset.open).toBe('1')
    expect(onOpen).toHaveBeenCalled()
  })
  test('on a phone it routes instead', async () => {
    const was = Object.getOwnPropertyDescriptor(window, 'matchMedia')
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) })
    const route = vi.fn()
    const { container: c } = render(() => <Bell count={1} route={route} inbox={() => <p>panel</p>} />)
    c.querySelector('button')!.click(); await flush()
    expect(route).toHaveBeenCalled()
    expect(c.querySelector('button')!.getAttribute('aria-expanded')).toBe('false')
    if (was) Object.defineProperty(window, 'matchMedia', was); else delete (window as unknown as Record<string, unknown>).matchMedia
  })
})

test('notify: inbox closed toasts through the Toaster, open does not', async () => {
  const open = state(false)
  mount(() => <p>x</p>)
  const n = notify({ open: () => open.value })
  n.push({ title: 'Mei mentioned you' }); await flush()
  expect([...document.querySelectorAll('[data-scope="toast"][data-part="title"], [data-part="title"]')].some(t => t.textContent === 'Mei mentioned you')).toBe(true)
  n.flush()
  open.value = true
  n.push({ title: 'Quiet' }); await flush()
  expect([...document.querySelectorAll('[data-part="title"]')].some(t => t.textContent === 'Quiet')).toBe(false)
  n.flush()
  expect(await said()).toBe('New notification: Quiet')
})

test('ActivityFeed: rows, per-day groups, a Live check only while live', async () => {
  const live = state<LiveState>('live')
  const { container: c } = render(() => <ActivityFeed items={[{ id: 'a', actor: 'Ana', verb: 'moved', object: 'Crit', time: '10:31', day: 'Today' }, { id: 'b', actor: 'Mei', verb: 'closed', time: '09:00', day: 'Yesterday' }]} live={live} />)
  expect(c.querySelectorAll('[data-scope="activity"] > li').length).toBe(2)
  expect([...c.querySelectorAll('[data-part="eyebrow"]')].map(e => e.textContent)).toEqual(['Today', 'Yesterday'])
  expect(c.querySelector('[data-scope="sync"]')!.textContent).toContain('Live')
  live.value = 'offline'; await flush()
  expect(c.querySelector('[data-scope="sync"]')).toBeNull()
})

test('PushSoftAsk: Turn on runs the prompt, Not now leaves quietly', async () => {
  const yes = vi.fn()
  const a = mount(() => <PushSoftAsk onAccept={yes} />)
  press(a.container, 'Turn on'); await flush()
  expect(yes).toHaveBeenCalled()
  expect(a.container.querySelector('[data-scope="push-ask"]')).toBeNull()
  const b = mount(() => <PushSoftAsk onAccept={yes} />)
  press(b.container, 'Not now'); await flush()
  expect(await said()).toContain("won't ask again")
})

describe('connection', () => {
  test('the pill maps native statuses and announces each change once', async () => {
    const s = state('open')
    const { container: c } = mount(() => <ConnectionPill state={s} queued={4} />)
    expect(c.querySelector('[data-scope="live-status"]')!.getAttribute('data-state')).toBe('live')
    await tick()
    s.value = 'closed'; await flush()
    expect(c.querySelector('[data-scope="live-status"]')!.textContent).toBe('Offline')
    expect(await said(true)).toContain("You're offline")
    s.value = 'open'; await flush()
    expect(await said()).toBe('Back online. 4 updates.')
  })
  test('the banner: reconnecting after the delay, offline at once, Retry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const s = state('live')
    const retry = vi.fn()
    const { container: c } = render(() => <ConnectionBanner state={s} onRetry={retry} />)
    s.value = 'reconnecting'; await flush()
    expect(c.querySelector('[data-scope="banner"]')).toBeNull()
    vi.advanceTimersByTime(3000); await flush()
    expect(c.querySelector('[data-scope="banner"]')!.getAttribute('data-tone')).toBe('caution')
    s.value = 'offline'; await flush()
    expect(c.querySelector('[data-scope="banner"]')!.getAttribute('data-tone')).toBe('critical')
    press(c, 'Retry now')
    expect(retry).toHaveBeenCalled()
    s.value = 'live'; await flush()
    expect(c.querySelector('[data-scope="banner"]')).toBeNull()
    vi.useRealTimers()
  })
})

describe('NotificationPreferences', () => {
  const setup = (onChange: Parameters<typeof NotificationPreferences>[0]['onChange'] = () => {}, extra: Record<string, unknown> = {}) => {
    const r = mount(() => <NotificationPreferences groups={GROUPS} channels={CHANNELS} value={PREFS} offered={OFFERED} locked={LOCKED} onChange={onChange} defaults={{ value: PREFS }} {...extra} />)
    const c = r.container
    const named = (n: string) => [...c.querySelectorAll<HTMLInputElement>('input')].find(i => i.closest('label')!.querySelector('[data-part="sr-only"]')?.textContent === n)!
    return { c, named, grid: c.querySelector<HTMLElement>('[role="grid"]')! }
  }
  test('one tab stop; arrows, Home, End, Ctrl+Home/End', async () => {
    const { c, grid, named } = setup()
    await tick()
    expect(grid.querySelectorAll('[tabindex="0"]').length).toBe(1)
    const first = named('In-app, all events')
    first.focus()
    key(first, 'ArrowRight')
    expect(document.activeElement).toBe(named('Email, all events'))
    key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(named('Collaboration, all email'))
    key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(named('Mentions, email'))
    key(document.activeElement!, 'End')
    expect(document.activeElement).toBe(named('Mentions, SMS'))
    key(document.activeElement!, 'ArrowDown')
    expect((document.activeElement as HTMLElement).dataset.part).toBe('na')
    expect(document.activeElement!.textContent).toContain('Replies, SMS, not offered')
    key(document.activeElement!, 'Home')
    expect(document.activeElement).toBe(named('Replies, in-app'))
    key(document.activeElement!, 'End', { ctrlKey: true })
    expect(document.activeElement!.textContent).toContain('Billing, SMS, not offered')
    key(document.activeElement!, 'Home', { ctrlKey: true })
    expect(document.activeElement).toBe(first)
    expect(grid.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(c.querySelector('[data-part="status"]')!.textContent).toBe('All changes saved')
  })
  test('tri-state parents follow their cells, and a mixed parent goes all on', async () => {
    const onChange = vi.fn()
    const { named } = setup(onChange)
    await tick()
    const parent = named('Collaboration, all email')
    expect(parent.indeterminate).toBe(true)
    parent.focus()
    parent.click(); await flush()
    expect(document.activeElement).toBe(parent)
    expect(onChange.mock.calls[0]![0]).toEqual(['mention', 'reply', 'assign'].map(event => ({ event, channel: 'email', on: true })))
    await flush(); await tick()
    expect(parent.indeterminate).toBe(false)
    expect(parent.checked).toBe(true)
    expect(named('Replies, email').checked).toBe(true)
    expect(await said()).toBe('Email on for 3 events in Collaboration. Saved.')
  })
  test('a locked cell stays on and says why; not offered says so', async () => {
    const onChange = vi.fn()
    const { c, named } = setup(onChange)
    const lock = named('Security alerts, email')
    expect(lock.getAttribute('aria-disabled')).toBe('true')
    expect(c.querySelector(`#${lock.getAttribute('aria-describedby')}`)!.textContent).toContain('Required')
    lock.click(); await flush()
    expect(lock.checked).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(await said()).toContain('Required')
    const na = c.querySelector<HTMLElement>('[data-part="na"]')!
    key(na, ' ')
    expect(await said()).toBe('Not offered for this event')
  })
  test('a rejected save flips the cell back and says why, assertively', async () => {
    const { c, named } = setup(() => new Promise((_, no) => { setTimeout(() => no(new Error('no')), 5) }))
    const box = named('Mentions, SMS')
    box.click(); await flush()
    expect(c.querySelector('[data-part="status"]')!.textContent).toBe('Saving…')
    await new Promise(r => { setTimeout(r, 10) }); await flush()
    expect(named('Mentions, SMS').checked).toBe(false)
    expect(c.querySelector('[data-part="status"]')!.textContent).toContain("Couldn't save")
    expect(await said(true)).toContain("Couldn't save: Mentions, SMS on")
  })
  test('digest: disabled with a reason when email is all off; the badge shows on a digest; Reset', async () => {
    const onDigest = vi.fn()
    const { c } = setup(undefined, { onDigest })
    const sel = c.querySelector('select')!
    const badge = c.querySelector<HTMLElement>('[data-scope="badge"]')!
    expect(badge.hidden).toBe(true)
    sel.value = 'daily'; fireEvent.change(sel); await flush(); await tick(); await flush()
    expect(onDigest).toHaveBeenCalledWith('daily')
    expect(badge.hidden).toBe(false)
    press(c, 'Reset to defaults'); await flush(); await tick(); await flush()
    expect(onDigest).toHaveBeenLastCalledWith('instant')
    const off = mount(() => <NotificationPreferences groups={GROUPS} channels={CHANNELS} value={{}} offered={OFFERED} locked={LOCKED} />).container
    expect(off.querySelector('select')!.disabled).toBe(true)
    expect(off.textContent).toContain('Turn on an email event to choose a digest')
  })
})

describe('TransportPicker', () => {
  test('starts connecting, validates the bus, disables it for tabs', async () => {
    const seen = vi.fn()
    const { container: c } = mount(() => <TransportPicker onConfigChange={seen} />)
    await flush()
    expect(c.querySelectorAll('[data-part="lane"]').length).toBe(3)
    const radio = (v: string) => c.querySelector<HTMLInputElement>(`input[value="${v}"]`)!
    expect(radio('durable-object').disabled).toBe(true)
    radio('memory').click(); await flush()
    expect(c.querySelector('[data-part="build-error"]')!.textContent).toContain('R002')
    expect(c.querySelector('[data-part="lane"]')!.getAttribute('data-state')).toBe('offline')
    expect(seen.mock.lastCall![0].bus).toBe('memory')
    radio('tabs').click(); await flush()
    expect(c.querySelectorAll('fieldset')[1]!.disabled).toBe(true)
    expect(c.textContent).toContain('No server: tabs only stays in this browser.')
    expect(c.querySelector('[data-part="build-error"]')).toBeNull()
    press(c, 'Reset'); await flush()
    expect(radio('default').checked).toBe(true)
    expect(radio('postgres').checked).toBe(true)
  })
  test('a real status wins over the sandbox', async () => {
    const { container: c } = mount(() => <TransportPicker lanes={{ channel: 'unauthorized' }} />)
    await flush()
    expect(c.querySelectorAll('[data-part="lane"]')[2]!.getAttribute('data-state')).toBe('offline')
  })
  test('the log is a quiet role=log', async () => {
    const { container: c } = mount(() => <TransportPicker />)
    await flush()
    const log = c.querySelector('[role="log"]')!
    expect(log.getAttribute('aria-live')).toBe('off')
    press(c, 'Ping'); await flush()
    expect(log.textContent).toContain('ping skipped')
  })
})

describe('meetings', () => {
  const me: Participant = { id: 'you', name: 'Jo Diaz' }
  const room = (extra: Record<string, unknown> = {}) => mount(() => <MeetingRoom title="Crit" participants={PEOPLE} self={me} {...extra} />).container
  const stage = (c: Element) => c.querySelector('[data-part="stage"]')!

  test('a dark island; tiles are a list with real names, flags in words', () => {
    const c = room()
    expect(c.querySelector('[data-scope="room"]')!.getAttribute('data-theme')).toBe('dark')
    const tiles = [...c.querySelectorAll('[role="list"] [data-scope="tile"]')]
    expect(tiles.length).toBe(PEOPLE.length)
    expect(tiles[0]!.getAttribute('role')).toBe('listitem')
    expect(tiles[0]!.getAttribute('aria-label')).toBe('Kofi Mensah, host, speaking')
    expect(tiles[0]!.hasAttribute('data-speaking')).toBe(true)
    expect(tiles[1]!.getAttribute('aria-label')).toBe('Ana Ruiz, muted')
    expect(tiles[4]!.getAttribute('data-network')).toBe('poor')
  })
  test('four layouts through a radio group', async () => {
    const seen = vi.fn()
    const c = room({ onLayoutChange: seen, share: () => <i data-share="" />, board: () => <i data-board="" /> })
    const group = c.querySelector('[role="radiogroup"]')!
    expect(group.getAttribute('aria-label')).toBe('Layout')
    const pick = async (v: string) => { group.querySelector<HTMLInputElement>(`input[value="${v}"]`)!.click(); await flush() }
    await pick('speaker')
    expect(stage(c).getAttribute('data-layout')).toBe('speaker')
    expect(c.querySelectorAll('[data-part="strip"] [data-scope="tile"]').length).toBe(PEOPLE.length - 1)
    await pick('presentation')
    expect(c.querySelector('[data-share]')).not.toBeNull()
    expect(c.querySelector('[data-part="rail"]')).not.toBeNull()
    await pick('board')
    expect(c.querySelector('[data-board]')).not.toBeNull()
    expect(seen).toHaveBeenLastCalledWith('board')
  })
  test('the ring sweeps out when a speaker stops', async () => {
    const p = state<Participant[]>(PEOPLE)
    const c = room({ participants: p })
    await tick()
    const tile = c.querySelector('[data-pid="kofi"]')!
    p.value = p.value.map(x => (x.id === 'kofi' ? { ...x, isSpeaking: false } : x)); await flush()
    expect(c.querySelector('[data-pid="kofi"]')).toBe(tile)
    expect(tile.hasAttribute('data-speaking')).toBe(false)
    expect(tile.hasAttribute('data-speaking-out')).toBe(true)
  })
  test('a raised hand is announced, a new speaker is not', async () => {
    const p = state<Participant[]>(PEOPLE)
    room({ participants: p })
    await tick()
    p.value = p.value.map(x => (x.id === 'mei' ? { ...x, handRaised: true } : x)); await flush()
    expect(await said()).toBe('Mei Tanaka raised a hand')
  })
  test('speaker layout follows after the hold', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const p = state<Participant[]>(PEOPLE)
    const c = room({ participants: p, layout: 'speaker' })
    await Promise.resolve(); await flush()
    const main = () => c.querySelector('[data-part="stage"] > [data-scope="tile"]')!.getAttribute('data-pid')
    expect(main()).toBe('kofi')
    p.value = p.value.map(x => ({ ...x, isSpeaking: x.id === 'mei' })); await flush()
    expect(main()).toBe('kofi')
    vi.advanceTimersByTime(1500); await flush()
    expect(main()).toBe('mei')
    vi.useRealTimers()
  })
  test('the control bar is an APG toolbar: one tab stop, arrows, wraps, Leave is in it', async () => {
    const { container: c } = mount(() => <ControlBar mic camera onToggle={() => {}} />)
    await tick()
    const bar = c.querySelector('[role="toolbar"]')!
    const items = [...bar.querySelectorAll<HTMLElement>('button')]
    expect(items.filter(b => b.tabIndex === 0).length).toBe(1)
    items[0]!.focus()
    key(items[0]!, 'ArrowRight')
    expect(document.activeElement).toBe(items[1])
    expect(items[1]!.tabIndex).toBe(0)
    expect(items[0]!.tabIndex).toBe(-1)
    key(items[1]!, 'End')
    expect(document.activeElement!.getAttribute('aria-label')).toBe('Leave meeting')
    key(document.activeElement!, 'ArrowRight')
    expect(document.activeElement).toBe(items[0])
  })
  test('toggles press, label, call back and announce', async () => {
    const onMic = vi.fn()
    const onLeave = vi.fn()
    const c = room({ onMic, onLeave })
    const mic = c.querySelector<HTMLElement>('[data-kind="device"]')!
    expect(mic.getAttribute('aria-pressed')).toBe('true')
    mic.click(); await flush()
    expect(mic.getAttribute('aria-pressed')).toBe('false')
    expect(mic.textContent).toBe('Unmute')
    expect(onMic).toHaveBeenCalledWith(false)
    expect(await said()).toBe('Microphone off')
    expect(c.querySelector('[data-scope="pip"] [data-scope="tile"]')!.getAttribute('aria-label')).toContain('muted')
    press(c, 'Leave meeting')
    expect(onLeave).toHaveBeenCalled()
  })
  test('sharing forces presentation with Stop sharing; the sidebar opens and closes', async () => {
    const c = room()
    press(c, 'Share screen'); await flush()
    expect(stage(c).getAttribute('data-layout')).toBe('presentation')
    expect(c.textContent).toContain('You are presenting')
    press(c, 'Stop sharing'); await flush()
    expect(stage(c).getAttribute('data-layout')).toBe('gallery')
    const side = c.querySelector<HTMLElement>('[data-part="sidebar"]')!
    expect(side.hidden).toBe(true)
    press(c, 'People'); await flush()
    expect(side.hidden).toBe(false)
    expect(side.querySelectorAll('[data-part="people"] li').length).toBe(PEOPLE.length + 1)
    press(c, 'Close panel'); await flush()
    expect(side.hidden).toBe(true)
  })
  test('compact: speaker, no switcher, Leave icon-only, More opens the panel', async () => {
    const c = room({ compact: true })
    expect(stage(c).getAttribute('data-layout')).toBe('speaker')
    expect(c.querySelector('[role="radiogroup"]')).toBeNull()
    expect(c.querySelector('[data-part="leave"]')!.hasAttribute('data-icon-only')).toBe(true)
    press(c, 'More options'); await flush()
    expect(c.querySelector<HTMLElement>('[data-part="sidebar"]')!.hidden).toBe(false)
  })
  test('media is a slot; a camera-off tile shows its avatar; the pip moves by keys and says where', async () => {
    const c = room({ video: () => <video /> })
    expect(c.querySelector('[data-pid="kofi"] video')).not.toBeNull()
    expect(c.querySelector('[data-pid="raj"] video')).toBeNull()
    await tick()
    const pipEl = c.querySelector<HTMLElement>('[data-scope="pip"]')!
    key(pipEl, 'ArrowLeft')
    expect(await said()).toBe('Self view moved to bottom left')
    key(pipEl, 'ArrowUp')
    expect(await said()).toBe('Self view moved to top left')
  })
  test('Prejoin: meter from --level, device picks, joining state', async () => {
    const onJoin = vi.fn()
    const onDevice = vi.fn()
    const { container: c } = mount(() => <Prejoin name="Jo" level={0.5} onJoin={onJoin} onDevice={onDevice} devices={{ mics: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }} />)
    await tick()
    const m = c.querySelector<HTMLElement>('[data-part="meter"]')!
    expect(m.querySelectorAll('i').length).toBe(16)
    expect(m.querySelectorAll('[data-on]').length).toBe(8)
    m.style.setProperty('--level', '1'); await tick()
    expect(m.getAttribute('aria-valuenow')).toBe('16')
    const sel = c.querySelector('select')!
    sel.value = 'b'; fireEvent.change(sel)
    expect(onDevice).toHaveBeenCalledWith('mic', 'b')
    press(c, 'Join now')
    expect(onJoin).toHaveBeenCalledWith('Jo')
    expect(mount(() => <Prejoin joining />).container.querySelector('[data-loading]')).not.toBeNull()
  })
  test('Lobby is a status; Countdown is a quiet timer that speaks once at a minute', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date', 'setTimeout', 'clearTimeout'] })
    const cancel = vi.fn()
    const lob = mount(() => <Lobby onCancel={cancel} />).container
    expect(lob.querySelector('[role="status"]')!.textContent).toBe('Asking to join…')
    press(lob, 'Cancel request')
    expect(cancel).toHaveBeenCalled()
    const t0 = Date.now()
    const done = vi.fn()
    const { container: c } = mount(() => <Countdown to={t0 + 62000} now={t0} onDone={done} />)
    const timer = c.querySelector('[role="timer"]')!
    expect(timer.getAttribute('aria-live')).toBe('off')
    expect(timer.textContent).toContain('01')
    await Promise.resolve()
    vi.advanceTimersByTime(3000); await flush()
    vi.advanceTimersByTime(70)
    expect(document.querySelector('[data-scope="announcer"][aria-live="polite"]')!.textContent).toBe('Starts in 1 minute')
    vi.advanceTimersByTime(60000); await flush()
    expect(done).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
  test('ScheduledLobby: Join stays disabled until the countdown ends', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const t0 = Date.now()
    const { container: c } = mount(() => <ScheduledLobby title="Q4" to={t0 + 2000} now={t0} opensAt="10:50" />)
    const join = [...c.querySelectorAll('button')].find(b => b.textContent === 'Join')!
    expect(join.disabled).toBe(true)
    await Promise.resolve()
    vi.advanceTimersByTime(3000); await flush()
    expect(join.disabled).toBe(false)
    vi.useRealTimers()
  })
})
