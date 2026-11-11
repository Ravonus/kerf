// The live pack driven as a user: keyboard paths, states, error paths, focus moves, announcements.
import { sleep as tick } from '../../../scripts/lib/sleep.mjs'
import { fireEvent } from '@testing-library/dom'
import { state } from '@kerf/core'
import { flush, render } from '@kerf/core/test'
import { ActivityFeed } from '../src/live/ActivityFeed'
import { Bell } from '../src/live/Bell'
import { ConnectionBanner, ConnectionPill } from '../src/live/Connection'
import type { LiveState } from '../src/parts'
import { Inbox, type Note } from '../src/live/Inbox'
import { MeetingRoom, type Participant } from '../src/live/MeetingRoom'
import { notify } from '../src/live/notify'
import { NotificationPreferences } from '../src/live/NotificationPreferences'
import { PushSoftAsk } from '../src/live/PushSoftAsk'
import { TransportPicker } from '../src/live/TransportPicker'
import { toast, Toaster } from '../src/Toast'
import { CHANNELS, GROUPS, LOCKED, NOTES, OFFERED, PEOPLE, PREFS } from './fixtures/pack-live'

import {
  meetingADarkIslandTilesAre,
  meetingFourLayoutsThroughARadio,
  meetingTheRingSweepsOutWhen,
  meetingARaisedHandIsAnnounced,
  meetingSpeakerLayoutFollowsAfterThe,
  meetingTheControlBarIsAn,
  meetingTogglesPressLabelCallBack,
  meetingSharingForcesPresentationWithStop,
  meetingCompactSpeakerNoSwitcherLeave,
  meetingMediaIsASlotA,
  meetingPrejoinMeterFromLevelDevice,
  meetingLobbyIsAStatusCountdown,
  meetingScheduledLobbyJoinStaysDisabledUntil,
} from './live.test/meetings'

beforeAll(() => {
  ;(HTMLElement.prototype as { showPopover: (this: HTMLElement) => void }).showPopover ??=
    function () {
      this.toggleAttribute('data-shown', true)
    }
  ;(HTMLElement.prototype as { hidePopover: () => void }).hidePopover ??= function () {}
})
const key = (el: Element, k: string, o: object = {}) => fireEvent.keyDown(el, { key: k, ...o })
const press = (c: ParentNode, name: string | RegExp) => {
  const b = [...c.querySelectorAll<HTMLElement>('button')].find((x) => {
    const n = x.getAttribute('aria-label') ?? x.textContent ?? ''
    return typeof name === 'string' ? n.trim() === name : name.test(n)
  })
  if (!b) throw new Error(`no button ${name}`)
  b.click()
  return b
}
const said = async (assertive = false) => {
  await new Promise((r) => {
    setTimeout(r, 70)
  })
  return document.querySelector(
    `[data-scope="announcer"][aria-live="${assertive ? 'assertive' : 'polite'}"]`,
  )!.textContent
}
const mount = (fn: () => unknown) => render(fn)
beforeEach(() => {
  render(() => <Toaster />)
})

function inbox(extra: Record<string, unknown> = {}) {
  const items = state<Note[]>(NOTES)
  const r = mount(() => (
    <Inbox
      items={items}
      open={false}
      onRead={(id) =>
        (items.value = items.value.map((n) => (n.id === id ? { ...n, read: true } : n)))
      }
      onReadAll={() => (items.value = items.value.map((n) => ({ ...n, read: true })))}
      onDismiss={(id) => (items.value = items.value.filter((n) => n.id !== id))}
      onRestore={(n) => (items.value = [n, ...items.value])}
      {...extra}
    />
  ))
  return {
    items,
    c: r.container,
    rows: () => [...r.container.querySelectorAll<HTMLElement>('[data-scope="notification"]')],
  }
}

