// veneer's `icon` props: a name, or an icon from @kerf/veneer-icons. veneer's own fixed glyphs import their icon directly.
import './styles'
import { AlertIcon, AlertCircleIcon, CheckCircleIcon, InfoIcon } from '@kerf/veneer-icons'

/** `<svg data-icon aria-hidden focusable=false>`: decorative, never named (03 §7); `label` names it. */
export { Icon, type IconName, type IconRef } from '@kerf/veneer-icons/icon'

export const toneIcon = {
  info: InfoIcon,
  neutral: InfoIcon,
  accent: InfoIcon,
  positive: CheckCircleIcon,
  caution: AlertIcon,
  critical: AlertCircleIcon,
} as const
