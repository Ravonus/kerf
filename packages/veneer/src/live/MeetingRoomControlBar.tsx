import { ChatIcon, HandIcon, ScreenIcon, SmileIcon, UsersIcon } from '@kerf-js/veneer-icons'
import { toolbar } from '@kerf-js/veneer-core'
import { use } from '@kerf-js/veneer-core/kerf'
import { Button } from '../Button'
import { G } from './shared'

/** Props for ControlBar. */
export interface ControlBarProps {
  mic: boolean
  camera: boolean
  sharing?: boolean | undefined
  hand?: boolean | undefined
  side?: 'people' | 'chat' | null | undefined
  /** Icons only, no Chat or People (they go in More), and Leave icon-only (07 §3.3). */
  compact?: boolean | undefined
  onToggle: (
    control: 'mic' | 'camera' | 'share' | 'hand' | 'react' | 'chat' | 'people' | 'more',
  ) => void
  onLeave?: (() => void) | undefined
  /** Stands in for the control's name while a control has an open menu of its own. */
  more?: string | undefined
}

// the visible label is inside the name (WCAG 2.5.3), and the name stays when the label hides
function Control({
  c,
  name,
  icon,
  pressed,
  device,
  label,
  first,
  onToggle,
}: {
  c: Parameters<ControlBarProps['onToggle']>[0]
  name: string
  icon: Parameters<typeof G>[0]['name']
  pressed?: boolean | undefined
  device?: boolean
  label: string
  first?: boolean
  onToggle: ControlBarProps['onToggle']
}) {
  return (
    <button
      type="button"
      data-part="control"
      data-kind={device ? 'device' : undefined}
      aria-pressed={pressed ? 'true' : 'false'}
      aria-label={name}
      tabindex={first ? '0' : '-1'}
      onClick={() => onToggle(c)}
    >
      <G name={icon} />
      <span data-part="label">{label}</span>
    </button>
  )
}

function DeviceControls({
  mic,
  camera,
  onToggle,
}: Pick<ControlBarProps, 'mic' | 'camera' | 'onToggle'>) {
  return (
    <div data-part="group">
      <Control
        onToggle={onToggle}
        c="mic"
        name={mic ? 'Microphone, mute' : 'Microphone, unmute'}
        icon={mic ? 'mic' : 'micoff'}
        pressed={mic}
        device
        label={mic ? 'Mute' : 'Unmute'}
        first
      />
      <Control
        onToggle={onToggle}
        c="camera"
        name={camera ? 'Camera, stop video' : 'Camera, start video'}
        icon={camera ? 'cam' : 'camoff'}
        pressed={camera}
        device
        label={camera ? 'Stop video' : 'Start video'}
      />
    </div>
  )
}

function MeetingControls({
  sharing,
  hand,
  side,
  compact,
  onToggle,
  more,
}: Pick<ControlBarProps, 'sharing' | 'hand' | 'side' | 'compact' | 'onToggle' | 'more'>) {
  return (
    <div data-part="group">
      <Control
        onToggle={onToggle}
        c="share"
        name="Share screen"
        icon={ScreenIcon}
        pressed={sharing}
        label="Share"
      />
      <Control
        onToggle={onToggle}
        c="hand"
        name={hand ? 'Lower hand' : 'Raise hand'}
        icon={HandIcon}
        pressed={hand}
        label={hand ? 'Lower hand' : 'Raise hand'}
      />
      <Control onToggle={onToggle} c="react" name="React" icon={SmileIcon} label="React" />
      {!compact && (
        <Control
          onToggle={onToggle}
          c="chat"
          name="Chat"
          icon={ChatIcon}
          pressed={side === 'chat'}
          label="Chat"
        />
      )}
      {!compact && (
        <Control
          onToggle={onToggle}
          c="people"
          name="People"
          icon={UsersIcon}
          pressed={side === 'people'}
          label="People"
        />
      )}
      <button
        type="button"
        data-part="control"
        aria-label={more}
        tabindex="-1"
        onClick={() => onToggle('more')}
      >
        <G name="more" />
      </button>
    </div>
  )
}

/** ControlBar (07 §3.2, §3.4): an APG toolbar. One tab stop, arrows between controls, Tab leaves; Leave is the only solid. */
export function ControlBar({
  mic,
  camera,
  sharing,
  hand,
  side,
  compact,
  onToggle,
  onLeave,
  more = 'More options',
}: ControlBarProps) {
  let bar: HTMLDivElement | undefined
  use(
    toolbar,
    () => bar,
    () => ({ items: '[data-part="control"], [data-part="leave"]' }),
  )
  return (
    <div
      ref={(n) => (bar = n)}
      data-scope="call-controls"
      role="toolbar"
      aria-label="Meeting controls"
    >
      <DeviceControls mic={mic} camera={camera} onToggle={onToggle} />
      <MeetingControls
        sharing={sharing}
        hand={hand}
        side={side}
        compact={compact}
        onToggle={onToggle}
        more={more}
      />
      <Button
        tone="critical"
        data-part="leave"
        aria-label="Leave meeting"
        data-icon-only={compact ? '' : undefined}
        tabindex="-1"
        onClick={() => onLeave?.()}
      >
        <G name="leave" />
        {compact ? null : 'Leave'}
      </Button>
    </div>
  )
}
