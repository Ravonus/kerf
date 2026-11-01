import { IconAlert, IconCheck, IconClock } from '@weft/icons'
import { announce, firstName, type Peer } from '@weft/ui-core'
import { derived } from 'weft'
import { Alert } from '../Alert'
import { Button } from '../Button'
import '../styles'
import '@weft/ui-core/styles/app/tokens.css'
import '@weft/ui-core/styles/app/sync.css'
import '@weft/ui-core/styles/app/conflict.css'

export type SyncState = 'saved' | 'saving' | 'offline'
const SYNC = { saved: 'Saved', saving: 'Saving…', offline: 'Offline · changes kept' } as const

/** Next to the title (07 §6.1): "Saved", "Saving…", "Offline · changes kept"; map `channel.status` onto it. */
export function SyncIndicator({ state }: { state: SyncState }) {
  const icon = derived(() => (state === 'saved' ? 'check' : state === 'saving' ? 'clock' : 'alert') as 'check' | 'clock' | 'alert')
  return <span data-scope="sync" data-state={state} role="status">{icon.value === 'check' ? <IconCheck /> : icon.value === 'clock' ? <IconClock /> : <IconAlert />} {SYNC[state]}</span>
}

/**
 * A conflict (07 §6.1): a caution alert with both versions side by side, and Use theirs, Keep mine, Compare. Nothing
 * is discarded silently: the caller holds both values until one of these fires.
 */
export function ConflictAlert({ field, peer, time, theirs, yours, onUseTheirs, onKeepMine, onCompare }: { field: string; peer: Peer; time: string; theirs: any; yours: any; onUseTheirs: () => void; onKeepMine: () => void; onCompare?: () => void }) {
  let box: HTMLDivElement | undefined
  const settle = (fn: () => void) => () => { fn(); if (box) announce(box.ownerDocument, 'Conflict resolved') }
  const compare = derived(() => onCompare !== undefined)
  const first = () => firstName(peer.name)
  const actions = derived(() => <><Button size="sm" onClick={settle(onUseTheirs)}>Use theirs</Button><Button size="sm" emphasis="outline" tone="neutral" onClick={settle(onKeepMine)}>Keep mine</Button>{compare.value && <Button size="sm" emphasis="ghost" tone="neutral" onClick={() => onCompare!()}>Compare</Button>}</>)
  return (
    <div ref={(n: any) => (box = n)}>
      <Alert tone="caution" live title={`${first()} changed “${field}” while you were editing`} actions={actions.value}>
        Pick a version. Nothing is lost either way.
        <div data-scope="conflict">
          <div><small>Theirs · {first()} · {time}</small><ins>{theirs}</ins></div>
          <div><small>Yours · unsaved</small><del>{yours}</del></div>
        </div>
      </Alert>
    </div>
  )
}
