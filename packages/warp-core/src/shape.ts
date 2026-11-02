// Skeleton shapes for <Boundary pending> (research 11 §7.1 "static estimates", research 26 §4): a declared spec in,
// the geometry of spec Skeleton parts out. Bindings render each part as `data-scope="skeleton"` markup inside a
// `data-scope="skeleton-scope"` region (05 §5), so the look is the spec's skeleton CSS; this only sizes the parts.
//
// Text bars sit in a line box of the role's leading (the spec bar is 0.7em tall), so n lines are as tall as n lines
// of body text. Containers are flex columns, so the bars' margins never collapse.

/** The content a skeleton can stand in for. */
export type ShapeKind = 'text' | 'list' | 'card' | 'media' | 'table'

/** What a skeleton should look like. */
export interface ShapeSpec {
  kind?: ShapeKind | undefined
  /** text and card: lines of body text (default 3 for text, 2 for card). */
  lines?: number
  /** list and table: rows (default 3; table 5). */
  rows?: number
  /** table: columns (default 3). */
  cols?: number
  /** card and media: the media's aspect ratio, `"16/9"` or a number (card: no media when omitted). */
  media?: string | number
  /** list: a leading avatar (default true). */
  avatar?: boolean
}

/** One skeleton piece. */
export type SkeletonPart = { shape: 'text' | 'circle' | 'block'; style: string }
/** A box of skeleton pieces. */
export type SkeletonBox = { style: string; children: (SkeletonPart | SkeletonBox)[] }

const LINE = 'calc(var(--warp-text-body-leading, 1.55) * 1em)'
const BAR_MARGIN = `margin-block:calc((var(--warp-text-body-leading, 1.55) * 1em - 0.7em) / 2)`
const column = (gap: string, children: SkeletonBox['children'], extra = ''): SkeletonBox => ({ style: `display:flex;flex-direction:column;gap:${gap}${extra}`, children })
const bar = (width: string): SkeletonPart => ({ shape: 'text', style: `inline-size:${width};block-size:0.7em;${BAR_MARGIN}` })

/** n body lines; the last of several is 60%, as warp's `Skeleton lines`. */
function lines(n: number, widths?: string[]): SkeletonBox {
  return column('0', Array.from({ length: Math.max(1, n) }, (_, i) => bar(widths?.[i] ?? (n > 1 && i === n - 1 ? '60%' : '100%'))))
}

const ratio = (r: string | number) => (typeof r === 'number' ? String(r) : r.replace(/\s*[:/]\s*/, ' / '))

/** The skeleton for `spec`, as data a binding renders. */
export function skeletonShape(spec: ShapeSpec = {}): SkeletonBox {
  const kind = spec.kind ?? 'text'
  switch (kind) {
    case 'text':
      return lines(spec.lines ?? 3)
    case 'media':
      return column('0', [{ shape: 'block', style: `inline-size:100%;block-size:auto;aspect-ratio:${ratio(spec.media ?? '16/9')}` }])
    case 'card': {
      const children: SkeletonBox['children'] = []
      if (spec.media !== undefined) children.push({ shape: 'block', style: `inline-size:100%;block-size:auto;aspect-ratio:${ratio(spec.media)}` })
      children.push(lines(1, ['50%']), lines(spec.lines ?? 2))
      return column('12px', children)
    }
    case 'list': {
      const row = (): SkeletonBox => ({
        style: 'display:flex;align-items:center;gap:12px;padding-block:8px',
        children: [
          ...(spec.avatar === false ? [] : [{ shape: 'circle', style: 'inline-size:36px;block-size:36px;flex:none' } as SkeletonPart]),
          { ...lines(2, ['40%', '70%']), style: `${lines(2).style};flex:1;min-inline-size:0` },
        ],
      })
      return column('0', Array.from({ length: Math.max(1, spec.rows ?? 3) }, row))
    }
    case 'table': {
      const cols = Math.max(1, spec.cols ?? 3)
      const row = (): SkeletonBox => ({
        style: `display:grid;grid-template-columns:repeat(${cols}, minmax(0, 1fr));gap:16px;padding-block:8px;min-block-size:${LINE}`,
        children: Array.from({ length: cols }, (_, i) => bar(i === 0 ? '80%' : '60%')),
      })
      return column('0', Array.from({ length: Math.max(1, spec.rows ?? 5) }, row))
    }
    default:
      throw new RangeError(`skeletonShape(): unknown kind \`${kind as string}\``)
  }
}

/** Whether a skeleton node is a piece, not a box. */
export const isPart = (x: SkeletonPart | SkeletonBox): x is SkeletonPart => 'shape' in x
