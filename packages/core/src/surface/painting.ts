import {
  createRoot,
  effect,
  flush,
  type getOwner,
  onCleanup,
  state,
  untrack,
  type State,
} from '@weft-js/core'
import { surfaceText, type PaintedText, type TextHost } from '../surface-text'
import type { FrameTime, SurfaceBackend } from '../surface'
import type { Mounting } from './mount'
import { clock, playing, run, seconds, tickers } from './clock'
import { tokensOf } from './tokens'

type PaintArgs = {
  def: Mounting
  props: Record<string, unknown>
  host: HTMLElement
  canvas: HTMLCanvasElement
  backend: SurfaceBackend
  size: State<{ width: number; height: number }>
  dpr: State<number>
  scale: State<number>
  fps: number
}

function surfaceContext({
  args,
  draws,
  frames,
  texts,
  invalidate,
  paint,
  ticker,
  isStarted,
}: {
  args: PaintArgs
  draws: (() => void)[]
  frames: ((t: FrameTime) => void)[]
  texts: PaintedText[]
  invalidate: () => void
  paint: () => void
  ticker: (force?: boolean) => void
  isStarted: () => boolean
}) {
  const { backend, canvas, host, size, dpr, scale } = args
  const textHost: TextHost = {
    el: host,
    ctx: backend.fields.ctx as TextHost['ctx'],
    invalidate,
    paint,
  }
  return {
    ...backend.fields,
    canvas,
    el: host,
    size,
    dpr,
    scale,
    clock,
    tokens: tokensOf(host),
    draw(fn: () => void) {
      draws.push(fn)
      if (isStarted()) invalidate()
    },
    frame(fn: (t: FrameTime) => void) {
      frames.push(fn)
      if (!tickers.has(ticker)) {
        tickers.add(ticker)
        onCleanup(() => tickers.delete(ticker))
        if (playing.value) run()
      }
    },
    invalidate,
    text(text: Parameters<typeof surfaceText>[1], options: Parameters<typeof surfaceText>[2]) {
      const t = surfaceText(textHost, text, options)
      texts.push(t)
      return t
    },
    decorative: <T>(fn: () => T) => fn(),
  }
}

function watchPaint({
  args,
  tick,
  draws,
  frames,
  texts,
  invalidate,
  isPainting,
  setPainting,
  setStarted,
  getTime,
  visibility,
}: {
  args: PaintArgs
  tick: State<number>
  draws: (() => void)[]
  frames: ((t: FrameTime) => void)[]
  texts: PaintedText[]
  invalidate: () => void
  paint: () => void
  isPainting: () => boolean
  setPainting: (v: boolean) => void
  setStarted: () => void
  getTime: () => FrameTime
  visibility: (seen: boolean) => void
}) {
  const { backend, host } = args
  // Paint and tracking are one effect: `tick` starts a paint, and a run with `painting` false means a source changed.
  setPainting(true)
  effect(
    () => {
      void tick.value
      if (!isPainting()) return invalidate()
      backend.begin?.()
      for (const d of draws) d()
      for (const f of frames) f(getTime())
      for (const t of texts) t.paint()
    },
    () => {},
  )
  setPainting(false)
  setStarted()

  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries) => {
      visibility(entries[entries.length - 1]!.isIntersecting)
    })
    io.observe(host)
    onCleanup(() => io.disconnect())
  }
}

function createPainting(args: PaintArgs, setRepaint: (paint: () => void) => void) {
  const { def, props, fps } = args
  const draws: (() => void)[] = []
  const frames: ((t: FrameTime) => void)[] = []
  const texts: PaintedText[] = []
  const tick = state(0)
  let painting = false,
    started = false,
    booked = 0,
    seen = true,
    stale = false
  const first = Math.floor(seconds * fps) // a surface mounted after a seek starts at that frame
  let time: FrameTime = { frame: first, seconds: first / fps, delta: 0 }

  const paint = () => {
    painting = true
    tick.value = untrack(() => tick.value) + 1
    try {
      flush()
    } finally {
      painting = false
    }
  }
  setRepaint(paint)
  const invalidate = () => {
    booked ||= requestAnimationFrame(() => {
      booked = 0
      if (seen) paint()
      else stale = true
    })
  }
  onCleanup(() => cancelAnimationFrame(booked))

  const ticker = (force?: boolean) => {
    const frame = Math.floor(seconds * fps)
    if (frame === time.frame && !force) return
    time = { frame, seconds: frame / fps, delta: Math.max(0, frame - time.frame) / fps }
    if (seen || force) paint()
    else stale = true
  }

  const s = surfaceContext({
    args,
    draws,
    frames,
    texts,
    invalidate,
    paint,
    ticker,
    isStarted: () => started,
  })

  const cleanup = def.setup(s, props)
  if (cleanup) onCleanup(cleanup)

  watchPaint({
    args,
    tick,
    draws,
    frames,
    texts,
    invalidate,
    paint,
    isPainting: () => painting,
    setPainting: (v) => {
      painting = v
    },
    setStarted: () => {
      started = true
    },
    getTime: () => time,
    visibility: (value) => {
      seen = value
      if (seen && stale) {
        stale = false
        paint()
      }
    },
  })
}

export function bootPainting(
  args: PaintArgs,
  owner: NonNullable<ReturnType<typeof getOwner>>,
  setStop: (stop: () => void) => void,
  setRepaint: (paint: () => void) => void,
) {
  createRoot((dispose) => {
    setStop(dispose)
    createPainting(args, setRepaint)
  }, owner)
}
