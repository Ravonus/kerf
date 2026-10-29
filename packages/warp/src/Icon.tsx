// The few warp icons the tier-1 components draw (05 §6: 24 grid, 1.5 stroke, svg[data-icon] styles them), inline
// so a component needs no sprite on the page. Paths are the specimens' symbols.
import { untrack } from 'weft'
export type IconName = 'x' | 'check' | 'search' | 'down' | 'alert' | 'alert-circle' | 'info' | 'check-circle'

const paths: Record<IconName, () => any> = {
  x: () => <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: () => <path d="M5 12.5l4.5 4.5L19 7.5" />,
  search: () => <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  down: () => <path d="M6 9l6 6 6-6" />,
  alert: () => <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2v.3" /></>,
  'alert-circle': () => <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></>,
  info: () => <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5h.01" /></>,
  'check-circle': () => <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>,
}

/** `<svg data-icon aria-hidden focusable=false>`: decorative, never named (03 §7). */
export function Icon({ name, ...rest }: { name: IconName; [attr: string]: any }) {
  const draw = paths[untrack(() => name)]
  return <svg data-icon viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>{draw()}</svg>
}

export const toneIcon = { info: 'info', neutral: 'info', accent: 'info', positive: 'check-circle', caution: 'alert', critical: 'alert-circle' } as const
