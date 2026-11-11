import { fireEvent } from '@testing-library/dom'
import { state } from '@kerf/core'
import { flush, render } from '@kerf/core/test'
import type { CursorPeer, Peer } from '@kerf/veneer-core'
import { Toaster } from '../../src/Toast'
import { Cursors } from '../../src/collab/Cursors'
import { LockedField } from '../../src/collab/Lock'
import { Following, PresenceStack } from '../../src/collab/PresenceStack'
import { SectionPeers, ViewportRail } from '../../src/collab/ViewportRail'
import { wait } from '../timers.mjs'
import { ana, kofi, mei, polite, q, qa, tick } from './support'

function registerOverflowOpensAListFollow() {
  test('overflow opens a list; follow toggles; joins are summarised', async () => {
    const peers = state([mei, ana])
    const got: (Peer | null)[] = []
    const { container: c } = render(() => (
      <>
        <PresenceStack peers={peers} max={1} onFollow={(p) => got.push(p)} following="mei" />
        <Toaster />
      </>
    ))
    await tick()
    const follow = qa<HTMLButtonElement>(c, 'button[aria-pressed]')[0]
    expect(follow!.getAttribute('aria-pressed')).toBe('true')
    follow!.click()
    expect(got).toEqual([null])
    expect(q(c, '[data-part="more"]').textContent).toBe('+1')
    q(c, '[data-part="more"]').click()
    await flush()
    expect(q(c, '[data-part="more"]').getAttribute('aria-expanded')).toBe('true')
    expect(q(c, '[role="dialog"] ul').textContent).toContain('Ana Ruiz')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    peers.value = [...peers.value, kofi]
    await flush()
    vi.advanceTimersByTime(1100)
    vi.useRealTimers()
    await wait()
    expect(polite()).toBe('Kofi joined')
  })
  test('following shows the flag and the frame; a wheel or Esc stops it', async () => {
    const peer = state<Peer | null>(mei)
    let stops = 0
    const { container: c } = render(() => (
      <Following
        peer={peer.value}
        onStop={() => {
          stops++
          peer.value = null
        }}
      >
        <p>doc</p>
      </Following>
    ))
    await tick()
    expect(q(c, '[data-scope="follow-flag"]').textContent).toBe('Following Mei · Esc to stop')
    const frame = q(c, '[data-following]')
    expect(frame.dataset.presenceColor).toBe('3')
    fireEvent.keyDown(document, { key: 'Escape' })
    await flush()
    expect(stops).toBe(1)
    expect(c.querySelector('[data-following]')).toBeNull()
    peer.value = ana
    await flush()
    await tick()
    fireEvent.wheel(frame)
    await flush()
    expect(stops).toBe(2)
  })
}

function registerCursorsTakeTheirPlaceFrom() {
  test('cursors take their place from the anchor, hide without one, and fade when idle', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const peers = state<CursorPeer[]>([
      { ...mei, cursor: { anchor: 'p', x: 0.5, y: 0 } },
      { ...ana, cursor: { anchor: 'none', x: 0, y: 0 } },
    ])
    const { container: c } = render(() => (
      <div>
        <p data-anchor="p">text</p>
        <Cursors peers={peers} idle={5000} />
      </div>
    ))
    await tick()
    const anchor = q(c, '[data-anchor]')
    anchor.getBoundingClientRect = () => ({ left: 100, top: 40, width: 200, height: 20 }) as DOMRect
    q(c, '[data-scope="cursors"]').getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 500, height: 300 }) as DOMRect
    peers.value = [
      { ...peers.value[0]!, cursor: { anchor: 'p', x: 0.25, y: 0.5 } },
      peers.value[1]!,
    ]
    await flush()
    await tick()
    const cur = q(c, '[data-peer="mei"]')
    expect(cur.style.getPropertyValue('--_x')).toBe('150px')
    expect(cur.style.getPropertyValue('--_y')).toBe('50px')
    expect(q(c, '[data-peer="ana"]').hidden).toBe(true)
    expect(q(c, '[data-scope="cursors"]').getAttribute('aria-hidden')).toBe('true')
    vi.advanceTimersByTime(6000)
    expect(cur.hasAttribute('data-idle')).toBe(true)
    vi.useRealTimers()
  })
  test('a locked field is readonly, not disabled, and described by the chip', () => {
    const { container: c } = render(() => <LockedField peer={kofi} label="Owner" value="Kofi" />)
    const input = q<HTMLInputElement>(c, 'input')
    expect(input.readOnly).toBe(true)
    expect(input.disabled).toBe(false)
    expect(input.getAttribute('aria-describedby')).toContain(q(c, '[data-scope="lock"]').id)
    expect(q(c, '[data-scope="lock"]').textContent).toContain('Kofi is editing')
  })
  test('the rail is a picture, or jump buttons; section peers name who is here', () => {
    const jumped: string[] = []
    const { container: c } = render(() => (
      <>
        <ViewportRail
          peers={[{ ...mei, top: 0.1, height: 0.2 }]}
          onJump={(p) => jumped.push(p.id)}
        />
        <ViewportRail peers={[]} label="Still" />
        <SectionPeers peers={[mei, ana]} />
      </>
    ))
    const box = q(c, '[data-scope="viewport-rail"] i')
    expect(box.style.getPropertyValue('--_t')).toBe('0.1')
    fireEvent.keyDown(box, { key: 'Enter' })
    box.click()
    expect(jumped).toEqual(['mei', 'mei'])
    expect(qa(c, '[data-scope="viewport-rail"]')[1]!.getAttribute('role')).toBe('img')
    expect(q(c, '[data-scope="section-peers"]').getAttribute('aria-label')).toBe(
      'Mei and Ana are here',
    )
  })
}

export function registerPresence() {
  describe('presence', () => {
    registerOverflowOpensAListFollow()
    registerCursorsTakeTheirPlaceFrom()
  })
}
