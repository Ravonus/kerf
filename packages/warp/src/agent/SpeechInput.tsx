import { MicIcon } from '@weft-js/warp-icons'
import {
  announce,
  dictation,
  formatClock,
  listMics,
  speechWave,
  type DictationEngine,
  type DictationEvents,
  type DictationState,
} from '@weft-js/warp-core'
import { derived, onCleanup, onMount, state, untrack } from '@weft-js/core'
import { Alert } from '../Alert'
import { Button } from '../Button'
import { Select } from '../Select'
import { use } from '@weft-js/warp-core/weft'
import { Sweep, useSweep } from './bits'
import '../styles'
import '@weft-js/warp-core/styles/app/speech.css'

const BARS = Array.from({ length: 40 }, (_, i) => i)
const DEFAULT_MIC = [{ value: '', label: 'Default microphone' }]

/** Props for SpeechInput. */
export interface SpeechInputProps {
  /** Writes the transcript somewhere: the Prompt's `control.insert`. Nothing is sent until then. */
  onInsert?: (text: string) => void
  mics?: { value: string; label: string }[]
  /** Replaces the browser's speech recognition. */
  engine?: (on: DictationEvents) => DictationEngine
  /** The state and words to start from (a demo, a test). */
  initial?:
    | { state?: DictationState | undefined; final?: string; interim?: string; seconds?: number }
    | undefined
}

/**
 * SpeechInput + MicSelector (07 §6.4): the mic Select and input level, then Record and Stop on one button. Listening
 * holds the strip's sweep, moves the wave and counts; words arrive grey while they might change and ink once final. A
 * blocked mic is a caution Alert with the fix, not a dead button. Uses the browser's speech recognition unless given an `engine`.
 */
export function SpeechInput({ onInsert, mics, engine, initial }: SpeechInputProps) {
  const view = speechState({
    initial: () => initial,
    mics: () => mics,
    engine: () => engine,
    onInsert: (words) => onInsert?.(words()),
  })
  return (
    <div ref={(n) => (view.refs.root = n)} data-scope="speech" data-state={view.mode.value}>
      <Select
        label="Microphone"
        options={view.options.value}
        onChange={(e: Event) => {
          const s = e.currentTarget as HTMLSelectElement
          view.mic.value = s.value
          view.say(`Microphone: ${s.selectedOptions[0]!.textContent}`)
        }}
      />
      <div data-part="mic">
        <span data-part="level" aria-hidden="true" style={`--level:${view.level.value}`}>
          <i></i>
          <i></i>
          <i></i>
        </span>
        <span>{view.mode.value === 'blocked' ? 'Blocked by the browser' : 'Input level'}</span>
      </div>
      <div data-part="strip" data-sweep="" data-pin={view.on.value ? '' : undefined}>
        <Sweep />
        <Button
          data-icon-only=""
          tone={view.on.value ? 'critical' : undefined}
          aria-pressed={view.on.value ? 'true' : 'false'}
          label={view.on.value ? 'Stop dictation' : 'Start dictation'}
          onClick={view.toggle}
        >
          <MicIcon />
        </Button>
        <span ref={(n) => (view.refs.wave = n)} data-part="wave" data-loop="" aria-hidden="true">
          {BARS.map((b) => (
            <i key={b}></i>
          ))}
        </span>
        <span data-part="time" role="timer" aria-label="Recording time" data-numeric="">
          {formatClock(view.seconds.value)}
        </span>
      </div>
      <div data-part="transcript" role="log" aria-live="polite" aria-label="Transcript">
        {view.words.value ? (
          <>
            {view.final.value} <span data-part="interim">{view.interim.value}</span>
          </>
        ) : (
          <small>Press the mic and speak. Nothing is sent until you insert it.</small>
        )}
      </div>
      <div>
        <Button size="sm" disabled={!view.words.value || view.on.value} onClick={view.insert}>
          Insert into message
        </Button>{' '}
        <Button emphasis="ghost" tone="neutral" size="sm" onClick={view.clear}>
          Clear
        </Button>
      </div>
      {view.mode.value === 'blocked' && (
        <Alert tone="caution" title="The browser is blocking the microphone">
          Click the lock in the address bar, allow Microphone, then press the mic again. Typing
          still works.
        </Alert>
      )}
      {view.mode.value === 'unsupported' && (
        <Alert tone="info" title="This browser has no dictation">
          Typing still works.
        </Alert>
      )}
    </div>
  )
}

