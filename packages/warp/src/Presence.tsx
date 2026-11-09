import './styles'

/** How a Presence arrives and leaves. */
export type PresenceMotion =
  | 'collapse'
  | 'fade'
  | 'rise'
  | 'pop'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'

/** Props for Presence. */
export interface PresenceProps {
  /** Shown while true. Its content stays mounted while hidden, so its state survives a close. */
  when: boolean
  /** `collapse` grows from nothing to its height and back; the others keep their size. Default `collapse`. */
  motion?: PresenceMotion | undefined
  children?: unknown
}

/**
 * Shows and hides its content with an entrance and an exit: the exit plays out before the content leaves the
 * layout. The same motion with no component: `hidden` plus `data-collapse` or `data-presence="rise"` on any element.
 */
export function Presence(props: PresenceProps) {
  return (
    <div
      data-collapse={(props.motion ?? 'collapse') === 'collapse' ? '' : undefined}
      data-presence={(props.motion ?? 'collapse') === 'collapse' ? undefined : props.motion}
      hidden={!props.when}
    >
      {props.children}
    </div>
  )
}
