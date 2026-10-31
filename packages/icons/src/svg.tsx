// The one <svg> every icon renders. Decorative unless it is given a `label`; the children are the tier's paths.
import './icons.css'

export type IconProps = {
  /** An accessible name: the icon becomes role="img". Without one it is aria-hidden. */
  label?: string
  /** Width and height, in px or any CSS length. warp's own sizes apply otherwise. */
  size?: number | string
  [attr: string]: any
}
export type IconComponent = (props: IconProps) => any

const length = (size: number | string) => (typeof size === 'number' ? `${size}px` : size)

function Svg({ label, size, draw, style, ...rest }: IconProps & { draw: () => any }) {
  const box = size === undefined ? style : `inline-size:${length(size)};block-size:${length(size)}${style ? `;${style}` : ''}`
  return <svg data-icon viewBox="0 0 24 24" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} focusable="false" style={box} {...rest}>{draw()}</svg>
}

export const icon = (props: IconProps, draw: () => any) => <Svg {...props} draw={draw} />
