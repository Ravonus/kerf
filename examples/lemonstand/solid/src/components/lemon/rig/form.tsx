import type { JSX } from 'solid-js'

import { C, SW } from '../palette'

type Pt = readonly [number, number]
type Draw = () => JSX.Element

/* ─────────────── Form helper: outline + shade + offset light fill ─────────────── */

export function form({
  id,
  shapes,
  fill,
  shade,
  offset = [-2, -2.4],
  extra,
}: {
  id: string
  shapes: Draw
  fill: string
  shade: string
  offset?: Pt
  extra?: Draw | null
}) {
  return (
    <g>
      <defs>
        <clipPath id={id}>{shapes()}</clipPath>
      </defs>
      <g fill={C.line} stroke={C.line} stroke-width={SW * 2} stroke-linejoin="round">
        {shapes()}
      </g>
      <g fill={shade}>{shapes()}</g>
      <g clip-path={`url(#${id})`}>
        <g fill={fill} transform={`translate(${offset[0]} ${offset[1]})`}>
          {shapes()}
        </g>
        {extra?.()}
      </g>
    </g>
  )
}
