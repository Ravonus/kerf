import { hueOf, speakingOut, tileLabel } from '@kerf/veneer-core'
import { derived, untrack } from '@kerf/core'
import { use } from '@kerf/veneer-core/kerf'
import { Avatar } from '../parts'
import { avatarTint, G } from './shared'
import type { Participant } from './MeetingRoomTypes'

type Video = (p: Participant) => unknown

/**
 * A tile (07 §3.1): video slot or avatar, name chip with level bars, flags with words in the name. The speaking ring is
 * the sweep: `data-speaking`, then `data-speaking-out` until it has left. The bars read `--level`: set it on the tile
 * (`[data-pid]`) at whatever rate the audio arrives; nothing re-renders.
 */
export function Tile({
  p,
  self,
  video,
  role = 'group',
}: {
  p: Participant
  self?: boolean
  video?: Video | undefined
  role?: string
}) {
  let el: HTMLDivElement | undefined
  use(
    speakingOut,
    () => el,
    () => !!p.isSpeaking,
  )
  const label = derived(() => tileLabel(self ? { ...p, name: `${p.name}, you` } : p))
  const slot = untrack(() => video)
  const camera = derived(() => !!slot && p.isCamOn !== false)
  return (
    <div
      ref={(n) => (el = n)}
      data-scope="tile"
      role={role}
      tabindex="-1"
      aria-label={label.value}
      data-pid={p.id}
      data-speaking={p.isSpeaking ? '' : undefined}
      data-hand={p.handRaised ? '' : undefined}
      data-network={p.network === 'poor' ? 'poor' : undefined}
      data-cam={p.isCamOn === false ? 'off' : undefined}
      style={`--_hue:var(--veneer-color-data-${hueOf(p.id)})`}
    >
      {camera.value ? (
        <div data-part="video">{slot!(p)}</div>
      ) : (
        <Avatar name={p.name} size="xl" style={avatarTint(p.id)} />
      )}
      <span data-part="flags">
        {p.handRaised && (
          <span data-part="flag" data-kind="hand" role="img" aria-label="Hand raised">
            <G name="hand" />
          </span>
        )}
        {p.network === 'poor' && (
          <span data-part="flag" data-tone="caution" role="img" aria-label="Poor connection">
            <G name="signal" />
          </span>
        )}
        {p.isMuted && (
          <span data-part="flag" data-tone="critical" role="img" aria-label="Muted">
            <G name="micoff" />
          </span>
        )}
      </span>
      <span data-part="name">
        {!p.isMuted && (
          <span data-part="level">
            <i></i>
            <i></i>
            <i></i>
          </span>
        )}
        {self ? 'You' : p.name}
        {p.role ? <small> · {p.role}</small> : null}
      </span>
    </div>
  )
}
