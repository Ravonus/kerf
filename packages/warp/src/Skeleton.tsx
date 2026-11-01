import { untrack } from 'weft'
import './styles'
import '@weft/warp-core/styles/components/skeleton.css'

/**
 * A skeleton (05 §5): the shimmer is the sweep, left to right; still under reduced motion. `lines` stacks text
 * lines (the last one shorter).
 */
export function Skeleton({ shape = 'text', lines = 1, width, height }: { shape?: 'text' | 'circle' | 'block'; lines?: number; width?: string; height?: string }) {
  const size = (last: boolean) => [width ? `inline-size:${width}` : last && lines > 1 ? 'inline-size:60%' : '', height ? `block-size:${height}` : ''].filter(Boolean).join(';') || undefined
  if (untrack(() => lines) <= 1) return <span data-scope="skeleton" data-shape={shape === 'text' ? undefined : shape} style={size(false)}></span>
  return <>{Array.from({ length: lines }, (_, i) => <span data-scope="skeleton" data-shape={shape === 'text' ? undefined : shape} style={size(i === lines - 1)}></span>)}</>
}

