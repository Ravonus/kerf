import { skeletonShape, isPart, type ShapeSpec, type SkeletonBox, type SkeletonPart } from '@weft/ui-core'
import './skeleton-css'

const part = (p: SkeletonPart) => <span data-scope="skeleton" data-shape={p.shape === 'text' ? undefined : p.shape} style={p.style}></span>
const box = (b: SkeletonBox): any => <div style={b.style}>{b.children.map(c => (isPart(c) ? part(c) : box(c)))}</div>

/**
 * A skeleton shaped like the content a `<Boundary>` is waiting for (research 26 §4): the spec's Skeleton parts in a
 * SkeletonScope region (05 §5), sized by ui-core's `skeletonShape()`. Use it as `pending`:
 * `<Boundary pending={<Shape kind="list" rows={5} />}>`. Give it the content's counts so the swap shifts nothing
 * (X031 measures it in dev).
 */
export function Shape({ label = 'Loading', ...spec }: ShapeSpec & { label?: string }) {
  const root = skeletonShape(spec)
  return (
    <div data-scope="skeleton-scope" aria-busy="true" role="status" aria-label={label} inert style={root.style}>
      {root.children.map(c => (isPart(c) ? part(c) : box(c)))}
    </div>
  )
}