const inboxSVisibleInAnOpen = async () => {
  const seen: IntersectionObserverCallback[] = []
  const was = (window as unknown as Record<string, unknown>).IntersectionObserver
  ;(window as unknown as Record<string, unknown>).IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) {
      seen.push(cb)
    }
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const onRead = vi.fn()
  const { container: c } = mount(() => <Inbox items={NOTES} open onRead={onRead} />)
  await Promise.resolve()
  const row = c.querySelector('[data-id="n1"]')!
  seen.forEach((cb) =>
    cb(
      [{ target: row, isIntersecting: true } as unknown as IntersectionObserverEntry],
      null as unknown as IntersectionObserver,
    ),
  )
  vi.advanceTimersByTime(1999)
  expect(onRead).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(onRead).toHaveBeenCalledWith('n1')
  vi.useRealTimers()
  ;(window as unknown as Record<string, unknown>).IntersectionObserver = was
}

const inboxActionsCallBackAndLeave = () => {
  const onAction = vi.fn()
  const { c } = inbox({ onAction })
  press(c, 'Approve')
  expect(onAction.mock.calls[0]![1]).toBe('approve')
  const empty = mount(() => <Inbox items={[]} />)
  expect(empty.container.querySelector('[data-scope="empty-state"]')!.textContent).toContain(
    'caught up',
  )
  const load = mount(() => <Inbox items={undefined} />)
  expect(load.container.querySelector('[role="feed"]')!.getAttribute('aria-busy')).toBe('true')
  expect(load.container.querySelector('[data-scope="empty-state"]')).toBeNull()
}

const inboxANewRowArrivesScrolled = async () => {
  const { c, items } = inbox()
  await tick()
  await tick()
  expect(c.querySelector('[data-arrive]')).toBeNull()
  const feed = c.querySelector<HTMLElement>('[role="feed"]')!
  feed.scrollTop = 50
  items.value = [{ ...NOTES[0]!, id: 'n9' }, ...items.value]
  await flush()
  await tick()
  await flush()
  expect(c.querySelector('[data-id="n9"]')!.hasAttribute('data-arrive')).toBe(true)
  const pill = c.querySelector<HTMLElement>('[data-part="new-pill"]')!
  expect(pill.textContent).toBe('1 new')
  pill.click()
  await flush()
  expect(c.querySelector('[data-part="new-pill"]')).toBeNull()
  expect(feed.scrollTop).toBe(0)
}

const inboxDismissSlidesOutMovesFocus = async () => {
  const { c, rows, items } = inbox()
  const first = rows()[0]!
  first.focus()
  key(first, 'Delete')
  await flush()
  expect(first.getAttribute('data-state')).toBe('dismissed')
  expect(document.activeElement).toBe(rows()[1])
  await new Promise((r) => {
    setTimeout(r, 260)
  })
  await flush()
  expect(items.value.length).toBe(4)
  expect(await said()).toContain('Notification dismissed')
  press(document.body, 'Undo')
  await flush()
  expect(items.value.length).toBe(5)
  expect(c.querySelector('[data-id="n1"]')).not.toBeNull()
  document
    .querySelectorAll('[data-scope="toast"][data-part="root"]')
    .forEach((t) => toast.dismiss((t as HTMLElement).dataset.id!))
}

const inboxMarkAllAsReadPatches = async () => {
  const { c, rows } = inbox()
  const nodes = rows()
  press(c, 'Mark all as read')
  await flush()
  rows().forEach((r, i) => expect(r).toBe(nodes[i]))
  expect(rows().every((r) => r.hasAttribute('data-read'))).toBe(true)
  expect(await said()).toBe('All notifications marked as read')
}

const inboxPageDownAndPageUpMoveBetween = async () => {
  const { rows } = inbox()
  await tick()
  const first = rows()[0]!
  first.focus()
  key(first, 'PageDown')
  expect(document.activeElement).toBe(rows()[1])
  key(rows()[1]!, 'PageUp')
  expect(document.activeElement).toBe(first)
  key(first, 'Enter')
  await flush()
  expect(rows()[0]).toBe(first)
  expect(first.hasAttribute('data-read')).toBe(true)
  expect(first.getAttribute('aria-label')).not.toContain('unread')
}

