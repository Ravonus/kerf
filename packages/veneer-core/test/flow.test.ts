// The flow pack's logic: 09 §1.1 steps, §1.3 errors, §2.3 passwords and codes, §3.2 placement, §5 connection, §7 shortcuts.
import { describe, expect, test, vi } from 'vitest'
import {
  clockLabel,
  connView,
  createShortcuts,
  emailError,
  fieldSummary,
  filterShortcuts,
  flowDirection,
  isPasskeyCancel,
  isSingleKey,
  isTextTarget,
  issueFields,
  mapFlowError,
  markParts,
  otpClean,
  passwordRules,
  passwordStrength,
  secondsClock,
  shortcutLabels,
  stepAnnouncement,
  stepFromSearch,
  stepUrl,
  tourPlacement,
} from '../src/flow-pack'

describe('steps', () => {
  const ids = ['cart', 'ship', 'pay', 'done']
  test('direction follows position', () => {
    expect(flowDirection(ids, 'ship', 'pay')).toBe('forward')
    expect(flowDirection(ids, 'pay', 'cart')).toBe('back')
  })
  test('the announcement names the step', () =>
    expect(stepAnnouncement(ids, 'ship', 'Shipping')).toBe('Step 2 of 4, Shipping'))
  test('the URL names only known steps and keeps the rest', () => {
    expect(stepFromSearch('?step=pay&x=1', 'step', ids)).toBe('pay')
    expect(stepFromSearch('?step=nope', 'step', ids)).toBeUndefined()
    expect(stepUrl('https://a.b/c?x=1#h', 'step', 'pay')).toBe('/c?x=1&step=pay#h')
  })
})

describe('error mapping, one message per cause', () => {
  test('issues go to their fields, with a summary', () => {
    const m = mapFlowError({
      message: 'bad',
      issues: [
        { message: 'Too short', path: ['password'] },
        { message: 'Nope', path: [{ key: 'a' }, 'b'] },
        { message: 'Second', path: ['password'] },
      ],
    })
    expect(m).toMatchObject({
      surface: 'field',
      fields: { password: 'Too short', 'a.b': 'Nope' },
      summary: '2 fields need attention',
      focus: 'field',
    })
    expect(fieldSummary(1)).toBe('1 field needs attention')
    expect(issueFields([{ message: 'no path' }])).toEqual({})
  })
  test('a wrong password and an unknown email read the same', () => {
    const m = mapFlowError({ code: 'INVALID_CREDENTIALS', status: 401 })
    expect(m).toMatchObject({
      surface: 'alert',
      title: "That email and password don't match.",
      focus: 'alert',
      live: 'assertive',
    })
  })
  test('locked without a date says only that', () =>
    expect(mapFlowError({ code: 'LOCKED' }).title).toBe('This account is locked.'))
  test('locked says until when, in UTC', () =>
    expect(
      mapFlowError({ code: 'LOCKED', data: { until: '2026-10-30T14:05:00Z' } }).title,
    ).toContain('14:05 UTC'))
  test('rate limit stays polite and keeps focus', () =>
    expect(mapFlowError({ code: 'RATE_LIMITED', data: { retryAfter: 20 } })).toMatchObject({
      surface: 'rate-limit',
      retryAfter: 20,
      focus: 'stay',
      live: 'polite',
    }))
  test('codes land on the code field', () => {
    expect(mapFlowError({ code: 'WRONG_CODE', data: { attemptsLeft: 2 } }).fields.code).toBe(
      "That code didn't work. 2 tries left.",
    )
    expect(mapFlowError({ code: 'WRONG_CODE', data: { attemptsLeft: 1 } }).fields.code).toBe(
      "That code didn't work. 1 try left.",
    )
    expect(mapFlowError({ code: 'EXPIRED' }).fields.code).toBe(
      'That code expired. We sent a new one.',
    )
  })
  test('transport is a toast, offline a banner, a stale contract a polite banner', () => {
    expect(mapFlowError({ status: 503 }).surface).toBe('toast')
    expect(mapFlowError(new TypeError('Failed to fetch')).surface).toBe('toast')
    expect(mapFlowError(new TypeError('Failed to fetch'), { online: false })).toMatchObject({
      surface: 'banner',
      live: 'assertive',
    })
    expect(mapFlowError({ code: 'STALE_SCHEMA' })).toMatchObject({
      surface: 'banner',
      live: 'polite',
    })
  })
  test('copy by code wins; a bare message or string is an alert', () => {
    expect(
      mapFlowError(
        { code: 'SEATS', data: { n: 2 } },
        { copy: { SEATS: (d) => `${String(d.n)} seats left.` } },
      ).title,
    ).toBe('2 seats left.')
    expect(mapFlowError('Nope').title).toBe('Nope')
    expect(mapFlowError(undefined).title).toMatch(/Try again/)
  })
})

