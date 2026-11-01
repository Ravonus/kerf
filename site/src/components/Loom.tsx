import { flush, onCleanup, onMount, state, stats, watch } from 'weft'
import { COLOURS, threads, weaver } from '../lib/loom'

const fmt = (n: number) => n.toLocaleString('en-US')

/** The word, drawn once at four times the cell grid and averaged: 0–1 coverage per cell, so its edges dither clean. */
function coverage(word: HTMLElement, cols: number, rows: number, cell: number, field: DOMRect) {
  const SS = 4
  const c = document.createElement('canvas')
  c.width = cols * SS
  c.height = rows * SS
  const g = c.getContext('2d', { willReadFrequently: true })!
  const s = getComputedStyle(word)
  const scale = SS / cell
  g.font = `${s.fontStyle} ${s.fontWeight} ${parseFloat(s.fontSize) * scale}px ${s.fontFamily}`
  g.letterSpacing = `${parseFloat(s.letterSpacing) * scale}px`
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#fff'
  const r = document.createRange()
  r.selectNodeContents(word)
  const box = r.getBoundingClientRect()
  const m = g.measureText(word.textContent!)
  const y = (box.top - field.top) * scale + (box.height * scale + m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
  g.fillText(word.textContent!, (box.left - field.left) * scale, y)
  const px = g.getImageData(0, 0, c.width, c.height).data
  const out = new Float32Array(cols * rows)
  for (let i = 3; i < px.length; i += 4) {
    const p = (i - 3) / 4
    out[(((p / c.width) | 0) >> 2) * cols + ((p % c.width) >> 2)] += px[i] / (255 * SS * SS)
  }
  return out
}

/* @weft visible */
/** Each cell is a `state` with a `watch` that paints one pixel. The engine is `lib/loom.ts`; the readout counts what actually ran. */
export function Loom() {
  let canvas!: HTMLCanvasElement
  const signals = state(0)
  const changed = state(0)
  const effects = state(0)
  onMount(() => {
    let stop = () => {}
    void document.fonts.ready.then(() => { stop = run() })
    const run = () => {
      const paint = canvas.getContext('2d')!
      const rect = canvas.getBoundingClientRect()
      const CELL = rect.width < 700 ? 7 : 9
      const cols = Math.ceil(rect.width / CELL)
      const rows = Math.ceil(rect.height / CELL)
      canvas.width = cols
      canvas.height = rows
      const hero = canvas.parentElement!
      const word = hero.querySelector('h1') as HTMLElement
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches
      const cloth = weaver(cols, rows, coverage(word, cols, rows, CELL, rect), threads(cols, rows, CELL, still ? -9 : 0.25))
      const cells = Array.from({ length: cols * rows }, (_, i) => {
        const x = i % cols, y = (i / cols) | 0
        const cell = state(cloth.at(x, y, 0, still ? 9 : 0))
        paint.fillStyle = COLOURS[cell.value]
        paint.fillRect(x, y, 1, 1)
        watch(() => cell.value, v => { paint.clearRect(x, y, 1, 1); paint.fillStyle = COLOURS[v]; paint.fillRect(x, y, 1, 1) })
        return cell
      })
      signals.value = cells.length
      canvas.dataset.live = ''
      word.dataset.woven = ''
      if (still) return () => {}
      const begun = performance.now()
      let raf = 0, row = 0, last = 0, shown = begun, count = 0, base = stats.runs, lx = -1, ly = -1
      const spot = (e: PointerEvent) => [((e.clientX - rect.left) / rect.width) * cols, ((e.clientY - canvas.getBoundingClientRect().top) / rect.height) * rows]
      const point = (e: PointerEvent) => {
        const [x, y] = spot(e)
        if (lx >= 0) cloth.pull(x, y, Math.max(-3, Math.min(3, x - lx)), Math.max(-3, Math.min(3, y - ly)))
        lx = x
        ly = y
      }
      const press = (e: PointerEvent) => { const [x, y] = spot(e); cloth.shock(x, y) }
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame)
        if (now - last < 30) return
        last = now
        const t = now / 2200, clock = (now - begun) / 1000
        cloth.step()
        for (let y = row; y < rows; y += 2) {
          for (let x = 0; x < cols; x++) {
            const v = cloth.at(x, y, t, clock)
            const cell = cells[y * cols + x]
            if (cell.value !== v) { cell.value = v; count++ }
          }
        }
        row ^= 1
        flush()
        if (now - shown > 400) {
          const k = 1000 / (now - shown)
          shown = now
          changed.value = Math.round(count * k)
          effects.value = Math.round((stats.runs - base) * k)
          count = 0
          base = stats.runs
        }
      }
      const seen = new IntersectionObserver(([e]) => { cancelAnimationFrame(raf); if (e.isIntersecting) raf = requestAnimationFrame(frame) })
      seen.observe(canvas)
      hero.addEventListener('pointermove', point, { passive: true })
      hero.addEventListener('pointerdown', press, { passive: true })
      return () => { cancelAnimationFrame(raf); seen.disconnect(); hero.removeEventListener('pointermove', point); hero.removeEventListener('pointerdown', press) }
    }
    onCleanup(() => stop())
  })
  return (
    <>
      <canvas ref={canvas} data-site="loom" aria-hidden="true"></canvas>
      <dl data-site="meter">
        <div><dd>{fmt(signals.value)}</dd><dt>signals</dt></div>
        <div><dd>{fmt(changed.value)}</dd><dt>changed /s</dt></div>
        <div><dd>{fmt(effects.value)}</dd><dt>effects /s</dt></div>
        <div><dd>1</dd><dt>component run</dt></div>
      </dl>
    </>
  )
}
