// `<Icon name>`. Literal names compile to the icon itself; what reaches this file is a name the build could only bound,
// or not bound at all, and @weft/icons/names holds exactly those.
import { resolve, type IconName, type IconVariant } from '@weft/icons/names'
import { untrack } from 'weft'
import type { IconComponent, IconProps } from './svg'

export type { IconName, IconVariant }
export type IconRef = IconName | IconComponent
export type IconByNameProps = { name: IconRef; hollow?: boolean; solid?: boolean; dither?: boolean } & IconProps

export function Icon({ name, hollow, solid, dither, ...rest }: IconByNameProps) {
  const Draw = untrack(() => (typeof name === 'function' ? name : resolve(name, hollow ? 'hollow' : solid ? 'solid' : dither ? 'dither' : undefined)))
  return Draw ? <Draw {...rest} /> : null
}
