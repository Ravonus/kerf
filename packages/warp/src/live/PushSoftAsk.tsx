import { announce, uid } from '@weft/warp-core'
import { state } from 'weft'
import { Button } from '../Button'
import { G } from './shared'
import '../styles'
import '@weft/warp-core/styles/app/push-ask.css'

/**
 * Push soft-ask (07 §4.2, P2): an in-app card before the browser's prompt. `onAccept` is where the caller calls
 * Notification.requestPermission(), only after this yes; the caller also decides when to show it (never first visit).
 */
export function PushSoftAsk({ title = 'Get a ping when someone mentions you?', children = 'Only mentions and approvals, on this device. You can change it any time.', onAccept, onDismiss, declined = "Okay. We won't ask again for 30 days." }: { title?: any; children?: any; onAccept: () => void; onDismiss?: () => void; declined?: string }) {
  const id = uid('push')
  const shown = state(true)
  let root: HTMLElement | undefined
  const no = () => {
    announce(root!.ownerDocument, declined)
    shown.value = false
    onDismiss?.()
  }
  const yes = () => { shown.value = false; onAccept() }
  return (
    <>
      {shown.value && (
        <div ref={(n: any) => (root = n)} data-scope="push-ask" role="region" aria-labelledby={`${id}-t`}>
          <span data-part="mark"><G name="bell" /></span>
          <b id={`${id}-t`}>{title}</b>
          <span>{children}</span>
          <div data-part="actions">
            <Button size="sm" onClick={yes}>Turn on</Button>
            <Button emphasis="ghost" tone="neutral" size="sm" onClick={no}>Not now</Button>
          </div>
        </div>
      )}
    </>
  )
}
