import { onCleanup, onMount } from '@weft-js/core'
import { weaver } from '../lib/loom/weaver'
import { COLOURS, LIGHT_COLOURS, threads } from '../lib/loom/threads'

const low = () => {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  return (
    (n.hardwareConcurrency ?? 8) <= 4 ||
    (n.deviceMemory ?? 8) <= 4 ||
    n.connection?.saveData ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** The most the loom works in one go, in ms: a tap or a key never waits longer than this for it. */
const SLICE = 2

const later = (fn: () => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 50)

/** Scenery starts once the page has loaded and gone quiet: nothing the page needs waits behind it. */
const quiet = (fn: () => void) => {
  const go = () => later(fn)
  if (document.readyState === 'complete') go()
  else addEventListener('load', go, { once: true })
}

/** A palette as pixels, `[r, g, b, a]` packed the way a little-endian ImageData reads them. */
const pack = (colours: number[][]) =>
  Uint32Array.from(
    colours,
    ([r = 0, g = 0, b = 0, a = 0]) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0,
  )
const DARK = pack(COLOURS)
const LIGHT = pack(LIGHT_COLOURS)

type LoomRun = {
  raf: number
  dead: boolean
  stops: (() => void)[]
  lut: Uint32Array
  repaint: () => void
}

/** The cloth's cells: a palette index each, and the pixels they paint. */
type Cloth = {
  canvas: HTMLCanvasElement
  hero: HTMLElement
  weave: ReturnType<typeof weaver>
  cols: number
  rows: number
  ink: Uint8Array
  px: Uint32Array
  put: (from: number, to: number) => void
  run: LoomRun
}

/** Pointer moves pull the cloth and a press shocks it; both wake the loom to full speed for a while. */
function feel(cloth: Cloth, wake: () => void) {
  const { canvas, hero, weave, cols, rows, run } = cloth
  let lx = -1,
    ly = -1
  const spot = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * cols, ((e.clientY - r.top) / r.height) * rows]
  }
  const point = (e: PointerEvent) => {
    const [x, y] = spot(e)
    if (lx >= 0)
      weave.pull(x, y, Math.max(-3, Math.min(3, x - lx)), Math.max(-3, Math.min(3, y - ly)))
    lx = x
    ly = y
    wake()
  }
  const press = (e: PointerEvent) => {
    weave.shock(...spot(e))
    wake()
  }
  hero.addEventListener('pointermove', point, { passive: true })
  hero.addEventListener('pointerdown', press, { passive: true })
  run.stops.push(() => {
    hero.removeEventListener('pointermove', point)
    hero.removeEventListener('pointerdown', press)
  })
}

/**
 * A pass over the cloth runs a few rows a frame, never more than `SLICE` ms, and paints just those rows. A new pass
 * starts a few times a second, or every other frame or so while the pointer is on it.
 */
function animateLoom(cloth: Cloth) {
  const { canvas, weave, cols, rows, ink, px, put, run } = cloth
  const start = performance.now()
  let row = 0,
    last = 0,
    awake = 0,
    t = 0,
    clock = 0
  const frame = (now: number) => {
    run.raf = requestAnimationFrame(frame)
    if (row === 0) {
      const hot = now - awake < 1500 || weave.moving()
      if (now - last < (hot ? 33 : 90)) return
      last = now
      weave.step()
      t = now / 2200
      clock = (now - start) / 1000
    }
    const from = row,
      end = performance.now() + SLICE
    for (; row < rows && performance.now() < end; row++)
      for (let x = 0, i = row * cols; x < cols; x++, i++) {
        const v = weave.at(x, row, t, clock)
        if (ink[i] !== v) px[i] = run.lut[(ink[i] = v)]!
      }
    put(from, row)
    if (row >= rows) row = 0
  }
  feel(cloth, () => (awake = performance.now()))
  const seen = new IntersectionObserver(([e]) => {
    cancelAnimationFrame(run.raf)
    if (e!.isIntersecting) run.raf = requestAnimationFrame(frame)
  })
  seen.observe(canvas)
  run.stops.push(() => seen.disconnect())
}

/** The hero's page colour decides the ramp, so a named theme gets the right one whatever its name. A 1×1 canvas reads
 * any CSS colour (oklch included) back as sRGB. */
const inks = (hero: HTMLElement) => {
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  probe.fillStyle = getComputedStyle(hero).backgroundColor
  probe.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? LIGHT : DARK
}

/**
 * Whole square cells: the canvas takes `cols × rows` cells and the hero clips the last part-cell. Its width is a share
 * of the hero's and its height follows from its own ratio, so as the page resizes the cloth grows and shrinks evenly.
 */
function measure(canvas: HTMLCanvasElement) {
  canvas.style.inlineSize = canvas.style.blockSize = ''
  const rect = canvas.getBoundingClientRect()
  const CELL = rect.width < 700 ? 8 : 10
  const cols = Math.ceil(rect.width / CELL),
    rows = Math.ceil(rect.height / CELL)
  canvas.width = cols
  canvas.height = rows
  canvas.style.inlineSize = `${((cols * CELL) / rect.width) * 100}%`
  canvas.style.blockSize = 'auto'
  return { rect, cols, rows }
}

