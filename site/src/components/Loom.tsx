import { flush, onCleanup, onMount, state, watch } from '@weft-js/core'
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

type LoomRun = {
  raf: number
  dead: boolean
  stops: (() => void)[]
  ink: string[]
  repaint: () => void
}

const later = (fn: (d?: IdleDeadline) => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 16)

type LoomScene = {
  canvas: HTMLCanvasElement
  hero: HTMLElement
  cloth: ReturnType<typeof weaver>
  cols: number
  rows: number
  cells: ReturnType<typeof state<number>>[]
  run: LoomRun
}

function animateLoom(scene: LoomScene) {
  const { canvas, hero, cloth, cols, rows, cells, run } = scene
  const start = performance.now()
  let row = 0,
    last = 0,
    awake = 0,
    lx = -1,
    ly = -1,
    gap = 90,
    stride = 2
  const spot = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * cols, ((e.clientY - r.top) / r.height) * rows]
  }
  const point = (e: PointerEvent) => {
    const [x, y] = spot(e)
    if (lx >= 0)
      cloth.pull(x, y, Math.max(-3, Math.min(3, x - lx)), Math.max(-3, Math.min(3, y - ly)))
    lx = x
    ly = y
    awake = performance.now()
  }
  const press = (e: PointerEvent) => {
    const [x, y] = spot(e)
    cloth.shock(x, y)
    awake = performance.now()
  }
  const frame = (now: number) => {
    run.raf = requestAnimationFrame(frame)
    const hot = now - awake < 1500 || cloth.moving()
    if (now - last < (hot ? Math.max(33, gap / 3) : gap)) return
    last = now
    const began = performance.now()
    cloth.step()
    const t = now / 2200,
      clock = (now - start) / 1000
    for (let y = row; y < rows; y += stride)
      for (let x = 0; x < cols; x++) {
        const v = cloth.at(x, y, t, clock),
          cell = cells[y * cols + x]!
        if (cell.value !== v) cell.value = v
      }
    row = (row + 1) % stride
    flush()
    const took = performance.now() - began
    if (took > 8 && stride < 8) {
      stride *= 2
      gap = Math.min(250, gap * 1.5)
      row = 0
    }
  }
  const seen = new IntersectionObserver(([e]) => {
    cancelAnimationFrame(run.raf)
    if (e!.isIntersecting) run.raf = requestAnimationFrame(frame)
  })
  seen.observe(canvas)
  hero.addEventListener('pointermove', point, { passive: true })
  hero.addEventListener('pointerdown', press, { passive: true })
  run.stops.push(() => {
    seen.disconnect()
    hero.removeEventListener('pointermove', point)
    hero.removeEventListener('pointerdown', press)
  })
}

/** The hero's page colour decides the ramp, so a named theme gets the right one whatever its name. A 1×1 canvas reads
 * any CSS colour (oklch included) back as sRGB. */
const inks = (hero: HTMLElement) => {
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  probe.fillStyle = getComputedStyle(hero).backgroundColor
  probe.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? LIGHT_COLOURS : COLOURS
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

function buildLoom(canvas: HTMLCanvasElement, run: LoomRun) {
  const CHUNK = 400
  const paint = canvas.getContext('2d', { alpha: true })!
  const { rect, cols, rows } = measure(canvas)
  const hero = canvas.parentElement!
  // In the room right of the words; under 900px the hero gives it a band of its own above them (site.css).
  const words = hero.querySelector('[data-part="say"]')!.getBoundingClientRect()
  const room = (rect.right - words.right) / rect.width
  const wide = rect.width >= 900
  const size = wide ? Math.min(0.96, (room * cols * 0.86) / rows) : 0.96
  const cloth = weaver(cols, rows, null, threads(cols, rows, 0.2, wide ? 1 - room / 2 : 0.5, size))
  const total = cols * rows
  const cells: ReturnType<typeof state<number>>[] = []
  const fill = (x: number, y: number, v: number) => {
    paint.clearRect(x, y, 1, 1)
    paint.fillStyle = run.ink[v]!
    paint.fillRect(x, y, 1, 1)
  }
  run.repaint = () => cells.forEach((c, i) => fill(i % cols, (i / cols) | 0, c.value))
  const slice = (deadline?: IdleDeadline) => {
    if (run.dead) return
    do {
      for (const end = Math.min(total, cells.length + CHUNK); cells.length < end;) {
        const i = cells.length,
          x = i % cols,
          y = (i / cols) | 0
        const cell = state(cloth.at(x, y, 0, 0))
        fill(x, y, cell.value)
        watch(
          () => cell.value,
          (v) => fill(x, y, v),
        )
        cells.push(cell)
      }
    } while (cells.length < total && (deadline?.timeRemaining() ?? 0) > 2)
    if (cells.length < total) return void later(slice)
    canvas.dataset.live = ''
    begin()
  }
  const begin = () => animateLoom({ canvas, hero, cloth, cols, rows, cells, run })
  later(slice)
}

const stop = (run: LoomRun) => {
  run.dead = true
  cancelAnimationFrame(run.raf)
  run.stops.forEach((f) => f())
}

/** Builds the cloth for the hero's size, and builds it again when that size changes, so the mark never stretches. */
function mountLoom(getBox: () => HTMLCanvasElement) {
  if (low()) return
  const canvas = getBox(),
    hero = canvas.parentElement!
  const fresh = (): LoomRun => ({
    raf: 0,
    dead: false,
    stops: [],
    ink: inks(hero),
    repaint: () => {},
  })
  // The poster has the canvas's own box (site.css sizes both), and unlike the canvas it is never resized by the loom.
  const box = hero.querySelector<HTMLElement>('[data-part="poster"]') ?? hero
  let run = fresh(),
    wide = false,
    wait = 0
  const build = () => {
    wide = box.getBoundingClientRect().width >= 900
    later(() => buildLoom(canvas, run))
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
    run.ink = inks(hero)
    run.repaint()
  }
  const themes = new MutationObserver(recolour)
  themes.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  })
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  scheme.addEventListener('change', recolour)
  onCleanup(() => {
    clearTimeout(wait)
    sized.disconnect()
    themes.disconnect()
    scheme.removeEventListener('change', recolour)
    stop(run)
  })
}

/* @weft visible */
/**
 * The logo, woven, behind the hero. Scenery: it never holds up the page. It builds in idle time, runs a few ticks a
 * second until the pointer moves, slows down if a tick costs too much, and on a small machine the poster simply stays.
 */
export function Loom() {
  let box: HTMLCanvasElement | undefined
  onMount(() => mountLoom(() => box!))
  return <canvas ref={(el) => (box = el)} data-site="loom" aria-hidden="true"></canvas>
}
