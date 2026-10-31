// warp's icon names over @weft/icons (10-icons.md). A name is a lookup, so this list is what a component with an `icon`
// prop pays for; a fixed glyph imports its own icon instead.
import { iconSet, IconAlert, IconAlertCircle, IconCalendar, IconCard, IconCheck, IconCheckCircle, IconClock, IconDown, IconGlobe, IconInfo, IconLeft, IconMore, IconPin, IconRight, IconSearch, IconTimer, IconUndo, IconX } from '@weft/icons'

/** `<svg data-icon aria-hidden focusable=false>`: decorative, never named (03 §7); `label` names it. */
export const Icon = iconSet({
  x: IconX, check: IconCheck, search: IconSearch, down: IconDown, alert: IconAlert, 'alert-circle': IconAlertCircle, info: IconInfo, 'check-circle': IconCheckCircle,
  calendar: IconCalendar, clock: IconClock, left: IconLeft, right: IconRight, globe: IconGlobe, timer: IconTimer, pin: IconPin, card: IconCard, undo: IconUndo, more: IconMore,
})
export type IconName = 'x' | 'check' | 'search' | 'down' | 'alert' | 'alert-circle' | 'info' | 'check-circle' | 'calendar' | 'clock' | 'left' | 'right' | 'globe' | 'timer' | 'pin' | 'card' | 'undo' | 'more'

export const toneIcon = { info: 'info', neutral: 'info', accent: 'info', positive: 'check-circle', caution: 'alert', critical: 'alert-circle' } as const
