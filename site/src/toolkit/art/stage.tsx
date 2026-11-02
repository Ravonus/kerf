import { Segmented } from '@weft/warp'
import { onCleanup, onMount, state } from 'weft'
import { render } from 'weft/dom'
import { enrol } from './shared'

const PIECES: Record<string, () => Promise<any>> = {
  'warp-beam': () => import('./warp-beam'),
  'tide-table': () => import('./tide-table'),
  'moire-loom': () => import('./moire-loom'),
  'turing-cloth': () => import('./turing-cloth'),
  survey: () => import('./survey'),
  'woven-word': () => import('./woven-word'),
  darkroom: () => import('./darkroom'),
  'ramp-wall': () => import('./ramp-wall'),
  shuttle: () => import('./shuttle'),
  'curl-threads': () => import('./curl-threads'),
  'truchet-cloth': () => import('./truchet-cloth'),
  bobbin: () => import('./bobbin'),
  'long-thread': () => import('./long-thread'),
  'selvedge-plan': () => import('./selvedge-plan'),
  ridgeline: () => import('./ridgeline'),
  draft: () => import('./draft'),
  'plasma-ink': () => import('./plasma-ink'),
  'bobbin-sdf': () => import('./bobbin-sdf'),
  caustics: () => import('./caustics'),
  'bad-signal': () => import('./bad-signal'),
  'commit-weave': () => import('./commit-weave'),
  'latency-rain': () => import('./latency-rain'),
  'bundle-tartan': () => import('./bundle-tartan'),
  'token-spectrum': () => import('./token-spectrum'),
  'socket-tide': () => import('./socket-tide'),
  pluck: () => import('./pluck'),
  filings: () => import('./filings'),
  'sand-table': () => import('./sand-table'),
}

/* @weft visible */
/** One gallery piece: its file loads as it nears the view, and it moves only while it holds one of the three live slots. */
export function ArtStage({ id }: { id: string }) {
  let host!: HTMLDivElement
  const live = state(false), failed = state(false)
  let stop: (() => void) | undefined, leave: (() => void) | undefined, gone = false
  onMount(() => {
    PIECES[id]!().then(m => {
      if (gone) return
      const Art = m.default
      host.replaceChildren()
      stop = render(() => <Art live={live.value} />, host) as any
      if (!m.meta.rest) leave = enrol(host, on => { live.value = on })
    }).catch(e => { console.error(e); failed.value = true })
  })
  onCleanup(() => { gone = true; leave?.(); stop?.() })
  return <div data-art="frame" ref={host}>{failed.value ? <p>This piece failed to load.</p> : null}</div>
}

const STOPS = [{ value: 'quiet', label: 'Quiet' }, { value: 'balanced', label: 'Balanced' }, { value: 'vivid', label: 'Vivid' }]

/* @weft visible */
/** The gallery's own dial: an attribute on the wall, and every piece hears it. */
export function ArtDial() {
  const stop = state('vivid')
  const pick = (v: string) => {
    stop.value = v
    document.querySelector('[data-art="stages"]')?.setAttribute('data-expression', v)
  }
  return <Segmented label="Expression" value={stop.value} onChange={pick} options={STOPS} />
}
