// `<Icon name>` over the icons you list: a name is a lookup, so only a list can stay tree-shakable. `@weft-js/warp-icons/all` is
// the same thing over every icon, for an app that takes names from data. An icon itself passes straight through.
import { untrack } from '@weft-js/core'
import type { IconComponent, IconProps } from './svg'

export function iconSet<const S extends Record<string, IconComponent>>(icons: S) {
  return function Icon({ name, ...rest }: { name: (keyof S & string) | IconComponent } & IconProps) {
    const icon = untrack(() => name)
    const Draw = typeof icon === 'function' ? icon : icons[icon]
    return <Draw {...rest} />
  }
}
