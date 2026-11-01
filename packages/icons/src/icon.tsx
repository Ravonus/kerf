// `<Icon name>`. Literal names compile to the icon itself; what reaches this file is a name the build could only bound,
// or not bound at all, and @weft/icons/names holds exactly those.
import { resolve, type IconActionName, type IconName, type IconVariant } from '@weft/icons/names'
import { untrack } from 'weft'
import type { ActionIconProps, IconTrigger } from './action'
import type { IconComponent, IconProps } from './svg'

export type { IconName, IconVariant }
export type IconRef = IconName | IconComponent
export type IconByNameProps = ({ name: IconRef; solid?: boolean; action?: undefined } | { name: IconActionName; action: IconTrigger | boolean; solid?: undefined }) & IconProps

export function Icon({ name, solid, ...rest }: IconByNameProps) {
  const Draw = untrack(() => (typeof name === 'function' ? name : resolve(name, rest.action ? 'action' : solid ? 'solid' : undefined))) as ((p: ActionIconProps) => any) | undefined
  return Draw ? <Draw {...rest} /> : null
}