const inboxTabsFilterOnePanelBy = async () => {
  const { c, rows } = inbox()
  const list = c.querySelector('[role="tablist"]')!
  key(list, 'ArrowRight')
  await flush()
  expect(document.activeElement!.textContent).toContain('Unread')
  expect(rows().length).toBe(2)
  expect(c.querySelector('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe(
    document.activeElement!.id,
  )
  key(list, 'End')
  await flush()
  expect(rows().length).toBe(1)
}

const inboxARoleFeedOfArticles = () => {
  const { c, rows } = inbox()
  const f = c.querySelector('[role="feed"]')!
  expect(rows().length).toBe(5)
  expect(rows()[0]!.tagName).toBe('ARTICLE')
  expect(rows()[0]!.getAttribute('aria-label')).toBe(
    'Mei Tanaka mentioned you in Overlap layout, unread, 9 min',
  )
  expect([...f.querySelectorAll('[data-part="group"]')].map((g) => g.textContent)).toEqual([
    'Today',
    'Yesterday',
  ])
  expect(c.querySelector('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe(
    c.querySelector('[role="tab"][aria-selected="true"]')!.id,
  )
  expect(rows().filter((r) => r.tabIndex === 0).length).toBe(1)
}

describe('Inbox', () => {
  test(
    'a role=feed of articles, grouped by day, with the tab and panel wired',
    inboxARoleFeedOfArticles,
  )
  test('tabs filter one panel by keyboard; the unread count follows', inboxTabsFilterOnePanelBy)
  test(
    'PageDown and PageUp move between articles; a read patches the same node',
    inboxPageDownAndPageUpMoveBetween,
  )
  test('mark all as read patches, announces', inboxMarkAllAsReadPatches)
  test(
    'dismiss slides out, moves focus, offers Undo in a toast, Undo restores',
    inboxDismissSlidesOutMovesFocus,
  )
  test(
    'a new row arrives; scrolled, it counts in the "n new" pill, which goes back up',
    inboxANewRowArrivesScrolled,
  )
  test(
    'actions call back and leave the row alone; empty and loading states',
    inboxActionsCallBackAndLeave,
  )
  test('2 s visible in an open inbox reads a row', inboxSVisibleInAnOpen)
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
    n.value = 12
    await flush()
    expect(b.getAttribute('aria-label')).toBe('Notifications, 12 unread')
    expect(badge.textContent).toBe('9+')
    expect(badge.hasAttribute('data-bump')).toBe(true)
  })
  test('opens its panel; a getter counts', async () => {
    const onOpen = vi.fn()
    const { container: c } = render(() => (
      <Bell
        count={() => 2}
        onOpen={onOpen}
        inbox={(open) => <p data-open={open.value ? '1' : '0'}>panel</p>}
      />
    ))
    await tick()
    const b = c.querySelector('button')!
    b.click()
    await flush()
    expect(b.getAttribute('aria-expanded')).toBe('true')
    expect(c.querySelector('p')!.dataset.open).toBe('1')
    expect(onOpen).toHaveBeenCalled()
  })
  test('on a phone it routes instead', async () => {
    const was = Object.getOwnPropertyDescriptor(window, 'matchMedia')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    })
    const route = vi.fn()
    const { container: c } = render(() => (
      <Bell count={1} route={route} inbox={() => <p>panel</p>} />
    ))
    c.querySelector('button')!.click()
    await flush()
    expect(route).toHaveBeenCalled()
    expect(c.querySelector('button')!.getAttribute('aria-expanded')).toBe('false')
    if (was) Object.defineProperty(window, 'matchMedia', was)
    else delete (window as unknown as Record<string, unknown>).matchMedia
  })
})

