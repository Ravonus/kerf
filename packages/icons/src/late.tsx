// A name only known at runtime. The first one fetches the pack; until then the icon holds its box, and a name that turns
// out not to exist stays an empty box rather than breaking the page.
import { state } from 'weft'
import type { IconComponent, IconProps } from './svg'
import { Svg } from './svg'

type Lookup = (name: string, variant?: string) => IconComponent | undefined
let loaded: Promise<Lookup> | undefined
const held = new Map<string, IconComponent>()

export function late(name: string, variant: string | undefined, pack: () => Promise<Lookup>): IconComponent {
  const key = `${name}:${variant ?? ''}`
  let icon = held.get(key)
  if (icon) return icon
  icon = (props: IconProps) => {
    const ready = state<IconComponent | null>(null)
    ;(loaded ??= pack()).then(find => { ready.value = find(name, variant) ?? null }, () => { loaded = undefined })
    return <>{ready.value ? ready.value(props) : <Svg {...props} data-loading="" html="" />}</>
  }
  held.set(key, icon)
  return icon
}
