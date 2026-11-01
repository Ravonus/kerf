// `<Icon name>`. Literal names compile to the icon itself; what reaches this file is a name the build could only bound,
// or not bound at all, and @weft/icons/names holds exactly those.
import { resolve, type IconActionName, type IconName, type IconVariant } from '@weft/icons/names'
import { untrack } from 'weft'
import type { ActionIconProps, IconTrigger } from './action'
import type { IconComponent, IconProps } from './svg'

export type { IconName, IconVariant }
export type IconRef = IconName | IconComponent
export type IconByNameProps = ({ name: IconRef; hollow?: boolean; solid?: boolean; dither?: boolean; action?: undefined } | { name: IconActionName; action: IconTrigger | boolean; hollow?: undefined; solid?: undefined; dither?: undefined }) & IconProps

export function Icon({ name, hollow, solid, dither, ...rest }: IconByNameProps) {
  const Draw = untrack(() => (typeof name === 'function' ? name : resolve(name, rest.action ? 'action' : hollow ? 'hollow' : solid ? 'solid' : dither ? 'dither' : undefined))) as ((p: ActionIconProps) => any) | undefined
  return Draw ? <Draw {...rest} /> : null
}
