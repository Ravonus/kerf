import { derived } from '@weft-js/core'
import { Bell, Inbox, Toaster } from '@weft-js/warp'
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
