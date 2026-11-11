import { state } from '@kerf-js/core'
import {
  Input,
  IntegrationsGrid,
  Toaster,
} from '@kerf-js/veneer'
import type { Integration } from '@kerf-js/veneer'
import { INTEGRATIONS } from '../../world'
import { wait } from './shared'

export function IntegrationsGridWorkspace() {
  const items =
    state<readonly Integration[]>(INTEGRATIONS)
  const mark = (id: string, next: Partial<Integration>) =>
    (items.value = items.value.map((i) =>
      i.id === id ? { ...i, ...next } : i,
    ))
  const connect = async (item: Integration) => {
    mark(item.id, { state: 'pending' })
    await wait(1200)
    mark(item.id, {
      state: 'connected',
      detail: 'kerf-dev',
      failure: undefined,
    })
  }
  return (
    <>
      <IntegrationsGrid
        items={items}
        onConnect={(item) => void connect(item)}
        onDisconnect={(item) =>
          mark(item.id, { state: 'off' })
        }
        onRestore={(item) =>
          mark(item.id, { state: 'connected' })
        }
        settings={(item) => (
          <Input
            label="Channel or team"
            defaultValue={item.detail}
          />
        )}
      />
      <Toaster />
    </>
  )
}
