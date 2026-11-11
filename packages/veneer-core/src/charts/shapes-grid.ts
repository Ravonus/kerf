// Calendar heatmaps and tile maps.
import { halo, mark } from './marks'
import { labelWindow, num, seq, sum } from './math'
import { s } from './scene'
import { tableOf, type Base, type Form } from './types'

/** Config for a calendar heatmap: a row of daily values per week. */
export type HeatConfig = Base<number[][]> & {
  weeks: string[]
  days?: string[] | undefined
  unit?: string
}
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const cap = (u: string) => u[0]!.toUpperCase() + u.slice(1)
/** Calendar heatmaps. */
export const heat: Form<HeatConfig> = {
  kind: 'heatmap',
  ramp: 0,
  table: (c) =>
    tableOf(
      ['Week', ...(c.days ?? DAYS)],
      c.data.map((w, i) => [c.weeks[i]!, ...w]),
    ),
  summary: (c) => {
    const all = c.data.flat()
    return `${c.data.length} weeks, ${num(sum(all))} ${c.unit ?? 'events'} in total, ${num(Math.max(...all))} at most in a day.`
  },
  plot(c, W, x) {
    const unit = c.unit ?? 'events',
      days = c.days ?? DAYS,
      max = Math.max(...c.data.flat()),
      bucket = (v: number) => (v === 0 ? 0 : Math.min(5, 1 + Math.floor((v / (max + 1)) * 5)))
    const all = c.data.length,
      ml = 34,
      mt = 18,
      gap = 3
    // narrow: the most recent weeks that fit at ≥ 10px; the table view keeps every week
    const off = Math.max(0, all - Math.floor((W - ml) / (10 + gap))),
      n = all - off,
      cell = Math.max(10, Math.min(26, (W - ml) / n - gap)),
      H = Math.ceil(mt + days.length * (cell + gap) + 4),
      r = Math.min(4, x.r),
      show = labelWindow(n, Math.max(2, Math.floor((W - ml) / 56)))
    return {
      h: H,
      body: [
        s(
          'g',
          { class: 'axis', 'aria-hidden': 'true' },
          days.map(
            (d, j) =>
              j % 2 === 0 &&
              s(
                'text',
                { x: ml - 8, y: mt + j * (cell + gap) + cell * 0.7, 'text-anchor': 'end' },
                d,
              ),
          ),
          c.weeks.slice(off).map((w, i) => {
            const end = i === n - 1 && i > 0
            return (
              show.has(i) &&
              s(
                'text',
                {
                  x: ml + i * (cell + gap),
                  y: mt - 6,
                  'text-anchor': end ? 'end' : 'start',
                  dx: end ? cell : undefined,
                },
                w,
              )
            )
          }),
        ),
        c.data.map(
          (w, i) =>
            i >= off &&
            w.map((v, j) =>
              mark('rect', i, j, `${c.weeks[i]} ${days[j]}: ${v} ${unit}`, {
                class: 'cell',
                style: `--_dc:${seq(bucket(v))};--i:${i - off}`,
                x: ml + (i - off) * (cell + gap),
                y: mt + j * (cell + gap),
                width: cell,
                height: cell,
                rx: r,
              }),
            ),
        ),
      ],
      tip: (i, j) => ({
        title: `${c.weeks[i]} · ${days[j]}`,
        rows: [[seq(bucket(c.data[i]![j]!)), cap(unit), String(c.data[i]![j])]],
      }),
    }
  },
}

/** Config for a tile map: a value per region id. */
export type TileConfig = Base<{ id: string; value: number }[]> & { tiles?: string; unit?: string }
/** The US as an 11-column tile grid: rows by `|`, cells by `,`. */
export const US_TILES =
  'AK,,,,,,,,,,ME|,,,,,,,,,VT,NH|WA,ID,MT,ND,MN,IL,WI,MI,NY,RI,MA|OR,NV,WY,SD,IA,IN,OH,PA,NJ,CT,|CA,UT,CO,NE,MO,KY,WV,VA,MD,DE,|,AZ,NM,KS,AR,TN,NC,SC,DC,,|,,,OK,LA,MS,AL,GA,,,|HI,,,TX,,,,,FL,,'
/** Tile maps. */
export const tile: Form<TileConfig> = {
  kind: 'tile map',
  ramp: 1,
  table: (c) =>
    tableOf(
      ['Tile', c.unit ?? 'Value'],
      [...c.data].sort((a, b) => b.value - a.value).map((d) => [d.id, d.value]),
    ),
  summary: (c) => {
    const a = [...c.data].sort((p, q) => q.value - p.value)
    return `${a.length} tiles; the highest is ${a[0]!.id} at ${num(a[0]!.value)}.`
  },
  plot(c, W) {
    const L = (c.tiles ?? US_TILES).split('|').map((r) => r.split(',')),
      cols = Math.max(...L.map((r) => r.length)),
      cs = Math.min(30, (W - 4) / cols - 2),
      g = 2,
      by = new Map(c.data.map((d) => [d.id, d.value])),
      max = Math.max(...c.data.map((d) => d.value))
    const b = (v: number) => Math.min(5, 1 + Math.floor((v / (max + 1)) * 5)),
      ox = (W - cols * (cs + g)) / 2
    let k = 0
    return {
      h: Math.ceil(L.length * (cs + g)),
      body: L.map((r, ri) =>
        r.map((id, ci) => {
          if (!id) return null
          const v = by.get(id) ?? 0,
            bucket = b(v)
          return [
            mark('rect', k++, 0, `${id}: ${v}${c.unit ? ` ${c.unit}` : ''}`, {
              class: 'cell',
              style: `--_dc:${seq(bucket)}`,
              x: ci * (cs + g) + ox,
              y: ri * (cs + g),
              width: cs,
              height: cs,
              rx: 3,
            }),
            s(
              'text',
              {
                class: 'lab',
                style: `${halo};font-size:9px`,
                x: ci * (cs + g) + ox + cs / 2,
                y: ri * (cs + g) + cs / 2 + 3,
                'text-anchor': 'middle',
              },
              id,
            ),
          ]
        }),
      ),
    }
  },
}
