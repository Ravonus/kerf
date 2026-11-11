// What navigation shows for a level whose generated shape has no structure of its own (`$kerfShapeThin`): a route
// whose markup is one component the compiler can't see into. A page gets a page's outline, a layout stands aside for
// its page's. A route's own `export const skeleton` is what fits exactly; this keeps the outlet from going blank.

/** One placeholder bar. The colour is the fallback without Veneer; Veneer's skeleton styles paint and shimmer it. */
const bar = (height: string, width: string, gap = '0.75em') =>
  `display:block;block-size:${height};inline-size:${width};margin-block-end:${gap};border-radius:0.375em;background:color-mix(in srgb,currentColor 9%,transparent)`

/** A heading, a lede and a block of text, then a panel: the outline most pages share. */
export function PageSkeleton() {
  return (
    <div
      data-scope="skeleton-scope"
      aria-busy="true"
      role="status"
      aria-label="Loading"
      inert
      data-kerf-page-skeleton=""
      style="display:block;min-inline-size:0;padding-block:clamp(1.5rem,4vw,2.5rem)"
    >
      <span data-skeleton style={bar('2.25em', 'min(22ch,60%)', '1.25em')}></span>
      <span data-skeleton style={bar('1em', 'min(60ch,92%)')}></span>
      <span data-skeleton style={bar('1em', 'min(48ch,74%)', '2em')}></span>
      <span data-skeleton style={bar('0.9em', '100%')}></span>
      <span data-skeleton style={bar('0.9em', '96%')}></span>
      <span data-skeleton style={bar('0.9em', '88%', '2em')}></span>
      <span data-skeleton style={bar('14em', '100%', '0')}></span>
    </div>
  )
}

/** A layout with nothing to show of its own: its page's skeleton, in place. */
export function PassThroughSkeleton(props: { children?: unknown }) {
  return <>{props.children}</>
}
