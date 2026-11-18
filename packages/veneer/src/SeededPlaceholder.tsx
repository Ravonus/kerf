import { derived } from '@kerf-js/core'
import { visualRandom } from '@kerf-js/veneer-core/visuals'
import './styles'
import '@kerf-js/veneer-core/styles/components/seeded-placeholder.css'

/** Overrides for the seed artwork's theme colors. */
export interface PlaceholderPalette {
  background?: string | undefined
  foreground?: string | undefined
  accent?: string | undefined
}

/** A stable image for a missing media source. */
export interface SeededPlaceholderProps {
  seed: string | number
  palette?: PlaceholderPalette | undefined
  aspectRatio?: number | undefined
  /** When omitted, the graphic is decorative. */
  accessibleLabel?: string | undefined
  [attr: string]: unknown
}

/** An inline SVG with deterministic facets and accents. It renders without JavaScript in the browser. */
export function SeededPlaceholder({
  seed,
  palette,
  aspectRatio = 1,
  accessibleLabel,
  ...rest
}: SeededPlaceholderProps) {
  const width = () =>
    100 * (Number.isFinite(aspectRatio) ? Math.max(0.25, Math.min(8, aspectRatio)) : 1)
  const art = derived(() => {
    const random = visualRandom(seed)
    const center = width() / 2
    const radius = Math.min(36, center - 4)
    return {
      facets: Array.from({ length: 7 }, (_, index) => {
        const angle = (index * Math.PI * 2) / 7 + random() / 2
        const range = radius * (0.65 + random() * 0.35)
        return `${(center + Math.cos(angle) * range).toFixed(2)},${(50 + Math.sin(angle) * range).toFixed(2)}`
      }).join(' '),
      dots: Array.from({ length: 18 }, (_, i) => ({
        i,
        x: (random() * width()).toFixed(2),
        y: (random() * 100).toFixed(2),
        r: (0.25 + random() * 1.25).toFixed(2),
      })),
    }
  })
  return (
    <svg
      {...rest}
      data-scope="seeded-placeholder"
      viewBox={`0 0 ${width()} 100`}
      preserveAspectRatio="xMidYMid slice"
      role={accessibleLabel ? 'img' : undefined}
      aria-label={accessibleLabel}
      aria-hidden={accessibleLabel ? undefined : 'true'}
    >
      <rect
        data-part="placeholder-background"
        width={width()}
        height="100"
        style={{ fill: palette?.background }}
      />
      <path
        data-part="placeholder-frame"
        d={`M 5 19 V 12 H 12 M ${width() - 12} 12 H ${width() - 5} V 19 M 5 81 V 88 H 12 M ${width() - 12} 88 H ${width() - 5} V 81`}
        style={{ stroke: palette?.foreground }}
      />
      <g data-part="placeholder-dots" style={{ fill: palette?.foreground }}>
        {art.value.dots.map((dot) => (
          <circle key={dot.i} cx={dot.x} cy={dot.y} r={dot.r} />
        ))}
      </g>
      <polygon
        data-part="placeholder-facets"
        points={art.value.facets}
        style={{ fill: palette?.accent, stroke: palette?.foreground }}
      />
      <circle
        data-part="placeholder-center"
        cx={width() / 2}
        cy="50"
        r="3"
        style={{ fill: palette?.foreground }}
      />
    </svg>
  )
}