test('notify: inbox closed toasts through the Toaster, open does not', async () => {
  const open = state(false)
  mount(() => <p>x</p>)
  const n = notify({ open: () => open.value })
  n.push({ title: 'Mei mentioned you' })
  await flush()
  expect(
    [
      ...document.querySelectorAll('[data-scope="toast"][data-part="title"], [data-part="title"]'),
    ].some((t) => t.textContent === 'Mei mentioned you'),
  ).toBe(true)
  n.flush()
  open.value = true
  n.push({ title: 'Quiet' })
  await flush()
  expect(
    [...document.querySelectorAll('[data-part="title"]')].some((t) => t.textContent === 'Quiet'),
  ).toBe(false)
  n.flush()
  expect(await said()).toBe('New notification: Quiet')
})

test('ActivityFeed: rows, per-day groups, a Live check only while live', async () => {
  const live = state<LiveState>('live')
  const { container: c } = render(() => (
    <ActivityFeed
      items={[
        { id: 'a', actor: 'Ana', verb: 'moved', object: 'Crit', time: '10:31', day: 'Today' },
        { id: 'b', actor: 'Mei', verb: 'closed', time: '09:00', day: 'Yesterday' },
      ]}
      live={live}
    />
  ))
  expect(c.querySelectorAll('[data-scope="activity"] > li').length).toBe(2)
  expect([...c.querySelectorAll('[data-part="eyebrow"]')].map((e) => e.textContent)).toEqual([
    'Today',
    'Yesterday',
  ])
  expect(c.querySelector('[data-scope="sync"]')!.textContent).toContain('Live')
  live.value = 'offline'
  await flush()
  expect(c.querySelector('[data-scope="sync"]')).toBeNull()
})

test('PushSoftAsk: Turn on runs the prompt, Not now leaves quietly', async () => {
  const yes = vi.fn()
  const a = mount(() => <PushSoftAsk onAccept={yes} />)
  press(a.container, 'Turn on')
  await flush()
  expect(yes).toHaveBeenCalled()
  expect(a.container.querySelector('[data-scope="push-ask"]')).toBeNull()
  const b = mount(() => <PushSoftAsk onAccept={yes} />)
  press(b.container, 'Not now')
  await flush()
  expect(await said()).toContain("won't ask again")
})

describe('connection', () => {
  test('the pill maps native statuses and announces each change once', async () => {
    const s = state('open')
    const { container: c } = mount(() => <ConnectionPill state={s} queued={4} />)
    expect(c.querySelector('[data-scope="live-status"]')!.getAttribute('data-state')).toBe('live')
    await tick()
    s.value = 'closed'
    await flush()
    expect(c.querySelector('[data-scope="live-status"]')!.textContent).toBe('Offline')
    expect(await said(true)).toContain("You're offline")
    s.value = 'open'
    await flush()
    expect(await said()).toBe('Back online. 4 updates.')
  })
  test('the banner: reconnecting after the delay, offline at once, Retry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const s = state('live')
    const retry = vi.fn()
    const { container: c } = render(() => <ConnectionBanner state={s} onRetry={retry} />)
    s.value = 'reconnecting'
    await flush()
    expect(c.querySelector('[data-scope="banner"]')).toBeNull()
    vi.advanceTimersByTime(3000)
    await flush()
    expect(c.querySelector('[data-scope="banner"]')!.getAttribute('data-tone')).toBe('caution')
    s.value = 'offline'
    await flush()
    expect(c.querySelector('[data-scope="banner"]')!.getAttribute('data-tone')).toBe('critical')
    press(c, 'Retry now')
    expect(retry).toHaveBeenCalled()
    s.value = 'live'
    await flush()
    expect(c.querySelector('[data-scope="banner"]')).toBeNull()
    vi.useRealTimers()
  })
})

