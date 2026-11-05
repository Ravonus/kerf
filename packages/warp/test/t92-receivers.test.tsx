import { sleep as pause } from '../../../scripts/lib/sleep.mjs'
import { fireEvent } from '@testing-library/dom'
import { flush, render } from '@weft-js/core/test'
import { Inbox, type InboxProps } from '../src/live/Inbox'
import {
  NotificationPreferences,
  type NotificationPreferencesProps,
} from '../src/live/NotificationPreferences'
import { MeetingRoom, type MeetingRoomProps } from '../src/live/MeetingRoom'
import { Toaster } from '../src/Toast'
import { CHANNELS, GROUPS, NOTES, PREFS, PEOPLE } from './fixtures/pack-live'

const click = (root: ParentNode, name: string) => {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === name,
  )
  if (!button) throw new Error(`Missing button ${name}`)
  button.click()
}
afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('Inbox callbacks use the live original props receiver', async () => {
  const calls: Array<[string, unknown, ...unknown[]]> = []
  const first = vi.fn()
  const props: InboxProps = {
    items: NOTES,
    open: false,
    onAction: first,
    onRead: first,
    onReadAll: first,
    onOpen: first,
    onDismiss: first,
    onRestore: first,
  }
  render(() => <Toaster />)
  const { container } = render(() => Inbox(props))
  props.onAction = function (this: unknown, note, action) {
    calls.push(['action', this, note, action])
  }
  props.onRead = function (this: unknown, id) {
    calls.push(['read', this, id])
  }
  props.onReadAll = function (this: unknown) {
    calls.push(['all', this])
  }
  props.onOpen = function (this: unknown, note) {
    calls.push(['open', this, note])
  }
  props.onDismiss = function (this: unknown, id) {
    calls.push(['dismiss', this, id])
  }
  props.onRestore = function (this: unknown, note) {
    calls.push(['restore', this, note])
  }
  click(container, 'Approve')
  const row = container.querySelector<HTMLElement>('[data-id="n1"]')!
  fireEvent.keyDown(row, { key: 'Enter' })
  click(container, 'Mark all as read')
  fireEvent.keyDown(row, { key: 'Delete' })
  await pause(260)
  await flush()
  click(document.body, 'Undo')
  expect(first).not.toHaveBeenCalled()
  expect(calls.map((call) => [call[0], call[1] === props])).toEqual(
    ['action', 'read', 'open', 'all', 'dismiss', 'restore'].map((name) => [name, true]),
  )
  for (const call of calls) expect(call[1]).toBe(props)
  expect(calls[0]![2]).toBe(NOTES[1])
  expect(calls[2]![2]).toBe(NOTES[0])
  expect(calls).toEqual([
    ['action', props, NOTES[1], 'approve'],
    ['read', props, 'n1'],
    ['open', props, NOTES[0]],
    ['all', props],
    ['dismiss', props, 'n1'],
    ['restore', props, NOTES[0]],
  ])
})

test('Inbox visible read uses the current callback and original receiver', async () => {
  const seen: IntersectionObserverCallback[] = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        seen.push(cb)
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const calls: unknown[] = []
  const first = vi.fn()
  const props: InboxProps = { items: NOTES, open: true, onRead: first }
  const { container } = render(() => Inbox(props))
  await Promise.resolve()
  props.onRead = function (this: unknown, id) {
    calls.push([this, id])
  }
  const row = container.querySelector('[data-id="n1"]')!
  seen.forEach((cb) =>
    cb(
      [{ target: row, isIntersecting: true } as IntersectionObserverEntry],
      null as unknown as IntersectionObserver,
    ),
  )
  vi.advanceTimersByTime(2000)
  expect(first).not.toHaveBeenCalled()
  expect(calls).toEqual([[props, 'n1']])
  expect((calls[0] as unknown[])[0]).toBe(props)
})

test('preference changes, digest and reset preserve receiver and awaited rejection', async () => {
  const calls: Array<[string, unknown, unknown]> = []
  const first = vi.fn()
  const props: NotificationPreferencesProps = {
    groups: GROUPS,
    channels: CHANNELS,
    value: PREFS,
    defaults: { value: PREFS, digest: 'instant' },
    onChange: first,
    onDigest: first,
  }
  const { container } = render(() => NotificationPreferences(props))
  props.onChange = function (this: unknown, changes) {
    calls.push(['change', this, changes])
    return Promise.resolve()
  }
  props.onDigest = function (this: unknown, value) {
    calls.push(['digest', this, value])
    return Promise.resolve()
  }
  const cell = [...container.querySelectorAll<HTMLInputElement>('input')].find(
    (i) =>
      i.closest('label')?.querySelector('[data-part="sr-only"]')?.textContent === 'Mentions, SMS',
  )!
  cell.click()
  await flush()
  await pause()
  await flush()
  const select = container.querySelector('select')!
  select.value = 'daily'
  fireEvent.change(select)
  await flush()
  await pause()
  await flush()
  click(container, 'Reset to defaults')
  await flush()
  await pause()
  await flush()
  expect(first).not.toHaveBeenCalled()
  expect(calls.map((call) => [call[0], call[1] === props])).toEqual(
    ['change', 'digest', 'change', 'digest'].map((name) => [name, true]),
  )
  for (const call of calls) expect(call[1]).toBe(props)
  expect(calls.map((c) => [c[0], c[1]])).toEqual([
    ['change', props],
    ['digest', props],
    ['change', props],
    ['digest', props],
  ])
  expect(calls[0]![2]).toEqual([{ event: 'mention', channel: 'sms', on: true }])
  expect(calls[1]![2]).toBe('daily')
  expect(calls[3]![2]).toBe('instant')
  props.onChange = function (this: unknown) {
    calls.push(['rejected', this, null])
    return Promise.reject(new Error('no'))
  }
  cell.click()
  await flush()
  await pause()
  await flush()
  expect(calls.at(-1)).toEqual(['rejected', props, null])
  expect(calls.at(-1)![1]).toBe(props)
  expect(container.querySelector('[data-part="status"]')!.textContent).toContain("Couldn't save")
})