/** Scaling keeps the shape, so the cloth is only rewoven once it no longer fits its space or the layout changes. */
const fits = (canvas: HTMLCanvasElement, box: DOMRect, wide: boolean) => {
  const { height } = canvas.getBoundingClientRect()
  // Beside the words the hero clips a taller cloth; in the band above them it would reach the heading.
  const room = wide ? 1.15 : 1.04
  return box.width >= 900 === wide && height >= box.height - 1 && height <= box.height * room
}

/** Where the mark sits and how big: in the room right of the words, or under 900px in a band above them (site.css). */
function frameOf(canvas: HTMLCanvasElement) {
  const { rect, cols, rows } = measure(canvas)
  const words = canvas.parentElement!.querySelector('[data-part="say"]')!.getBoundingClientRect()
  const room = (rect.right - words.right) / rect.width
  const wide = rect.width >= 900
  const size = wide ? Math.min(0.96, (room * cols * 0.86) / rows) : 0.96
  return { cols, rows, centre: wide ? 1 - room / 2 : 0.5, size }
}

/**
 * The cloth for the canvas's size, set up and then woven in idle time, each step its own task: measuring, laying the
 * threads, the lattice, then the cells a slice at a time. Then it's shown and set moving.
 */
function buildLoom(canvas: HTMLCanvasElement, run: LoomRun) {
  const { cols, rows, centre, size } = frameOf(canvas)
  later(() => {
    if (run.dead) return
    const mark = threads(cols, rows, 0.2, centre, size)
    later(() => {
      if (!run.dead) weaveLoom(canvas, run, weaver(cols, rows, null, mark))
    })
  })
}

function weaveLoom(canvas: HTMLCanvasElement, run: LoomRun, weave: ReturnType<typeof weaver>) {
  const { width: cols, height: rows } = canvas
  const paint = canvas.getContext('2d')!
  const image = paint.createImageData(cols, rows)
  const px = new Uint32Array(image.data.buffer)
  const ink = new Uint8Array(cols * rows)
  const put = (from: number, to: number) => {
    if (to > from) paint.putImageData(image, 0, 0, 0, from, cols, to - from)
  }
  run.repaint = () => {
    for (let i = 0; i < ink.length; i++) px[i] = run.lut[ink[i]!]!
    put(0, rows)
  }
  let row = 0
  const slice = () => {
    if (run.dead) return
    for (const end = performance.now() + SLICE; row < rows && performance.now() < end; row++)
      for (let x = 0, i = row * cols; x < cols; x++, i++)
        px[i] = run.lut[(ink[i] = weave.at(x, row, 0, 0))]!
    if (row < rows) return void later(slice)
    put(0, rows)
    canvas.dataset.live = ''
    animateLoom({ canvas, hero: canvas.parentElement!, weave, cols, rows, ink, px, put, run })
  }
  later(slice)
}

const stop = (run: LoomRun) => {
  run.dead = true
  cancelAnimationFrame(run.raf)
  run.stops.forEach((f) => f())
}

/** Builds the cloth for the hero's size, and builds it again when that size changes, so the mark never stretches. */
function startLoom(canvas: HTMLCanvasElement) {
  const hero = canvas.parentElement!
  const fresh = (): LoomRun => ({ raf: 0, dead: false, stops: [], lut: DARK, repaint() {} })
  // The poster has the canvas's own box (site.css sizes both), and unlike the canvas it is never resized by the loom.
  const box = hero.querySelector<HTMLElement>('[data-part="poster"]') ?? hero
  let run = fresh(),
    wide = false,
    wait = 0
  const build = () => {
    const now = run
    later(() => {
      if (now.dead) return
      now.lut = inks(hero)
      later(() => {
        if (now.dead) return
        wide = box.getBoundingClientRect().width >= 900
        buildLoom(canvas, now)
      })
    })
  }
  const rebuild = () => {
    if (fits(canvas, box.getBoundingClientRect(), wide)) return
    stop(run)
    delete canvas.dataset.live
    run = fresh()
    build()
  }
  let first = true
  const sized = new ResizeObserver(() => {
    if (first) {
      first = false
      build()
      return
    }
    clearTimeout(wait)
    wait = window.setTimeout(rebuild, 300)
  })
  sized.observe(box)
  const recolour = () => {
    run.lut = inks(hero)
    run.repaint()
  }
  const themes = new MutationObserver(recolour)
  themes.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  })
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  scheme.addEventListener('change', recolour)
  return () => {
    clearTimeout(wait)
    sized.disconnect()
    themes.disconnect()
    scheme.removeEventListener('change', recolour)
    stop(run)
  }
}

/* @weft visible */
/**
 * The logo, woven, behind the hero. Scenery: it never holds up the page. It waits until the page has loaded and is
 * idle, weaves in slices of a few ms, runs a few passes a second until the pointer moves, and on a small machine the
 * poster simply stays.
 */
export function Loom() {
  let box: HTMLCanvasElement | undefined
  onMount(() => {
    if (low()) return
    let gone = false,
      off = () => {}
    quiet(() => {
      if (!gone) off = startLoom(box!)
    })
    onCleanup(() => {
      gone = true
      off()
    })
  })
  return <canvas ref={(el) => (box = el)} data-site="loom" aria-hidden="true"></canvas>
}
