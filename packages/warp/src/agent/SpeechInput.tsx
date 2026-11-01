import { IconMic } from '@weft/icons'
import { announce, dictation, formatClock, listMics, speechWave, type DictationEngine, type DictationEvents, type DictationState } from '@weft/ui-core'
import { derived, onCleanup, onMount, state, untrack } from 'weft'
import { Alert } from '../Alert'
import { Button } from '../Button'
import { Select } from '../Select'
import { use } from '../use'
import { Sweep, useSweep } from './bits'
import '../styles'
import '@weft/ui-core/styles/app/speech.css'

const BARS = Array.from({ length: 40 }, (_, i) => i)
const DEFAULT_MIC = [{ value: '', label: 'Default microphone' }]

export interface SpeechInputProps {
  /** Writes the transcript somewhere: the Prompt's `control.insert`. Nothing is sent until then. */
  onInsert?: (text: string) => void
  mics?: { value: string; label: string }[]
  /** Replaces the browser's speech recognition. */
  engine?: (on: DictationEvents) => DictationEngine
  /** The state and words to start from (a demo, a test). */
  initial?: { state?: DictationState; final?: string; interim?: string; seconds?: number }
}

/**
 * SpeechInput + MicSelector (07 §6.4): the mic Select and input level, then Record and Stop on one button. Listening
 * holds the strip's sweep, moves the wave and counts; words arrive grey while they might change and ink once final. A
 * blocked mic is a caution Alert with the fix, not a dead button. Uses the browser's speech recognition unless given an `engine`.
 */
export function SpeechInput({ onInsert, mics, engine, initial }: SpeechInputProps) {
  const start = untrack(() => initial)
  const mode = state<DictationState>(start?.state ?? 'idle')
  const final = state(start?.final ?? '')
  const interim = state(start?.interim ?? '')
  const seconds = state(start?.seconds ?? 0)
  const level = state(0)
  const found = state<{ value: string; label: string }[]>(DEFAULT_MIC)
  const mic = state('')
  const options = derived(() => mics ?? found.value)
  const on = derived(() => mode.value === 'listening')
  const words = derived(() => (final.value + ' ' + interim.value).trim())
  let root: HTMLElement | undefined
  let wave: HTMLElement | undefined
  let live: DictationEngine | undefined
  let clock: ReturnType<typeof setInterval> | undefined
  useSweep()
  use(speechWave, () => wave, () => level.value)
  const say = (text: string, urgent = false) => announce(root!.ownerDocument, text, urgent)
  const tick = (run: boolean) => {
    clearInterval(clock)
    if (run) { seconds.value = 0; clock = setInterval(() => seconds.value++, 1000) }
  }
  const events: DictationEvents = {
    onState(s) {
      const was = mode.value
      mode.value = s
      tick(s === 'listening')
      if (s === 'listening') say('Listening.')
      if (s === 'blocked') say('Microphone blocked. Allow it from the site settings, then try again.', true)
      if (s === 'unsupported') say('This browser has no dictation.', true)
      if (s === 'idle' && was === 'listening') { final.value = words.value; interim.value = ''; if (final.value) say('Dictation stopped. Transcript ready.') }
    },
    onTranscript(f, i) { final.value = f; interim.value = i },
    onLevel(v) { level.value = v },
  }
  onMount(() => {
    if (!untrack(() => mics)) void listMics(window).then(list => { if (list.length) found.value = list })
    onCleanup(() => { clearInterval(clock); live?.stop() })
  })
  const toggle = () => {
    if (on.value) return live?.stop()
    live ??= (untrack(() => engine) ?? (e => dictation(window, e)))(events)
    final.value = interim.value = ''
    live.start(mic.value || undefined)
  }
  const clear = () => { if (on.value) live?.stop(); final.value = interim.value = '' }
  const insert = () => { onInsert?.(words.value); clear() }
  return (
    <div ref={(n: any) => (root = n)} data-scope="speech" data-state={mode.value}>
      <Select label="Microphone" options={options.value} onChange={(e: Event) => { const s = e.currentTarget as HTMLSelectElement; mic.value = s.value; say(`Microphone: ${s.selectedOptions[0].textContent}`) }} />
      <div data-part="mic">
        <span data-part="level" aria-hidden="true" style={`--level:${level.value}`}><i></i><i></i><i></i></span>
        <span>{mode.value === 'blocked' ? 'Blocked by the browser' : 'Input level'}</span>
      </div>
      <div data-part="strip" data-sweep="" data-phase="idle" data-pin={on.value ? '' : undefined}>
        <Sweep />
        <Button data-icon-only="" tone={on.value ? 'critical' : undefined} aria-pressed={on.value ? 'true' : 'false'} label={on.value ? 'Stop dictation' : 'Start dictation'} onClick={toggle}><IconMic /></Button>
        <span ref={(n: any) => (wave = n)} data-part="wave" data-loop="" aria-hidden="true">{BARS.map(b => <i key={b}></i>)}</span>
        <span data-part="time" role="timer" aria-label="Recording time" data-numeric="">{formatClock(seconds.value)}</span>
      </div>
      <div data-part="transcript" role="log" aria-live="polite" aria-label="Transcript">
        {words.value ? <>{final.value} <span data-part="interim">{interim.value}</span></> : <small>Press the mic and speak. Nothing is sent until you insert it.</small>}
      </div>
      <div>
        <Button size="sm" disabled={!words.value || on.value} onClick={insert}>Insert into message</Button> <Button emphasis="ghost" tone="neutral" size="sm" onClick={clear}>Clear</Button>
      </div>
      {mode.value === 'blocked' && <Alert tone="caution" title="The browser is blocking the microphone">Click the lock in the address bar, allow Microphone, then press the mic again. Typing still works.</Alert>}
      {mode.value === 'unsupported' && <Alert tone="info" title="This browser has no dictation">Typing still works.</Alert>}
    </div>
  )
}