const preferenceDigestDisabledWithAReason = async () => {
  const onDigest = vi.fn()
  const { c } = setup(undefined, { onDigest })
  const sel = c.querySelector('select')!
  const badge = c.querySelector<HTMLElement>('[data-scope="badge"]')!
  expect(badge.hidden).toBe(true)
  sel.value = 'daily'
  fireEvent.change(sel)
  await flush()
  await tick()
  await flush()
  expect(onDigest).toHaveBeenCalledWith('daily')
  expect(badge.hidden).toBe(false)
  press(c, 'Reset to defaults')
  await flush()
  await tick()
  await flush()
  expect(onDigest).toHaveBeenLastCalledWith('instant')
  const off = mount(() => (
    <NotificationPreferences
      groups={GROUPS}
      channels={CHANNELS}
      value={{}}
      offered={OFFERED}
      locked={LOCKED}
    />
  )).container
  expect(off.querySelector('select')!.disabled).toBe(true)
  expect(off.textContent).toContain('Turn on an email event to choose a digest')
}

const preferenceARejectedSaveFlipsThe = async () => {
  const { c, named } = setup(
    () =>
      new Promise((_, no) => {
        setTimeout(() => no(new Error('no')), 5)
      }),
  )
  const box = named('Mentions, SMS')
  box.click()
  await flush()
  expect(c.querySelector('[data-part="status"]')!.textContent).toBe('Saving…')
  await new Promise((r) => {
    setTimeout(r, 10)
  })
  await flush()
  expect(named('Mentions, SMS').checked).toBe(false)
  expect(c.querySelector('[data-part="status"]')!.textContent).toContain("Couldn't save")
  expect(await said(true)).toContain("Couldn't save: Mentions, SMS on")
}

const preferenceALockedCellStaysOn = async () => {
  const onChange = vi.fn()
  const { c, named } = setup(onChange)
  const lock = named('Security alerts, email')
  expect(lock.getAttribute('aria-disabled')).toBe('true')
  expect(c.querySelector(`#${lock.getAttribute('aria-describedby')}`)!.textContent).toContain(
    'Required',
  )
  lock.click()
  await flush()
  expect(lock.checked).toBe(true)
  expect(onChange).not.toHaveBeenCalled()
  expect(await said()).toContain('Required')
  const na = c.querySelector<HTMLElement>('[data-part="na"]')!
  key(na, ' ')
  expect(await said()).toBe('Not offered for this event')
}

const preferenceTriStateParentsFollowTheir = async () => {
  const onChange = vi.fn()
  const { named } = setup(onChange)
  await tick()
  const parent = named('Collaboration, all email')
  expect(parent.indeterminate).toBe(true)
  parent.focus()
  parent.click()
  await flush()
  expect(document.activeElement).toBe(parent)
  expect(onChange.mock.calls[0]![0]).toEqual(
    ['mention', 'reply', 'assign'].map((event) => ({ event, channel: 'email', on: true })),
  )
  await flush()
  await tick()
  expect(parent.indeterminate).toBe(false)
  expect(parent.checked).toBe(true)
  expect(named('Replies, email').checked).toBe(true)
  expect(await said()).toBe('Email on for 3 events in Collaboration. Saved.')
}

const preferenceOneTabStopArrowsHome = async () => {
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
}

const setup = (
  onChange: Parameters<typeof NotificationPreferences>[0]['onChange'] = () => {},
  extra: Record<string, unknown> = {},
) => {
  const r = mount(() => (
    <NotificationPreferences
      groups={GROUPS}
      channels={CHANNELS}
      value={PREFS}
      offered={OFFERED}
      locked={LOCKED}
      onChange={onChange}
      defaults={{ value: PREFS }}
      {...extra}
    />
  ))
  const c = r.container
  const named = (n: string) =>
    [...c.querySelectorAll<HTMLInputElement>('input')].find(
      (i) => i.closest('label')!.querySelector('[data-part="sr-only"]')?.textContent === n,
    )!
  return { c, named, grid: c.querySelector<HTMLElement>('[role="grid"]')! }
}