function speechState({
  initial,
  mics,
  engine,
  onInsert,
}: {
  initial: () => SpeechInputProps['initial']
  mics: () => SpeechInputProps['mics']
  engine: () => SpeechInputProps['engine']
  onInsert: (words: () => string) => void
}) {
  const start = untrack(initial)
  const mode = state<DictationState>(start?.state ?? 'idle')
  const final = state(start?.final ?? '')
  const interim = state(start?.interim ?? '')
  const seconds = state(start?.seconds ?? 0)
  const level = state(0)
  const found = state<{ value: string; label: string }[]>(DEFAULT_MIC)
  const mic = state('')
  const options = derived(() => mics() ?? found.value)
  const on = derived(() => mode.value === 'listening')
  const words = derived(() => (final.value + ' ' + interim.value).trim())
  const refs: {
    root?: HTMLElement | undefined
    wave?: HTMLElement | undefined
    live?: DictationEngine | undefined
    clock?: ReturnType<typeof setInterval> | undefined
  } = {}
  useSweep()
  use(
    speechWave,
    () => refs.wave,
    () => level.value,
  )
  const data = { mode, final, interim, seconds, level, found, mic, options, on, words, refs }
  const actions = speechControl({ d: data, mics, engine, onInsert })
  return { ...data, ...actions }
}
type SpeechData = {
  mode: ReturnType<typeof state<DictationState>>
  final: ReturnType<typeof state<string>>
  interim: ReturnType<typeof state<string>>
  seconds: ReturnType<typeof state<number>>
  level: ReturnType<typeof state<number>>
  found: ReturnType<typeof state<{ value: string; label: string }[]>>
  mic: ReturnType<typeof state<string>>
  on: { readonly value: boolean }
  words: { readonly value: string }
  refs: {
    root?: HTMLElement | undefined
    wave?: HTMLElement | undefined
    live?: DictationEngine | undefined
    clock?: ReturnType<typeof setInterval> | undefined
  }
}
function speechControl({
  d,
  mics,
  engine,
  onInsert,
}: {
  d: SpeechData
  mics: () => SpeechInputProps['mics']
  engine: () => SpeechInputProps['engine']
  onInsert: (words: () => string) => void
}) {
  const { mode, final, interim, seconds, level, found, mic, on, words, refs } = d
  const say = (text: string, urgent = false) => announce(refs.root!.ownerDocument, text, urgent)
  const tick = (run: boolean) => {
    clearInterval(refs.clock)
    if (run) {
      seconds.value = 0
      refs.clock = setInterval(() => seconds.value++, 1000)
    }
  }
  const events: DictationEvents = {
    onState(s) {
      const was = mode.value
      mode.value = s
      tick(s === 'listening')
      if (s === 'listening') say('Listening.')
      if (s === 'blocked')
        say('Microphone blocked. Allow it from the site settings, then try again.', true)
      if (s === 'unsupported') say('This browser has no dictation.', true)
      if (s === 'idle' && was === 'listening') {
        final.value = words.value
        interim.value = ''
        if (final.value) say('Dictation stopped. Transcript ready.')
      }
    },
    onTranscript(f, i) {
      final.value = f
      interim.value = i
    },
    onLevel(v) {
      level.value = v
    },
  }
  onMount(() => {
    if (!untrack(mics))
      void listMics(window).then((list) => {
        if (list.length) found.value = list
      })
    onCleanup(() => {
      clearInterval(refs.clock)
      refs.live?.stop()
    })
  })
  const toggle = () => {
    if (on.value) return refs.live?.stop()
    refs.live ??= (untrack(engine) ?? ((e) => dictation(window, e)))(events)
    final.value = interim.value = ''
    refs.live.start(mic.value || undefined)
  }
  const clear = () => {
    if (on.value) refs.live?.stop()
    final.value = interim.value = ''
  }
  const insert = () => {
    onInsert(() => words.value)
    clear()
  }
  return { say, toggle, clear, insert }
}
