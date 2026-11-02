import { syncedForm, type FormOp } from '@weft-js/warp-core'
import { derived } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import { read, type Live } from './peer'
import '../styles'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/synced-form.css'

/**
 * All-inputs sync (07 §6.4): every named control inside is shared. `ops` are the channel's remote edits, oldest first;
 * `onSend` hears each local one. A remote edit rings the field and names the peer for 1.4 s; a focused field queues it.
 */
export function SyncedForm({ ops, onSend, label, children }: { ops: Live<FormOp[]>; onSend?: (name: string, value: string | boolean) => void; label: string; children?: any }) {
  const list = derived(() => read(ops))
  let form: HTMLFormElement | undefined
  use(syncedForm, () => form, () => ({ ops: list.value, onSend }))
  return <form ref={(n: any) => (form = n)} data-scope="synced-form" aria-label={label} onSubmit={(e: Event) => e.preventDefault()}>{children}</form>
}
