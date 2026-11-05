// The forms without x and y axes (06 §12, specimen 05 and 10): round ones, part-to-whole ones and grids.
import { halo, mark } from './marks'
import { color, f1, num, squarify, sum } from './math'
import { s } from './scene'
import { tableOf, type Base, type Fmt, type Form, type LegendItem } from './types'

/** A value and optional group in a treemap. */
export type TreeItem = { name: string; value: number; group?: string | undefined }
/** Config for a treemap. */
export type TreemapConfig = Base<TreeItem[]> & {
  groups?: string[]
  format?: Fmt | undefined
  short?: Fmt
}
const groupsOf = (c: TreemapConfig) => c.groups ?? [...new Set(c.data.map((d) => d.group ?? ''))]
/** Treemaps. */
export const treemap: Form<TreemapConfig> = {
  kind: 'treemap',
  legend: (c) =>
    groupsOf(c).length > 1
      ? groupsOf(c).map((name, i): LegendItem => ({ name, color: color(i) }))
      : [],
  table: (c) =>
    tableOf(
      ['Name', 'Group', 'Value'],
      [...c.data]
        .sort((a, b) => b.value - a.value)
        .map((d) => [d.name, d.group ?? '', (c.format ?? num)(d.value)]),
    ),
  summary: (c) => {
    const a = [...c.data].sort((p, q) => q.value - p.value)
    return `${a.length} items, ${(c.format ?? num)(sum(a.map((d) => d.value)))} in total; the largest is ${a[0]!.name} at ${(c.format ?? num)(a[0]!.value)}.`
  },
  plot(c, W, x) {
    const H = W < 420 ? 220 : 260,
      g = groupsOf(c),
      f = c.format ?? num,
      fs = c.short ?? f,
      list = c.data
        .filter((d) => !x.hidden.has(g.indexOf(d.group ?? '')))
        .sort((a, b) => b.value - a.value),
      t = sum(list.map((d) => d.value))
    const cells = squarify(
      list.map((d) => ({ ...d, a: (d.value / t) * W * H })),
      0,
      0,
      W,
      H,
    )
    return {
      h: H,
      body: cells.map((b, i) => {
        const gi = g.indexOf(b.group ?? '')
        return [
          mark('rect', i, 0, `${b.name}${b.group ? ` (${b.group})` : ''}: ${f(b.value)}`, {
            class: 's-rect',
            style: `--_dc:${color(gi)}`,
            x: b.x,
            y: b.y,
            width: Math.max(0, b.w),
            height: Math.max(0, b.h),
            rx: 3,
          }),
          b.w > 80 &&
            b.h > 34 && [
              s(
                'text',
                { class: 'lab', style: halo, x: b.x + 8, y: b.y + 17 },
                b.name.length * 6.4 > b.w - 12
                  ? `${b.name.slice(0, Math.floor((b.w - 16) / 6.6))}…`
                  : b.name,
              ),
              s(
                'text',
                { class: 'lab', style: `${halo};font-weight:400`, x: b.x + 8, y: b.y + 31 },
                fs(b.value),
              ),
            ],
        ]
      }),
    }
  },
}

/** Config for a Sankey diagram: links between nodes, by index, and the nodes with their columns. */
export type SankeyConfig = Base<{ from: number; to: number; value: number }[]> & {
  nodes: { name: string; column: number }[]
  format?: Fmt | undefined
}
function sankeyNodes(
  nodes: SankeyConfig['nodes'],
  pos: { x: number; y: number; h: number }[],
  nw: number,
  val: number[],
  f: Fmt,
) {
  return nodes.map((n, i) => [
    s('rect', {
      x: pos[i]!.x,
      y: pos[i]!.y,
      width: nw,
      height: pos[i]!.h,
      rx: 2,
      fill: 'var(--warp-color-text)',
    }),
    s(
      'text',
      { class: 'lab', style: halo, x: pos[i]!.x + nw + 6, y: pos[i]!.y + pos[i]!.h / 2 + 4 },
      n.name,
    ),
    s(
      'text',
      {
        class: 'lab-sub',
        style: halo,
        x: pos[i]!.x + nw + 6,
        y: pos[i]!.y + pos[i]!.h / 2 + 16,
      },
      f(val[i]!),
    ),
  ])
}

/** Sankey diagrams. */
export const sankey: Form<SankeyConfig> = {
  kind: 'sankey diagram',
  table: (c) =>
    tableOf(
      ['From', 'To', 'Value'],
      c.data.map((l) => [c.nodes[l.from]!.name, c.nodes[l.to]!.name, (c.format ?? num)(l.value)]),
    ),
  summary: (c) => {
    const top = c.data.reduce((a, b) => (b.value > a.value ? b : a))
    return `The largest flow is ${c.nodes[top.from]!.name} to ${c.nodes[top.to]!.name}, ${(c.format ?? num)(top.value)}.`
  },
  plot(c, W) {
    const H = W < 420 ? 220 : 250,
      { nodes, data: links } = c,
      f = c.format ?? num,
      cols = [...new Set(nodes.map((n) => n.column))],
      last = Math.max(...cols, 1),
      nw = 10,
      pad = 14,
      colX = (k: number) => 4 + k * ((W - nw - 90) / last)
    const val = nodes.map((_, i) =>
      Math.max(
        sum(links.filter((l) => l.from === i).map((l) => l.value)),
        sum(links.filter((l) => l.to === i).map((l) => l.value)),
      ),
    )
    const k = Math.min(
      ...cols.map((col) => {
        const ns = nodes.flatMap((n, i) => (n.column === col ? [i] : []))
        return (H - 10 - pad * (ns.length - 1)) / sum(ns.map((i) => val[i]!))
      }),
    )
    const pos: { x: number; y: number; h: number; o: number; io: number }[] = []
    for (const col of cols) {
      let y = 4
      nodes.forEach((n, i) => {
        if (n.column !== col) return
        pos[i] = { x: colX(col), y, h: val[i]! * k, o: 0, io: 0 }
        y += val[i]! * k + pad
      })
    }
    const first = nodes.filter((n) => n.column === cols[0]).length
    return {
      h: H,
      body: [
        links.map((l, i) => {
          const A = pos[l.from]!,
            B = pos[l.to]!,
            w = l.value * k,
            y0 = A.y + A.o + w / 2,
            y1 = B.y + B.io + w / 2,
            x0 = A.x + nw,
            x1 = B.x,
            mx = (x0 + x1) / 2
          A.o += w
          B.io += w
          return mark(
            'path',
            i,
            0,
            `${nodes[l.from]!.name} → ${nodes[l.to]!.name}: ${f(l.value)}`,
            {
              class: 's-flow',
              style: `--_dc:${color(l.from < first ? l.from : l.to % 2 ? 3 : 5)}`,
              'stroke-width': f1(Math.max(1, w)),
              d: `M${f1(x0)},${f1(y0)}C${f1(mx)},${f1(y0)} ${f1(mx)},${f1(y1)} ${f1(x1)},${f1(y1)}`,
            },
          )
        }),
        sankeyNodes(nodes, pos, nw, val, f),
      ],
    }
  },
}