describe('NotificationPreferences', () => {
  test('one tab stop; arrows, Home, End, Ctrl+Home/End', preferenceOneTabStopArrowsHome)
  test(
    'tri-state parents follow their cells, and a mixed parent goes all on',
    preferenceTriStateParentsFollowTheir,
  )
  test('a locked cell stays on and says why; not offered says so', preferenceALockedCellStaysOn)
  test(
    'a rejected save flips the cell back and says why, assertively',
    preferenceARejectedSaveFlipsThe,
  )
  test(
    'digest: disabled with a reason when email is all off; the badge shows on a digest; Reset',
    preferenceDigestDisabledWithAReason,
  )
})

describe('TransportPicker', () => {
  test('starts connecting, validates the bus, disables it for tabs', async () => {
    const seen = vi.fn()
    const { container: c } = mount(() => <TransportPicker onConfigChange={seen} />)
    await flush()
    expect(c.querySelectorAll('[data-part="lane"]').length).toBe(3)
    const radio = (v: string) => c.querySelector<HTMLInputElement>(`input[value="${v}"]`)!
    expect(radio('durable-object').disabled).toBe(true)
    radio('memory').click()
    await flush()
    expect(c.querySelector('[data-part="build-error"]')!.textContent).toContain('R002')
    expect(c.querySelector('[data-part="lane"]')!.getAttribute('data-state')).toBe('offline')
    expect(seen.mock.lastCall![0].bus).toBe('memory')
    radio('tabs').click()
    await flush()
    expect(c.querySelectorAll('fieldset')[1]!.disabled).toBe(true)
    expect(c.textContent).toContain('No server: tabs only stays in this browser.')
    expect(c.querySelector('[data-part="build-error"]')).toBeNull()
    press(c, 'Reset')
    await flush()
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
    press(c, 'Ping')
    await flush()
    expect(log.textContent).toContain('ping skipped')
  })
})

describe('meetings', () => {
  const me: Participant = { id: 'you', name: 'Jo Diaz' }
  const room = (extra: Record<string, unknown> = {}) =>
    mount(() => <MeetingRoom title="Crit" participants={PEOPLE} self={me} {...extra} />).container
  const stage = (c: Element) => c.querySelector('[data-part="stage"]')!
  const meeting = { room, stage, key, press, said, mount }

  test(
    'a dark island; tiles are a list with real names, flags in words',
    meetingADarkIslandTilesAre(meeting),
  )
  test('four layouts through a radio group', meetingFourLayoutsThroughARadio(meeting))
  test('the ring sweeps out when a speaker stops', meetingTheRingSweepsOutWhen(meeting))
  test('a raised hand is announced, a new speaker is not', meetingARaisedHandIsAnnounced(meeting))
  test('speaker layout follows after the hold', meetingSpeakerLayoutFollowsAfterThe(meeting))
  test(
    'the control bar is an APG toolbar: one tab stop, arrows, wraps, Leave is in it',
    meetingTheControlBarIsAn(meeting),
  )
  test('toggles press, label, call back and announce', meetingTogglesPressLabelCallBack(meeting))
  test(
    'sharing forces presentation with Stop sharing; the sidebar opens and closes',
    meetingSharingForcesPresentationWithStop(meeting),
  )
  test(
    'compact: speaker, no switcher, Leave icon-only, More opens the panel',
    meetingCompactSpeakerNoSwitcherLeave(meeting),
  )
  test(
    'media is a slot; a camera-off tile shows its avatar; the pip moves by keys and says where',
    meetingMediaIsASlotA(meeting),
  )
  test(
    'Prejoin: meter from --level, device picks, joining state',
    meetingPrejoinMeterFromLevelDevice(meeting),
  )
  test(
    'Lobby is a status; Countdown is a quiet timer that speaks once at a minute',
    meetingLobbyIsAStatusCountdown(meeting),
  )
  test(
    'ScheduledLobby: Join stays disabled until the countdown ends',
    meetingScheduledLobbyJoinStaysDisabledUntil(meeting),
  )
})
