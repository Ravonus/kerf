// The few warp icons the tier-1 components draw (05 §6: 24 grid, 1.5 stroke, svg[data-icon] styles them), inline
// so a component needs no sprite on the page. Paths are the specimens' symbols.
import { untrack } from 'weft'
export type IconName = 'x' | 'check' | 'search' | 'down' | 'alert' | 'alert-circle' | 'info' | 'check-circle' | 'calendar' | 'clock' | 'left' | 'right' | 'globe' | 'timer' | 'pin' | 'card' | 'undo'

const paths: Record<IconName, () => any> = {
  x: () => <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  card: () => <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  undo: () => <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  check: () => <path d="M5 12.5l4.5 4.5L19 7.5" />,
  search: () => <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  down: () => <path d="M6 9l6 6 6-6" />,
  alert: () => <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2v.3" /></>,
  'alert-circle': () => <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></>,
  info: () => <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5h.01" /></>,
  'check-circle': () => <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>,
  calendar: () => <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  clock: () => <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  left: () => <path d="M14.5 6l-6 6 6 6" />,
  right: () => <path d="M9.5 6l6 6-6 6" />,
  globe: () => <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z" /></>,
  timer: () => <><circle cx="12" cy="13.5" r="7" /><path d="M12 10v3.5l2.5 1.5M9.5 3.5h5" /></>,
  pin: () => <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
}

/** `<svg data-icon aria-hidden focusable=false>`: decorative, never named (03 §7). */
export function Icon({ name, ...rest }: { name: IconName; [attr: string]: any }) {
  const draw = paths[untrack(() => name)]
  return <svg data-icon viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>{draw()}</svg>
}

export const toneIcon = { info: 'info', neutral: 'info', accent: 'info', positive: 'check-circle', caution: 'alert', critical: 'alert-circle' } as const
