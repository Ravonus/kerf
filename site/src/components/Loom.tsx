import { flush, onCleanup, onMount, state, stats, watch } from 'weft'
import { level, PALETTE } from '../lib/field'

const fmt = (n: number) => n.toLocaleString('en-US')

/** The word, drawn once in cells: 1 inside a letter. */
function glyphs(word: HTMLElement, cols: number, rows: number, cell: number, field: DOMRect) {
  const out = new Uint8Array(cols * rows)
  const c = document.createElement('canvas')
  c.width = cols
  c.height = rows
  const g = c.getContext('2d', { willReadFrequently: true })!
  const s = getComputedStyle(word)
  g.font = `${s.fontStyle} ${s.fontWeight} ${parseFloat(s.fontSize) / cell}px ${s.fontFamily}`
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#fff'
  const r = document.createRange()
  r.selectNodeContents(word)
  const box = r.getBoundingClientRect()
  const m = g.measureText(word.textContent!)
  const y = (box.top - field.top) / cell + (box.height / cell + m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
  g.fillText(word.textContent!, (box.left - field.left) / cell, y)
  const px = g.getImageData(0, 0, cols, rows).data
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4 + 3] > 110 ? 1 : 0
  return out
}

/* @weft visible */
/** Each cell is a `state` with a `watch` that paints one pixel. The readout counts what actually ran. */
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
      const CELL = rect.width < 700 ? 8 : 11
      const colour = PALETTE.map(([r, g, b, a]) => `rgba(${r},${g},${b},${a / 255})`)
      const cols = Math.ceil(rect.width / CELL)
      const rows = Math.ceil(rect.height / CELL)
      canvas.width = cols
      canvas.height = rows
      const word = document.querySelector<HTMLElement>('[data-site="hero"] h1')!
      const mask = glyphs(word, cols, rows, CELL, rect)
      const light = (x: number, y: number, ox = 0, oy = 0) => mask[Math.round(y + oy) * cols + Math.round(x + ox)] ? 0.9 : 0
      const cells = Array.from({ length: cols * rows }, (_, i) => {
        const x = i % cols, y = (i / cols) | 0
        const cell = state(level(x, y, cols, rows, 0, light(x, y)))
        paint.fillStyle = colour[cell.value]
        paint.fillRect(x, y, 1, 1)
        watch(() => cell.value, v => { paint.clearRect(x, y, 1, 1); paint.fillStyle = colour[v]; paint.fillRect(x, y, 1, 1) })
        return cell
      })
      signals.value = cells.length
      canvas.dataset.live = ''
      word.dataset.woven = ''
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
      let px = -99, py = -99, heat = 0, raf = 0, row = 0, last = 0, shown = performance.now(), count = 0, base = stats.runs
      const point = (e: PointerEvent) => {
        px = ((e.clientX - rect.left) / rect.width) * cols
        py = ((e.clientY - rect.top + scrollY) / rect.height) * rows
        heat = 1
      }
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame)
        if (now - last < 30) return
        last = now
        const t = now / 2200
        heat *= 0.965
        for (let y = row; y < rows; y += 2) {
          for (let x = 0; x < cols; x++) {
            let lift = 0, ox = 0, oy = 0
            const dx = x - px, dy = y - py
            const d = dx * dx + dy * dy
            if (heat > 0.03 && d < 900) {
              const f = heat * Math.exp(-d / 320)
              lift = f * 0.95
              ox = -dx * f * 1.1
              oy = -dy * f * 1.1
            }
            const v = level(x, y, cols, rows, t, lift + (light(x, y, ox, oy) || 0))
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
      addEventListener('pointermove', point, { passive: true })
      return () => { cancelAnimationFrame(raf); seen.disconnect(); removeEventListener('pointermove', point) }
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
