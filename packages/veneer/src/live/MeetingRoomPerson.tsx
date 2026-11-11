import { Avatar } from '../parts'
import { avatarTint, G } from './shared'
import type { Participant } from './MeetingRoomTypes'

export function Person({ p, sub }: { p: Participant; sub: string }) {
  return (
    <li>
      <Avatar name={p.name} size="sm" style={avatarTint(p.id)} />
      <span>
        {p.name}
        <small>{sub}</small>
      </span>
      {p.handRaised && (
        <span role="img" aria-label="Hand raised">
          <G name="hand" />
        </span>
      )}
      {p.isMuted ? <G name="micoff" /> : <G name="mic" />}
    </li>
  )
}
