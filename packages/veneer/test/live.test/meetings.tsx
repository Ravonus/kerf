import { sleep as tick } from '../../../../scripts/lib/sleep.mjs'
import { fireEvent } from '@testing-library/dom'
import { state } from '@kerf-js/core'
import { flush, type render } from '@kerf-js/core/test'
import { ControlBar, type Participant } from '../../src/live/MeetingRoom'
import { Countdown, Lobby, Prejoin, ScheduledLobby } from '../../src/live/Prejoin'
import { PEOPLE } from '../fixtures/pack-live'

type MeetingContext = {
  room: (extra?: Record<string, unknown>) => HTMLElement
  stage: (c: Element) => Element
  key: (el: Element, k: string, o?: object) => boolean
  press: (c: ParentNode, name: string | RegExp) => HTMLElement
  said: (assertive?: boolean) => Promise<string | null>
  mount: (fn: () => unknown) => ReturnType<typeof render>
}

export function meetingADarkIslandTilesAre({ room }: MeetingContext) {
  return () => {
    const c = room()
    expect(c.querySelector('[data-scope="room"]')!.getAttribute('data-theme')).toBe('dark')
    const tiles = [...c.querySelectorAll('[role="list"] [data-scope="tile"]')]
    expect(tiles.length).toBe(PEOPLE.length)
    expect(tiles[0]!.getAttribute('role')).toBe('listitem')
    expect(tiles[0]!.getAttribute('aria-label')).toBe('Kofi Mensah, host, speaking')
    expect(tiles[0]!.hasAttribute('data-speaking')).toBe(true)
    expect(tiles[1]!.getAttribute('aria-label')).toBe('Ana Ruiz, muted')
    expect(tiles[4]!.getAttribute('data-network')).toBe('poor')
  }
}

export function meetingFourLayoutsThroughARadio({ room, stage }: MeetingContext) {
  return async () => {
    const seen = vi.fn()
    const c = room({
      onLayoutChange: seen,
      share: () => <i data-share="" />,
      board: () => <i data-board="" />,
    })
    const group = c.querySelector('[role="radiogroup"]')!
    expect(group.getAttribute('aria-label')).toBe('Layout')
    const pick = async (v: string) => {
      group.querySelector<HTMLInputElement>(`input[value="${v}"]`)!.click()
      await flush()
    }
    await pick('speaker')
    expect(stage(c).getAttribute('data-layout')).toBe('speaker')
    expect(c.querySelectorAll('[data-part="strip"] [data-scope="tile"]').length).toBe(
      PEOPLE.length - 1,
    )
    await pick('presentation')
    expect(c.querySelector('[data-share]')).not.toBeNull()
    expect(c.querySelector('[data-part="rail"]')).not.toBeNull()
    await pick('board')
    expect(c.querySelector('[data-board]')).not.toBeNull()
    expect(seen).toHaveBeenLastCalledWith('board')
  }
}

export function meetingTheRingSweepsOutWhen({ room }: MeetingContext) {
  return async () => {
    const p = state<Participant[]>(PEOPLE)
    const c = room({ participants: p })
    await tick()
    const tile = c.querySelector('[data-pid="kofi"]')!
    p.value = p.value.map((x) => (x.id === 'kofi' ? { ...x, isSpeaking: false } : x))
    await flush()
    expect(c.querySelector('[data-pid="kofi"]')).toBe(tile)
    expect(tile.hasAttribute('data-speaking')).toBe(false)
    expect(tile.hasAttribute('data-speaking-out')).toBe(true)
  }
}

export function meetingARaisedHandIsAnnounced({ room, said }: MeetingContext) {
  return async () => {
    const p = state<Participant[]>(PEOPLE)
    room({ participants: p })
    await tick()
    p.value = p.value.map((x) => (x.id === 'mei' ? { ...x, handRaised: true } : x))
    await flush()
    expect(await said()).toBe('Mei Tanaka raised a hand')
  }
}

export function meetingSpeakerLayoutFollowsAfterThe({ room }: MeetingContext) {
  return async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const p = state<Participant[]>(PEOPLE)
    const c = room({ participants: p, layout: 'speaker' })
    await Promise.resolve()
    await flush()
    const main = () =>
      c.querySelector('[data-part="stage"] > [data-scope="tile"]')!.getAttribute('data-pid')
    expect(main()).toBe('kofi')
    p.value = p.value.map((x) => ({ ...x, isSpeaking: x.id === 'mei' }))
    await flush()
    expect(main()).toBe('kofi')
    vi.advanceTimersByTime(1500)
    await flush()
    expect(main()).toBe('mei')
    vi.useRealTimers()
  }
}

export function meetingTheControlBarIsAn({ key, mount }: MeetingContext) {
  return async () => {
    const { container: c } = mount(() => <ControlBar mic camera onToggle={() => {}} />)
    await tick()
    const bar = c.querySelector('[role="toolbar"]')!
    const items = [...bar.querySelectorAll<HTMLElement>('button')]
    expect(items.filter((b) => b.tabIndex === 0).length).toBe(1)
    items[0]!.focus()
    key(items[0]!, 'ArrowRight')
    expect(document.activeElement).toBe(items[1])
    expect(items[1]!.tabIndex).toBe(0)
    expect(items[0]!.tabIndex).toBe(-1)
    key(items[1]!, 'End')
    expect(document.activeElement!.getAttribute('aria-label')).toBe('Leave meeting')
    key(document.activeElement!, 'ArrowRight')
    expect(document.activeElement).toBe(items[0])
  }
}

