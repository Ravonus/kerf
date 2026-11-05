import { ScheduledLobby, Toaster, toast } from '@weft-js/warp'

export function ScheduledLobbyReview() {
  const to = Date.now() + 8 * 60_000
  return (
    <>
      <ScheduledLobby
        title="Incident review"
        to={to}
        onJoin={() => toast.show({ title: 'Joining' })}
        onAddToCalendar={() => toast.show({ title: 'Added to your calendar' })}
      >
        Join opens when the countdown ends.
      </ScheduledLobby>
      <Toaster />
    </>
  )
}
