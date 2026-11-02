import { Canvas, type CanvasFrame as Frame } from '@weft-js/warp'
import { state } from '@weft-js/core'
import { inks, mix, rng, type ArtProps, type Meta } from './shared'
import code from './commit-weave.tsx?raw'

export const meta: Meta = { name: 'Commit Weave', description: 'A year of activity as a strip of cloth: fifty-two warps, seven wefts, and each thread stands as tall as that day was busy. Hover a day. The year here is a seeded sample.', kind: 'data', code, wide: true, rest: true }

const WEEKS = 52, DAYS = 7, NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const colours = inks({ rule: '--warp-color-border', a: '--warp-color-accent-soft', b: '--warp-color-accent-border', c: '--warp-color-accent-text', d: '--warp-color-text', hot: '--warp-color-sweep' })

/** Sample activity with a real year's shape: quiet weekends, a summer lull, three bursts before releases. */
const year = (() => {
  const r = rng(52), out: number[] = []
  for (let w = 0; w < WEEKS; w++) for (let d = 0; d < DAYS; d++) {
    const weekday = d === 0 || d === 6 ? 0.18 : 1, season = 0.55 + 0.45 * Math.cos(((w - 4) / WEEKS) * Math.PI * 2) ** 2, burst = [11, 27, 44].some(b => Math.abs(w - b) < 2) ? 2.3 : 1
    out.push(Math.round(r() ** 1.7 * 14 * weekday * season * burst))
  }
  return out
})()
const peak = Math.max(...year), total = year.reduce((a, b) => a + b, 0)

export default function CommitWeave(_props: ArtProps) {
  const found = state('')
  const draw = ({ ctx, width, height, pointer }: Frame) => {
    const c = colours(ctx.canvas), mx = 18, my = 26, cw = (width - mx * 2) / WEEKS, ch = (height - my * 2) / DAYS
    ctx.clearRect(0, 0, width, height)
    // the wefts go first, so every warp lies over them
    ctx.fillStyle = c.rule
    for (let d = 0; d < DAYS; d++) ctx.fillRect(mx, my + (d + 0.5) * ch - 1, width - mx * 2, 2)
    const ramp = [c.a, c.b, c.c, c.d]
    const hx = pointer.in ? Math.floor((pointer.x - mx) / cw) : -1, hy = pointer.in ? Math.floor((pointer.y - my) / ch) : -1
    for (let w = 0; w < WEEKS; w++) for (let d = 0; d < DAYS; d++) {
      const n = year[w * DAYS + d]!, k = n / peak, tall = mix(0.3, 1.16, Math.sqrt(k)) * ch, cx = mx + (w + 0.5) * cw, cy = my + (d + 0.5) * ch, thick = cw * 0.84
      ctx.fillStyle = ramp[Math.min(3, Math.floor(Math.sqrt(k) * 4))]!
      ctx.fillRect(cx - thick / 2, cy - tall / 2, thick, tall)
      if ((w + d) % 2 && n < peak * 0.5) { ctx.fillStyle = c.rule; ctx.fillRect(cx - thick / 2, cy - 1, thick, 2) }
      if (w === hx && d === hy) { ctx.strokeStyle = c.hot; ctx.lineWidth = 2; ctx.strokeRect(cx - thick / 2 - 2, cy - tall / 2 - 2, thick + 4, tall + 4) }
    }
    const hit = hx >= 0 && hx < WEEKS && hy >= 0 && hy < DAYS
    found.value = hit ? `week ${hx + 1}, ${NAMES[hy]}: ${year[hx * DAYS + hy]} commits` : ''
  }
  return (
    <>
      <Canvas draw={draw} pointer onTheme={colours.reset} label={`A year of activity as woven cloth, ${total} commits in all`} />
      <p data-art="readout">{found.value}</p>
      <table data-art="table">
        <caption>Commits by week, sample data</caption>
        <thead><tr><th scope="col">Week</th>{NAMES.map(n => <th key={n} scope="col">{n}</th>)}</tr></thead>
        <tbody>{Array.from({ length: WEEKS }, (_, w) => <tr key={w}><th scope="row">{w + 1}</th>{NAMES.map((n, d) => <td key={n}>{year[w * DAYS + d]}</td>)}</tr>)}</tbody>
      </table>
    </>
  )
}
