import { announce, autoTrack, firstName, type Peer } from '@weft-js/warp-core'
import { derived, state } from '@weft-js/core'
import { Button } from '../Button'
import { Switch } from '../Choice'
import { use } from '@weft-js/warp-core/weft'
import { PeerAvatar } from './peer'
import '../styles'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/auto-track.css'

type Track = 'following' | 'paused' | 'off'

/**
 * MultiplayerAutoTrack (07 §6.4): a Switch, a status line, and a scroll region that follows the presenter's section
 * (`[data-section]` children). A manual scroll pauses it with Resume; presenter changes are shown, not announced.
 */
export function AutoTrack({ presenter, section, label, height = 180, children }: { presenter: Peer | null; section?: string | undefined; label: string; height?: number; children?: unknown }) {
  const mode = state<Track>('following')
  const name = derived(() => (presenter ? firstName(presenter.name) : ''))
  let region: HTMLDivElement | undefined
  use(autoTrack, () => region, () => ({
    following: mode.value === 'following',
    section,
    onPause() {
      mode.value = 'paused'
      announce(region!.ownerDocument, 'Auto-track paused. Resume to follow the presenter again.')
    },
  }))
  return (
    <div>
      <Switch checked={mode.value !== 'off'} onChange={(e: Event) => (mode.value = (e.currentTarget as HTMLInputElement).checked ? 'following' : 'off')}>Follow whoever presents</Switch>
      <div>
        <span data-scope="auto-track" data-state={mode.value} role="status">
          {mode.value === 'following' && presenter && <PeerAvatar peer={presenter} size="sm" />}
          {mode.value === 'following' ? (presenter ? `Following ${name.value} · presenting` : 'Nobody is presenting') : mode.value === 'paused' ? 'Paused: you scrolled' : 'Off'}
        </span>
        {mode.value === 'paused' && <Button emphasis="outline" tone="neutral" size="sm" onClick={() => { mode.value = 'following'; announce(region!.ownerDocument, `Following ${presenter?.name ?? 'the presenter'}`) }}>Resume</Button>}
      </div>
      <div ref={n => (region = n)} tabindex="0" role="region" aria-label={label} style={`block-size:${height}px;overflow:auto`}>{children}</div>
    </div>
  )
}
