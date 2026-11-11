// `<Icon name>`. Literal names compile to the icon itself; what reaches this file is a name the build could only bound,
// or not bound at all, and @kerf/veneer-icons/names holds exactly those.
import {
  resolve,
  type IconActionName,
  type IconName,
  type IconVariant,
} from '@kerf/veneer-icons/names'
import { untrack } from '@kerf/core'
import type { IconTrigger } from './action'
import type { IconComponent, IconProps } from './svg'

export type { IconName, IconVariant }
/** An icon by name, or the icon itself. */
export type IconRef = IconName | IconComponent
/** `<Icon>`'s props: a name, and `solid` or `action` with a name that has one. */
export type IconByNameProps = (
  | { name: IconRef; solid?: boolean; action?: undefined }
  | { name: IconActionName; action: IconTrigger | boolean; solid?: undefined }
) &
  IconProps

/** An icon by name. A literal name compiles to the icon itself; anything else is looked up at runtime. */
export function Icon({ name, solid, ...rest }: IconByNameProps) {
  const Draw = untrack(() =>
    typeof name === 'function'
      ? name
      : resolve(name, rest.action ? 'action' : solid ? 'solid' : undefined),
  )
  return Draw ? <Draw {...rest} /> : null
}
