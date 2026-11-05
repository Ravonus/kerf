import { state } from '@weft-js/core'
import { Toaster, Webhooks } from '@weft-js/warp'
import type { Webhook } from '@weft-js/warp'
import { WEBHOOKS, WEBHOOK_EVENTS } from '../../world'
import { wait } from './shared'

export function WebhooksEndpoints() {
  const hooks = state<readonly Webhook[]>(WEBHOOKS)
  const add = async (url: string, events: string[]) => {
    await wait(500)
    hooks.value = [
      ...hooks.value,
      { id: url, url, events, healthy: true },
    ]
    return 'whsec_sample_not_a_real_secret'
  }
  const test = async () => {
    await wait(400)
    return { status: 200, ms: 82 }
  }
  return (
    <>
      <Webhooks
        hooks={hooks}
        events={WEBHOOK_EVENTS}
        onAdd={add}
        onTest={test}
      />
      <Toaster />
    </>
  )
}
