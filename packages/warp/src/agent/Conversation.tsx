import { DownIcon } from '@weft-js/warp-icons'
import { stick } from '@weft-js/warp-core'
import { derived, state } from '@weft-js/core'
import { Button } from '../Button'
import { use } from '@weft-js/warp-core/weft'
import '../styles'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/thread.css'

/**
 * Conversation (07 §1.1, §1.3, §1.6): role=log with aria-live off (a turn announces its own end), keyed turns as
 * `children`, an optional app bar and the Prompt below. It sticks to the bottom only within 48px of it; otherwise Jump
 * to latest appears, and pressing it goes back to the end and focuses the log.
 */
export function Conversation({ label = 'Assistant conversation', title, bar, prompt, children }: { label?: string; title?: any; bar?: any; prompt?: any; children?: any }) {
  const away = state(false)
  const head = derived(() => title !== undefined || bar !== undefined)
  let log: HTMLElement | undefined
  use(stick, () => log, () => ({ onAway: (a: boolean) => (away.value = a) }))
  const jump = () => {
    log!.scrollTop = log!.scrollHeight
    log!.focus({ preventScroll: true })
    away.value = false
  }
  return (
    <section data-scope="thread" data-part="root" aria-label={label}>
      {head.value && <div data-part="app-bar"><h2 data-part="app-title">{title}</h2><span data-part="spacer"></span>{bar}</div>}
      <div ref={(n: any) => (log = n)} data-part="log" role="log" aria-live="off" aria-label="Messages" tabindex="0">{children}</div>
      {away.value && <Button emphasis="soft" tone="neutral" size="sm" data-part="jump" onClick={jump}><DownIcon />Jump to latest</Button>}
      <div style="grid-row:3">{prompt}</div>
    </section>
  )
}
