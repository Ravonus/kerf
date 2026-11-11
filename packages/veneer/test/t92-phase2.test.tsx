import { state } from '@kerf-js/core'
import { fireEvent } from '@testing-library/dom'
import { Inbox, type InboxProps } from '../src/live/Inbox'
import {
  NotificationPreferences,
  type NotificationPreferencesProps,
} from '../src/live/NotificationPreferences'
import { Toaster } from '../src/Toast'
import { flush, render } from '@kerf-js/core/test'
import { MeetingRoom, type MeetingLayout, type MeetingRoomProps } from '../src/live/MeetingRoom'
import { PEOPLE, NOTES, GROUPS, CHANNELS, PREFS } from './fixtures/pack-live'

afterEach(() => {
  document.body.innerHTML = ''
})

test('meeting slots use original receiver and return the live DOM nodes', async () => {
  const layout = state<MeetingLayout>('board')
  const sidebar = state<'people' | 'chat' | null>('people')
  const receivers: unknown[] = []
  const board = document.createElement('em'),
    share = document.createElement('i'),
    chat = document.createElement('b'),
    invite = document.createElement('u')
  const props: MeetingRoomProps = {
    title: 'Call',
    participants: PEOPLE,
    self: PEOPLE[0]!,
    layout,
    sidebar,
    board() {
      receivers.push(this)
      return board
    },
    share() {
      receivers.push(this)
      return share
    },
    chat() {
      receivers.push(this)
      return chat
    },
    invite() {
      receivers.push(this)
      return invite
    },
  }
  const { container } = render(() => MeetingRoom(props))
  await flush()
  expect(container.contains(board)).toBe(true)
  expect(container.contains(invite)).toBe(true)
  layout.value = 'presentation'
  await flush()
  expect(container.contains(share)).toBe(true)
  sidebar.value = 'chat'
  await flush()
  expect(container.contains(chat)).toBe(true)
  expect(receivers.length).toBeGreaterThanOrEqual(4)
  for (const receiver of receivers) expect(receiver).toBe(props)
})

test('reaction captures callback before reading its argument and suppresses absent callback reads', async () => {
  const trace: string[] = []
  let armed = false
  let callback = function (this: unknown, emoji: string) {
    trace.push(this === props ? `old:${emoji}` : 'old:other')
  }
  const replacement = function (this: unknown, emoji: string) {
    trace.push(this === props ? `new:${emoji}` : 'new:other')
  }
  const props: MeetingRoomProps = {
    title: 'Call',
    participants: PEOPLE,
    self: PEOPLE[0]!,
    get onReact() {
      trace.push('lookup')
      armed = true
      return callback
    },
    get reaction() {
      trace.push('reaction')
      if (armed) callback = replacement
      return '🔥'
    },
  }
  const { container } = render(() => MeetingRoom(props))
  await flush()
  trace.length = 0
  armed = false
  container.querySelector<HTMLButtonElement>('button[aria-label="React"]')!.click()
  expect(trace.at(-1)).toBe('old:🔥')
  expect(trace.indexOf('lookup')).toBeLessThan(trace.lastIndexOf('reaction'))
})

test('absent reaction callback skips its argument reads', async () => {
  let reads = 0
  let tracking = false
  const props: MeetingRoomProps = {
    title: 'Call',
    participants: PEOPLE,
    self: PEOPLE[0]!,
    get reaction() {
      if (tracking) reads++
      return '🔥'
    },
  }
  const { container } = render(() => MeetingRoom(props))
  await flush()
  tracking = true
  container.querySelector<HTMLButtonElement>('button[aria-label="React"]')!.click()
  expect(reads).toBe(2)
})

test('meeting slot guard and invocation use the current original property', async () => {
  const node = document.createElement('em')
  let reads = 0
  const receivers: unknown[] = []
  const props: MeetingRoomProps = {
    title: 'Call',
    participants: PEOPLE,
    self: PEOPLE[0]!,
    layout: 'board',
    get board() {
      reads++
      return reads === 1
        ? function () {
            throw new Error('stale callback')
          }
        : function (this: unknown) {
            receivers.push(this)
            return node
          }
    },
  }
  const { container } = render(() => MeetingRoom(props))
  await flush()
  expect(container.contains(node)).toBe(true)
  expect(receivers.length).toBeGreaterThan(0)
  expect(receivers.every((receiver) => receiver === props)).toBe(true)
})

test.each(['onRead', 'onDismiss'] as const)('%s captures before reading note id', async (name) => {
  const trace: string[] = []
  let armed = false
  let callback = function (this: unknown, id: string) {
    trace.push(this === props ? `old:${id}` : 'other')
  }
  const replacement = function () {
    trace.push('replacement')
  }
  const note = {
    ...NOTES[0]!,
    get id() {
      if (armed) {
        trace.push('id')
        callback = replacement
        armed = false
      }
      return 'n1'
    },
  }
  const props: InboxProps = {
    items: [note],
    open: false,
    get [name]() {
      trace.push('lookup')
      armed = true
      return callback
    },
  }
  render(() => <Toaster />)
  const { container } = render(() => Inbox(props))
  await flush()
  trace.length = 0
  armed = false
  fireEvent.keyDown(container.querySelector('[data-id="n1"]')!, {
    key: name === 'onRead' ? 'Enter' : 'Delete',
  })
  if (name === 'onDismiss')
    await new Promise((resolve) => {
      setTimeout(resolve, 260)
    })
  expect(trace).toEqual(['lookup', 'id', 'old:n1'])
})

test('reset captures change and digest callbacks before argument getters replace them', async () => {
  const trace: string[] = []
  let changeArmed = false,
    digestArmed = false
  let change = function (this: unknown) {
    trace.push(this === props ? 'change:old' : 'change:other')
  }
  let digest = function (this: unknown) {
    trace.push(this === props ? 'digest:old' : 'digest:other')
  }
  const props: NotificationPreferencesProps = {
    groups: GROUPS,
    value: PREFS,
    get channels() {
      if (changeArmed) {
        trace.push('channels')
        change = () => trace.push('change:new')
        changeArmed = false
      }
      return CHANNELS
    },
    get onChange() {
      trace.push('change:lookup')
      changeArmed = true
      return change
    },
    get onDigest() {
      trace.push('digest:lookup')
      digestArmed = true
      return digest
    },
    defaults: {
      value: PREFS,
      get digest() {
        if (digestArmed) {
          trace.push('digest:value')
          digest = () => trace.push('digest:new')
          digestArmed = false
        }
        return 'instant'
      },
    },
  }
  const { container } = render(() => NotificationPreferences(props))
  await flush()
  trace.length = 0
  changeArmed = false
  digestArmed = false
  const button = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Reset to defaults'),
  )!
  button.click()
  await flush()
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
  await flush()
  expect(trace).toEqual([
    'change:lookup',
    'channels',
    'change:old',
    'digest:lookup',
    'digest:value',
    'digest:old',
  ])
})