test('the clock counts from time, and stops at zero', () => {
  vi.useFakeTimers()
  const ticks: number[] = []
  const done = vi.fn()
  secondsClock(2, (s) => ticks.push(s), done)
  vi.advanceTimersByTime(5000)
  expect(ticks).toEqual([1, 0])
  expect(done).toHaveBeenCalledOnce()
  vi.useRealTimers()
  expect(clockLabel(30)).toBe('0:30')
  expect(clockLabel(95)).toBe('1:35')
})

test('passkey cancels are no error', () => {
  expect(isPasskeyCancel({ name: 'NotAllowedError' })).toBe(true)
  expect(isPasskeyCancel({ name: 'AbortError' })).toBe(true)
  expect(isPasskeyCancel(new Error('x'))).toBe(false)
})

test('emails and passwords', () => {
  expect(emailError('')).toBeUndefined()
  expect(emailError('a@b.co')).toBeUndefined()
  expect(emailError('a@b')).toMatch(/typo/)
  expect(passwordRules('abcdefg1').every((r) => r.met)).toBe(true)
  expect(
    passwordRules('short')
      .filter((r) => !r.met)
      .map((r) => r.id),
  ).toEqual(['length', 'number'])
  expect(passwordStrength('abc')).toMatchObject({ score: 0, label: 'Too short', tone: 'critical' })
  expect(passwordStrength('aaaaaaaaaaaa').score).toBe(1)
  expect(passwordStrength('abcdefg1').tone).toBe('critical')
  expect(passwordStrength('abcdefG1').tone).toBe('caution')
  expect(passwordStrength('Tr0ub4dor&3xtra-long').label).toBe('Strong')
})

test('a pasted code keeps its digits', () => expect(otpClean('123 456 789', 6)).toBe('123456'))

describe('tour placement', () => {
  const card = { w: 300, h: 170 }
  test('beside a target on the start edge', () =>
    expect(tourPlacement({ x: 20, y: 100, w: 200, h: 40 }, card, { w: 1280, h: 800 })).toEqual({
      left: 234,
      top: 35,
    }))
  test('below otherwise, flipping above at the bottom', () => {
    expect(tourPlacement({ x: 900, y: 100, w: 100, h: 40 }, card, { w: 1280, h: 800 }).top).toBe(
      154,
    )
    expect(tourPlacement({ x: 900, y: 700, w: 100, h: 40 }, card, { w: 1280, h: 800 }).top).toBe(
      516,
    )
  })
  test('docks to the edge away from the target on a phone', () => {
    expect(tourPlacement({ x: 10, y: 700, w: 100, h: 40 }, card, { w: 390, h: 800 })).toEqual({
      left: 12,
      width: 366,
      top: 12,
    })
    expect(tourPlacement({ x: 10, y: 50, w: 100, h: 40 }, card, { w: 390, h: 800 }).top).toBe(618)
  })
})

test('connection views rank offline over reconnecting over stale', () => {
  expect(connView({ online: false, stale: true })).toBe('offline')
  expect(connView({ online: true, state: 'offline' })).toBe('offline')
  expect(connView({ online: true, state: 'reconnecting', stale: true })).toBe('reconnecting')
  expect(connView({ online: true, state: 'live', recovered: true, stale: true })).toBe('online')
  expect(connView({ online: true, state: 'live', stale: true })).toBe('stale')
  expect(connView({ online: true, state: 'live' })).toBeUndefined()
})

type Press = (key: string, init?: KeyboardEventInit, target?: EventTarget) => KeyboardEvent
type Setup = () => { reg: ReturnType<typeof createShortcuts>; stop: () => void }

