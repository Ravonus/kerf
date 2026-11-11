// Browser speech recognition and microphone controls.
/** What dictation is doing. */
export type DictationState = 'idle' | 'listening' | 'blocked' | 'unsupported'
/** What dictation reports: its state, the words so far, and the mic level. */
export interface DictationEvents {
  onState(s: DictationState): void
  onTranscript(final: string, interim: string): void
  onLevel(level: number): void
}
/** Dictation's controls. */
export interface DictationEngine {
  start(mic?: string): void
  stop(): void
}

/** The audio inputs the browser will name (labels are empty until the mic has been allowed once). */
export async function listMics(win: Window) {
  const all = (await win.navigator.mediaDevices?.enumerateDevices?.().catch(() => [])) ?? []
  return all
    .filter((d) => d.kind === 'audioinput' && d.deviceId)
    .map((d) => ({ value: d.deviceId, label: d.label || 'Microphone' }))
}

/** The Web Speech recogniser, which the DOM types don't carry: only what dictation touches. */
export interface Recognizer {
  continuous: boolean
  interimResults: boolean
  onresult:
    | ((e: {
        resultIndex: number
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
      }) => void)
    | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort?(): void
}

/** Web Speech for words, a mic stream and an analyser for the level. Blocked and unsupported are states, not throws. */
export function dictation(
  win: Window & {
    SpeechRecognition?: new () => Recognizer
    webkitSpeechRecognition?: new () => Recognizer
    AudioContext?: typeof AudioContext
  },
  on: DictationEvents,
): DictationEngine {
  let rec: Recognizer | undefined
  let stream: MediaStream | undefined
  let audio: AudioContext | undefined
  let raf = 0
  const release = () => {
    win.cancelAnimationFrame(raf)
    stream?.getTracks().forEach((t) => t.stop())
    void audio?.close?.()
    stream = audio = undefined
    on.onLevel(0)
  }
  const meter = async (mic?: string) => {
    try {
      stream = await win.navigator.mediaDevices?.getUserMedia({
        audio: mic ? { deviceId: mic } : true,
      })
    } catch {
      rec?.abort?.()
      rec = undefined
      release()
      return on.onState('blocked')
    }
    if (!stream || !win.AudioContext) return
    audio = new win.AudioContext()
    const an = audio.createAnalyser()
    audio.createMediaStreamSource(stream).connect(an)
    const buf = new Uint8Array(an.fftSize)
    const tick = () => {
      an.getByteTimeDomainData(buf)
      on.onLevel(Math.min(1, Math.max(...buf.map((v) => Math.abs(v - 128))) / 64))
      raf = win.requestAnimationFrame(tick)
    }
    tick()
  }
  return {
    start(mic) {
      const Speech = win.SpeechRecognition ?? win.webkitSpeechRecognition
      if (!Speech) return on.onState('unsupported')
      const onResult = transcripts(on)
      rec = new Speech()
      rec.continuous = true
      rec.interimResults = true
      rec.onresult = onResult
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          rec = undefined
          release()
          on.onState('blocked')
        }
      }
      rec.onend = () => {
        if (rec) {
          rec = undefined
          release()
          on.onState('idle')
        }
      }
      rec.start()
      on.onState('listening')
      void meter(mic)
    },
    stop() {
      rec?.stop()
      if (!rec) release()
    },
  }
}

function transcripts(on: DictationEvents): NonNullable<Recognizer['onresult']> {
  let final = ''
  return (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]!
      if (r.isFinal) final += r[0]!.transcript
      else interim += r[0]!.transcript
    }
    on.onTranscript(final, interim)
  }
}
