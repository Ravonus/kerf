import { derived } from '@kerf/core'
import { Bell, Inbox, Toaster } from '@kerf/veneer'
import { useInbox } from './shared'

export function BellWithInbox() {
  const inbox = useInbox()
  const unread = derived(
    () => inbox.items.value.filter((n) => !n.read).length,
  )
  return (
    <>
      <Bell
        count={unread}
        inbox={(open) => (
          <Inbox
            variant="popover"
            {...inbox}
            open={open.value}
          />
        )}
      />
      <Toaster />
    </>
  )
}
