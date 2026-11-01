// A name only known at runtime. The first one fetches the pack; until then the icon holds its box, and a name that turns
// out not to exist stays an empty box rather than breaking the page.
import { state, untrack } from 'weft'
import type { IconComponent, IconProps } from './svg'
import { Svg } from './svg'

type Pack = Record<string, IconComponent>
let loaded: Promise<Pack> | undefined
const held = new Map<string, IconComponent>()

export function late(name: string, pack: () => Promise<Pack>): IconComponent {
  let icon = held.get(name)
  if (icon) return icon
  icon = (props: IconProps) => {
    const ready = state<IconComponent | null>(null)
    ;(loaded ??= pack()).then(p => { if (p[name]) ready.value = p[name] }, () => {})
    const Empty = (p: IconProps) => <Svg {...p} data-loading="" html="" />
    return <>{ready.value ? untrack(() => ready.value!)(props) : Empty(props)}</>
  }
  held.set(name, icon)
  return icon
}