function registerShortcutBasics(press: Press, setup: Setup) {
  test('labels are platform-aware', () => {
    expect(shortcutLabels('mod+k', true)).toEqual([['⌘', 'K']])
    expect(shortcutLabels('mod+k', false)).toEqual([['Ctrl', 'K']])
    expect(shortcutLabels('g m', false)).toEqual([['G'], ['M']])
    expect(shortcutLabels('esc', false)).toEqual([['Esc']])
  })
  test('single keys are told apart', () => {
    expect(isSingleKey('?')).toBe(true)
    expect(isSingleKey('g m')).toBe(true)
    expect(isSingleKey('shift+a')).toBe(true)
    expect(isSingleKey('mod+k')).toBe(false)
  })
  test('a key fires, with `?` from any layout', () => {
    const { reg, stop } = setup()
    const run = vi.fn()
    reg.register({ keys: '?', label: 'Help', run })
    expect(press('?', { shiftKey: true }).defaultPrevented).toBe(true)
    expect(run).toHaveBeenCalledOnce()
    stop()
  })
}

function registerShortcutKeys(press: Press, setup: Setup) {
  test('never in a text input; a mod chord still does', () => {
    const { reg, stop } = setup()
    const one = vi.fn(),
      chord = vi.fn()
    reg.register({ keys: 't', label: 'Theme', run: one })
    reg.register({ keys: 'mod+k', label: 'Search', run: chord })
    const input = document.body.appendChild(document.createElement('input'))
    press('t', {}, input)
    expect(one).not.toHaveBeenCalled()
    press('k', { ctrlKey: true }, input)
    press('k', { metaKey: true }, input)
    expect(chord).toHaveBeenCalledOnce()
    const box = document.body.appendChild(document.createElement('input'))
    box.type = 'checkbox'
    expect(isTextTarget(box)).toBe(false)
    expect(isTextTarget(input)).toBe(true)
    input.remove()
    box.remove()
    stop()
  })
  test('sequences, and single keys turn off', () => {
    const { reg, stop } = setup()
    const run = vi.fn()
    reg.register({ keys: 'g m', label: 'Members', run })
    press('g')
    press('m')
    expect(run).toHaveBeenCalledOnce()
    press('m')
    expect(run).toHaveBeenCalledOnce()
    reg.singleKeys = false
    press('g')
    press('m')
    expect(run).toHaveBeenCalledOnce()
    stop()
  })
}

function registerShortcutGating(press: Press, setup: Setup) {
  test('`when` gates firing and the list; unregister and stop end it', () => {
    const { reg, stop } = setup()
    let on = false
    const run = vi.fn()
    const drop = reg.register({ keys: 'x', label: 'X', when: () => on, run })
    press('x')
    expect(reg.list()).toEqual([])
    on = true
    press('x')
    expect(run).toHaveBeenCalledOnce()
    expect(reg.list()).toHaveLength(1)
    stop()
    press('x')
    expect(run).toHaveBeenCalledOnce()
    drop()
    expect(reg.list()).toEqual([])
  })
  test('filter matches names and keys; marks split around the match', () => {
    const list = [
      { keys: 'mod+k', label: 'Search' },
      { keys: 'g m', label: 'Members' },
    ]
    expect(filterShortcuts(list, 'mem', false).map((s) => s.label)).toEqual(['Members'])
    expect(filterShortcuts(list, 'ctrl', false).map((s) => s.label)).toEqual(['Search'])
    expect(markParts('Members', 'mem').map((p) => [p.text, p.hit])).toEqual([
      ['Mem', true],
      ['bers', false],
    ])
    expect(markParts('Any', '')).toEqual([{ at: 0, text: 'Any', hit: false }])
  })
}

describe('shortcuts', () => {
  const press = (
    key: string,
    init: KeyboardEventInit = {},
    target: EventTarget = document.body,
  ) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(e)
    return e
  }
  const setup = () => {
    const reg = createShortcuts()
    const stop = reg.listen(document)
    return { reg, stop }
  }
  registerShortcutBasics(press, setup)
  registerShortcutKeys(press, setup)
  registerShortcutGating(press, setup)
})
