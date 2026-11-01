// warp's `icon` props: a name, or an icon from @weft/icons. warp's own fixed glyphs import their icon directly.
import './styles'
import { IconAlert, IconAlertCircle, IconCheckCircle, IconInfo } from '@weft/icons'

/** `<svg data-icon aria-hidden focusable=false>`: decorative, never named (03 §7); `label` names it. */
export { Icon, type IconName, type IconRef } from '@weft/icons/icon'

export const toneIcon = { info: IconInfo, neutral: IconInfo, accent: IconInfo, positive: IconCheckCircle, caution: IconAlert, critical: IconAlertCircle } as const