export function meetingTogglesPressLabelCallBack({ room, press, said }: MeetingContext) {
  return async () => {
    const onMic = vi.fn()
    const onLeave = vi.fn()
    const c = room({ onMic, onLeave })
    const mic = c.querySelector<HTMLElement>('[data-kind="device"]')!
    expect(mic.getAttribute('aria-pressed')).toBe('true')
    mic.click()
    await flush()
    expect(mic.getAttribute('aria-pressed')).toBe('false')
    expect(mic.textContent).toBe('Unmute')
    expect(onMic).toHaveBeenCalledWith(false)
    expect(await said()).toBe('Microphone off')
    expect(
      c.querySelector('[data-scope="pip"] [data-scope="tile"]')!.getAttribute('aria-label'),
    ).toContain('muted')
    press(c, 'Leave meeting')
    expect(onLeave).toHaveBeenCalled()
  }
}

export function meetingSharingForcesPresentationWithStop({ room, stage, press }: MeetingContext) {
  return async () => {
    const c = room()
    press(c, 'Share screen')
    await flush()
    expect(stage(c).getAttribute('data-layout')).toBe('presentation')
    expect(c.textContent).toContain('You are presenting')
    press(c, 'Stop sharing')
    await flush()
    expect(stage(c).getAttribute('data-layout')).toBe('gallery')
    const side = c.querySelector<HTMLElement>('[data-part="sidebar"]')!
    expect(side.hidden).toBe(true)
    press(c, 'People')
    await flush()
    expect(side.hidden).toBe(false)
    expect(side.querySelectorAll('[data-part="people"] li').length).toBe(PEOPLE.length + 1)
    press(c, 'Close panel')
    await flush()
    expect(side.hidden).toBe(true)
  }
}

export function meetingCompactSpeakerNoSwitcherLeave({ room, stage, press }: MeetingContext) {
  return async () => {
    const c = room({ compact: true })
    expect(stage(c).getAttribute('data-layout')).toBe('speaker')
    expect(c.querySelector('[role="radiogroup"]')).toBeNull()
    expect(c.querySelector('[data-part="leave"]')!.hasAttribute('data-icon-only')).toBe(true)
    press(c, 'More options')
    await flush()
    expect(c.querySelector<HTMLElement>('[data-part="sidebar"]')!.hidden).toBe(false)
  }
}

export function meetingMediaIsASlotA({ room, key, said }: MeetingContext) {
  return async () => {
    const c = room({ video: () => <video /> })
    expect(c.querySelector('[data-pid="kofi"] video')).not.toBeNull()
    expect(c.querySelector('[data-pid="raj"] video')).toBeNull()
    await tick()
    const pipEl = c.querySelector<HTMLElement>('[data-scope="pip"]')!
    key(pipEl, 'ArrowLeft')
    expect(await said()).toBe('Self view moved to bottom left')
    key(pipEl, 'ArrowUp')
    expect(await said()).toBe('Self view moved to top left')
  }
}

export function meetingPrejoinMeterFromLevelDevice({ press, mount }: MeetingContext) {
  return async () => {
    const onJoin = vi.fn()
    const onDevice = vi.fn()
    const { container: c } = mount(() => (
      <Prejoin
        name="Jo"
        level={0.5}
        onJoin={onJoin}
        onDevice={onDevice}
        devices={{
          mics: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        }}
      />
    ))
    await tick()
    const m = c.querySelector<HTMLElement>('[data-part="meter"]')!
    expect(m.querySelectorAll('i').length).toBe(16)
    expect(m.querySelectorAll('[data-on]').length).toBe(8)
    m.style.setProperty('--level', '1')
    await tick()
    expect(m.getAttribute('aria-valuenow')).toBe('16')
    const sel = c.querySelector('select')!
    sel.value = 'b'
    fireEvent.change(sel)
    expect(onDevice).toHaveBeenCalledWith('mic', 'b')
    press(c, 'Join now')
    expect(onJoin).toHaveBeenCalledWith('Jo')
    expect(
      mount(() => <Prejoin joining />).container.querySelector('[data-loading]'),
    ).not.toBeNull()
  }
}

export function meetingLobbyIsAStatusCountdown({ press, mount }: MeetingContext) {
  return async () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'Date', 'setTimeout', 'clearTimeout'],
    })
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
    vi.advanceTimersByTime(3000)
    await flush()
    vi.advanceTimersByTime(70)
    expect(
      document.querySelector('[data-scope="announcer"][aria-live="polite"]')!.textContent,
    ).toBe('Starts in 1 minute')
    vi.advanceTimersByTime(60000)
    await flush()
    expect(done).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  }
}

export function meetingScheduledLobbyJoinStaysDisabledUntil({ mount }: MeetingContext) {
  return async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const t0 = Date.now()
    const { container: c } = mount(() => (
      <ScheduledLobby title="Q4" to={t0 + 2000} now={t0} opensAt="10:50" />
    ))
    const join = [...c.querySelectorAll('button')].find((b) => b.textContent === 'Join')!
    expect(join.disabled).toBe(true)
    await Promise.resolve()
    vi.advanceTimersByTime(3000)
    await flush()
    expect(join.disabled).toBe(false)
    vi.useRealTimers()
  }
}
