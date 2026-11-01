import { flush, onCleanup, onMount, state, watch } from 'weft'
import { COLOURS, threads, weaver } from '../lib/loom'

const low = () => {
  const n = navigator as any
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 4 || n.connection?.saveData || matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* @weft visible */
/**
 * The logo, woven, behind the hero. Scenery: it never holds up the page. It builds in idle time, runs a few ticks a
 * second until the pointer moves, slows down if a tick costs too much, and on a small machine the poster simply stays.
 */
export function Loom() {
  let canvas!: HTMLCanvasElement
  onMount(() => {
    if (low()) return
    let raf = 0, dead = false
    const stops: (() => void)[] = []
    const CHUNK = 400
    const build = () => {
      const paint = canvas.getContext('2d', { alpha: true })!
      const rect = canvas.getBoundingClientRect()
      const CELL = rect.width < 700 ? 8 : 10
      const cols = Math.ceil(rect.width / CELL), rows = Math.ceil(rect.height / CELL)
      canvas.width = cols
      canvas.height = rows
      const hero = canvas.parentElement!
      const cloth = weaver(cols, rows, null, threads(cols, rows, 0.2, rect.width < 900 ? 0.5 : 0.74))
      const total = cols * rows
      const cells: ReturnType<typeof state<number>>[] = []
      const slice = (deadline?: IdleDeadline) => {
        if (dead) return
        do {
          for (const end = Math.min(total, cells.length + CHUNK); cells.length < end;) {
            const i = cells.length, x = i % cols, y = (i / cols) | 0
            const cell = state(cloth.at(x, y, 0, 0))
            paint.fillStyle = COLOURS[cell.value]
            paint.fillRect(x, y, 1, 1)
            watch(() => cell.value, v => { paint.clearRect(x, y, 1, 1); paint.fillStyle = COLOURS[v]; paint.fillRect(x, y, 1, 1) })
            cells.push(cell)
          }
        } while (cells.length < total && deadline && deadline.timeRemaining() > 2)
        if (cells.length < total) return void later(slice)
        canvas.dataset.live = ''
        begin()
      }
      const begin = () => {
        const start = performance.now()
        let row = 0, last = 0, awake = 0, lx = -1, ly = -1, gap = 90, stride = 2
        const spot = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * cols, ((e.clientY - r.top) / r.height) * rows] }
        const point = (e: PointerEvent) => {
          const [x, y] = spot(e)
          if (lx >= 0) cloth.pull(x, y, Math.max(-3, Math.min(3, x - lx)), Math.max(-3, Math.min(3, y - ly)))
          lx = x; ly = y; awake = performance.now()
        }
        const press = (e: PointerEvent) => { const [x, y] = spot(e); cloth.shock(x, y); awake = performance.now() }
        const frame = (now: number) => {
          raf = requestAnimationFrame(frame)
          const hot = now - awake < 1500 || cloth.moving()
          if (now - last < (hot ? Math.max(33, gap / 3) : gap)) return
          last = now
          const began = performance.now()
          cloth.step()
          const t = now / 2200, clock = (now - start) / 1000
          for (let y = row; y < rows; y += stride) for (let x = 0; x < cols; x++) {
            const v = cloth.at(x, y, t, clock), cell = cells[y * cols + x]
            if (cell.value !== v) cell.value = v
          }
          row = (row + 1) % stride
          flush()
          const took = performance.now() - began
          if (took > 8 && stride < 8) { stride *= 2; gap = Math.min(250, gap * 1.5); row = 0 }
        }
        const seen = new IntersectionObserver(([e]) => { cancelAnimationFrame(raf); if (e.isIntersecting) raf = requestAnimationFrame(frame) })
        seen.observe(canvas)
        hero.addEventListener('pointermove', point, { passive: true })
        hero.addEventListener('pointerdown', press, { passive: true })
        stops.push(() => { seen.disconnect(); hero.removeEventListener('pointermove', point); hero.removeEventListener('pointerdown', press) })
      }
      later(slice)
    }
    const later = (fn: (d?: IdleDeadline) => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 16))
    later(build)
    onCleanup(() => { dead = true; cancelAnimationFrame(raf); stops.forEach(f => f()) })
  })
  return <canvas ref={canvas} data-site="loom" aria-hidden="true"></canvas>
}
