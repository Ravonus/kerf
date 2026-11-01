// warp's `icon` props: a name, or an icon from @weft/icons. A name is looked up in @weft/icons/names, which a build swaps
// for exactly the names the app uses (packages/icons/compile.mjs); warp's own fixed glyphs import their icon directly.
import './styles'
import { IconAlert, IconAlertCircle, IconCheckCircle, IconInfo, type IconComponent, type IconProps } from '@weft/icons'
import { resolve, type IconName } from '@weft/icons/names'
import { untrack } from 'weft'

export type { IconName }
export type IconRef = IconName | IconComponent

/** `<svg data-icon aria-hidden focusable=false>`: decorative, never named (03 §7); `label` names it. */
export function Icon({ name, ...rest }: { name: IconRef } & IconProps) {
  const icon = untrack(() => name)
  const Draw = typeof icon === 'function' ? icon : resolve(icon)
  return Draw ? <Draw {...rest} /> : null
}

export const toneIcon = { info: IconInfo, neutral: IconInfo, accent: IconInfo, positive: IconCheckCircle, caution: IconAlert, critical: IconAlertCircle } as const
