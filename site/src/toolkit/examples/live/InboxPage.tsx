import { Inbox, Toaster } from '@weft-js/warp'
import { useInbox } from './shared'

export function InboxPage() {
  const inbox = useInbox()
  return (
    <div style="block-size:520px">
      <Inbox title="Notifications" live="live" {...inbox} />
      <Toaster />
    </div>
  )
}
