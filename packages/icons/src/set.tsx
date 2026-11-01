// `<Icon name>` over the icons you list: a name is a lookup, so only a list can stay tree-shakable. `@weft/icons/all` is
// the same thing over every icon, for an app that takes names from data.
import { untrack } from 'weft'
import type { IconComponent, IconProps } from './svg'

export function iconSet<const S extends Record<string, IconComponent>>(icons: S) {
  return function Icon({ name, ...rest }: { name: keyof S & string } & IconProps) {
    const Draw = icons[untrack(() => name)]
    return <Draw {...rest} />
  }
}
