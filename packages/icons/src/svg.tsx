// The one <svg> every icon renders. An icon is its drawing as a string, so it costs that string and nothing per icon.
// Decorative unless it is given a `label`.
import type { JSX } from '@weft-js/core/jsx-runtime'
import './icons.css'

/** What every icon takes. Anything else lands on the `<svg>`. */
export type IconProps = {
  /** An accessible name: the icon becomes role="img". Without one it is aria-hidden. */
  label?: string | undefined
  /** Width and height, in px or any CSS length. warp's own sizes apply otherwise. */
  size?: number | string | undefined
  /** Show this tier whatever the page's expression is. */
  tier?: 'quiet' | 'balanced' | 'vivid' | undefined
  /** Inline CSS. `size` goes in front of it. */
  style?: string | undefined
  [attr: string]: unknown
}
/** One icon. Each is a plain component, so an unused one tree-shakes. */
export type IconComponent = (props: IconProps) => JSX.Element

const length = (size: number | string) => (typeof size === 'number' ? `${size}px` : size)

export function Svg({ label, size, tier, html, style, ...rest }: IconProps & { html: string }) {
  // oxlint-disable weft/no-html-sink -- `html` is this package's generated art: `icon` and `acting` set it after the props spread, so no caller reaches it
  return (
    <svg
      data-icon
      data-expression={tier}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
      style={
        size === undefined
          ? style
          : `width:${length(size)};height:${length(size)}${style ? `;${style}` : ''}`
      }
      innerHTML={html} /* oxlint-enable weft/no-html-sink */
      {...rest}
    />
  )
}

/*#__NO_SIDE_EFFECTS__*/
export function icon(line: string, pixels = ''): IconComponent {
  // Dither shows from 20 px, which the icon learns by measuring itself (icons.css): only one that has it asks.
  const dither = /\sdata-d=/.test(pixels) || /\sdata-d=/.test(line) || undefined
  return (p) => <Svg data-dither={dither} {...p} html={line + pixels} />
}
