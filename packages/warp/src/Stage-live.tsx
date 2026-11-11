// A stage's live half: its one surface and what it draws on it each frame. It loads once the stage's tier is `live`,
// so a page on posters, or one still deciding, carries none of the surface's code.
import { untrack } from '@weft-js/core'
import { defineSurface, Surface } from '@weft-js/core/surface'
import { attach } from './Stage-director'
import type { Director } from './Stage-state'

/** The stage's one surface. Its kind is read once: a stage keeps its surface for life. */
function surfaceOf(d: Director) {
  return defineSurface({
    name: 'stage',
    kind: d.props.kind ?? 'keel-lit',
    maxDpr: d.dpr,
    setup: (s) => attach(d, s),
  })
}

/** The surface a live stage draws on; Stage renders it once the tier is `live` and this module has loaded. */
export function LiveSurface(props: { d: Director; label: string }) {
  const def = surfaceOf(untrack(() => props.d))
  return (
    <Surface
      use={def}
      label={props.label}
      style="position:absolute;inset:0;aspect-ratio:auto;transition:opacity .3s"
    />
  )
}
