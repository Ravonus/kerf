import { state } from '@weft-js/core'
import { Input, IntegrationsGrid, Toaster } from '@weft-js/warp'
import type { Integration } from '@weft-js/warp'
import { INTEGRATIONS } from '../../world'
import { wait } from './shared'

export function IntegrationsGridWorkspace() {
  const items = state<readonly Integration[]>(INTEGRATIONS)
  const mark = (id: string, next: Partial<Integration>) =>
    (items.value = items.value.map((i) => (i.id === id ? { ...i, ...next } : i)))
  const connect = async (item: Integration) => {
    mark(item.id, { state: 'pending' })
    await wait(1200)
    mark(item.id, { state: 'connected', detail: 'weft-dev', failure: undefined })
  }
  return (
    <>
      <IntegrationsGrid
        items={items}
        onConnect={(item) => void connect(item)}
        onDisconnect={(item) => mark(item.id, { state: 'off' })}
        onRestore={(item) => mark(item.id, { state: 'connected' })}
        settings={(item) => <Input label="Channel or team" defaultValue={item.detail} />}
      />
      <Toaster />
    </>
  )
}