test('meeting reaction, more and leave use the live original receiver', () => {
  const calls: Array<[string, unknown, unknown?]> = []
  const first = vi.fn()
  const props: MeetingRoomProps = {
    title: 'Room',
    participants: PEOPLE,
    self: PEOPLE[0]!,
    compact: true,
    onReact: first,
    onMore: first,
    onLeave: first,
  }
  const { container } = render(() => MeetingRoom(props))
  props.onReact = function (this: unknown, value) {
    calls.push(['react', this, value])
  }
  props.onMore = function (this: unknown) {
    calls.push(['more', this])
  }
  props.onLeave = function (this: unknown) {
    calls.push(['leave', this])
  }
  click(container, 'React')
  click(container, 'More options')
  click(container, 'Leave meeting')
  expect(first).not.toHaveBeenCalled()
  expect(calls.map((call) => [call[0], call[1] === props])).toEqual(
    ['react', 'more', 'leave'].map((name) => [name, true]),
  )
  for (const call of calls) expect(call[1]).toBe(props)
  expect(calls).toEqual([
    ['react', props, '🎉'],
    ['more', props],
    ['leave', props],
  ])
})

test('meeting More falls back when absent and calls the replacement when present', async () => {
  const props: MeetingRoomProps = {
    title: 'Room',
    participants: PEOPLE,
    self: PEOPLE[0]!,
    compact: true,
  }
  const { container } = render(() => MeetingRoom(props))
  const sidebar = container.querySelector<HTMLElement>('[data-part="sidebar"]')!
  expect(sidebar.hidden).toBe(true)
  click(container, 'More options')
  await flush()
  expect(sidebar.hidden).toBe(false)
  const calls: unknown[] = []
  props.onMore = function (this: unknown) {
    calls.push(this)
  }
  click(container, 'More options')
  await flush()
  expect(calls).toHaveLength(1)
  expect(calls[0]).toBe(props)
  expect(sidebar.hidden).toBe(false)
})

test('missing optional Inbox and preference callbacks remain optional', async () => {
  const { container: inbox } = render(() => Inbox({ items: NOTES, open: false }))
  expect(() => click(inbox, 'Approve')).not.toThrow()
  expect(() =>
    fireEvent.keyDown(inbox.querySelector('[data-id="n1"]')!, { key: 'Enter' }),
  ).not.toThrow()
  const { container } = render(() =>
    NotificationPreferences({
      groups: GROUPS,
      channels: CHANNELS,
      value: PREFS,
      defaults: { value: PREFS },
    }),
  )
  const cell = [...container.querySelectorAll<HTMLInputElement>('input')].find(
    (i) =>
      i.closest('label')?.querySelector('[data-part="sr-only"]')?.textContent === 'Mentions, SMS',
  )!
  cell.click()
  await flush()
  await pause()
  await flush()
  expect(container.querySelector('[data-part="status"]')!.textContent).not.toContain(
    "Couldn't save",
  )
  click(container, 'Reset to defaults')
  await flush()
  await pause()
  await flush()
  expect(container.querySelector('[data-part="status"]')!.textContent).not.toContain(
    "Couldn't save",
  )
})

test('preference saves await the current callback promise', async () => {
  let resolve!: () => void
  const pending = new Promise<void>((done) => {
    resolve = done
  })
  const calls: unknown[] = []
  const props: NotificationPreferencesProps = { groups: GROUPS, channels: CHANNELS, value: PREFS }
  const { container } = render(() => NotificationPreferences(props))
  props.onChange = function (this: unknown, changes) {
    calls.push([this, changes])
    return pending
  }
  const cell = [...container.querySelectorAll<HTMLInputElement>('input')].find(
    (i) =>
      i.closest('label')?.querySelector('[data-part="sr-only"]')?.textContent === 'Mentions, SMS',
  )!
  cell.click()
  await flush()
  expect((calls[0] as unknown[])[0]).toBe(props)
  expect(container.querySelector('[data-part="status"]')!.textContent).toBe('Saving…')
  resolve()
  await pending
  await flush()
  expect(container.querySelector('[data-part="status"]')!.textContent).toBe('Saved')
})

test('meeting callback throws retain the original error', () => {
  const sentinel = new Error('leave failed')
  const seen: unknown[] = []
  const listener = (event: ErrorEvent) => {
    event.preventDefault()
    seen.push(event.error)
  }
  window.addEventListener('error', listener)
  try {
    const props: MeetingRoomProps = {
      title: 'Room',
      participants: PEOPLE,
      self: PEOPLE[0]!,
      onLeave() {
        throw sentinel
      },
    }
    const { container } = render(() => MeetingRoom(props))
    click(container, 'Leave meeting')
    expect(seen).toEqual([sentinel])
    expect(seen[0]).toBe(sentinel)
  } finally {
    window.removeEventListener('error', listener)
  }
})
