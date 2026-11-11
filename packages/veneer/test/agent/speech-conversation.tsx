import { fireEvent } from '@testing-library/dom'
import { flush, render } from '@kerf-js/core/test'
import { type DictationEngine, type DictationEvents } from '@kerf-js/veneer-core'
import { Toaster } from '../../src/Toast'
import { Conversation } from '../../src/agent/Conversation'
import { SpeechInput } from '../../src/agent/SpeechInput'
import { wait } from '../timers.mjs'
import { button, said } from './support'

function fakeEngine() {
  let on: DictationEvents
  const calls: string[] = []
  const engine = (e: DictationEvents): DictationEngine => {
    on = e
    return {
      start: (m) => {
        calls.push(`start:${m ?? ''}`)
        e.onState('listening')
      },
      stop: () => {
        calls.push('stop')
        e.onState('idle')
      },
    }
  }
  return {
    engine,
    calls,
    get on() {
      return on
    },
  }
}

export function registerSpeechInputOneButtonTheSweep() {
  test('SpeechInput: one button, the sweep held, grey then ink words, then Insert', async () => {
    const fake = fakeEngine()
    const got: string[] = []
    const { container: c } = render(() => (
      <>
        <Toaster />
        <SpeechInput
          mics={[{ value: 'm', label: 'Mic' }]}
          engine={fake.engine}
          onInsert={(t) => got.push(t)}
        />
      </>
    ))
    await flush()
    const rec = button(c, 'Start dictation')
    rec.click()
    await flush()
    expect(button(c, 'Stop dictation')).toBe(rec)
    expect(rec.getAttribute('aria-pressed')).toBe('true')
    expect(c.querySelector('[data-scope="speech"]')!.getAttribute('data-state')).toBe('listening')
    expect(c.querySelector('[data-part="strip"]')!.hasAttribute('data-pin')).toBe(true)
    expect(c.querySelectorAll('[data-part="wave"] i').length).toBe(40)
    fake.on.onTranscript('Move the crit', 'to Thu')
    await flush()
    expect(c.querySelector('[data-part="interim"]')!.textContent).toBe('to Thu')
    expect(button(c, 'Insert into message').disabled).toBe(true)
    fake.on.onLevel(0.5)
    await flush()
    rec.click()
    await flush()
    expect(fake.calls).toEqual(['start:', 'stop'])
    expect(c.querySelector('[data-part="strip"]')!.hasAttribute('data-pin')).toBe(false)
    button(c, 'Insert into message').click()
    expect(got).toEqual(['Move the crit to Thu'])
  })
  test('a blocked mic is a caution Alert with the fix, announced', async () => {
    const fake = fakeEngine()
    const { container: c } = render(() => (
      <>
        <Toaster />
        <SpeechInput
          mics={[]}
          engine={(e) => {
            const x = fake.engine(e)
            return { ...x, start: () => e.onState('blocked') }
          }}
        />
      </>
    ))
    await flush()
    button(c, 'Start dictation').click()
    await flush()
    await wait()
    expect(c.textContent).toContain('The browser is blocking the microphone')
    expect(said(c, true)).toContain('Microphone blocked')
    expect(button(c, 'Start dictation').disabled).toBe(false)
  })
}

export function registerConversationIsAQuietLog() {
  test('Conversation is a quiet log; Jump to latest appears away from the bottom and goes back', async () => {
    const { container: c } = render(() => (
      <Conversation title="T">
        <p>Hi</p>
      </Conversation>
    ))
    await flush()
    await wait(0)
    const log = c.querySelector<HTMLElement>('[role="log"]')!
    expect(log.getAttribute('aria-live')).toBe('off')
    expect(c.querySelector('h2')!.textContent).toBe('T')
    Object.defineProperty(log, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(log, 'clientHeight', { value: 100, configurable: true })
    log.scrollTop = 500
    fireEvent.scroll(log)
    await flush()
    const jump = button(c, 'Jump to latest')
    expect(jump).toBeTruthy()
    jump.click()
    await flush()
    expect(log.scrollTop).toBe(1000)
    expect(button(c, 'Jump to latest')).toBeUndefined()
    expect(document.activeElement).toBe(log)
  })
}
