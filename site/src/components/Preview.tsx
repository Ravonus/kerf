import { onCleanup, onMount } from 'weft'
import { on } from 'weft/browser'
import { render } from 'weft/dom'
import { previews } from '../generated/previews'

/* @weft visible */
/**
 * One example, running. Its group's file loads as it nears the view, and until then the box holds its height with a
 * skeleton, so nothing below it moves. `Replay` on the frame sends `stage:replay` here.
 */
export function Preview({ file, id, stage = 'center', tile }: { file: string; id: string; stage?: string; tile?: boolean }) {
  let host!: HTMLDivElement
  let stop: (() => void) | undefined
  let gone = false
  const show = (Case: any) => {
    stop?.()
    host.replaceChildren()
    stop = render(() => <Case />, host) as any
    host.toggleAttribute('data-ready', true)
  }
  let loaded: any
  const replay = () => loaded && show(loaded)
  onMount(() => {
    on(host, 'stage:replay' as any, replay)
    previews[file]!().then(m => {
      if (gone) return
      loaded = m[id]
      show(loaded)
    }).catch(e => {
      console.error(e)
      host.textContent = 'This example failed to load.'
      host.toggleAttribute('data-ready', true)
    })
  })
  onCleanup(() => { gone = true; stop?.() })
  return (
    <div data-part="mount" data-stage={stage} inert={tile ? true : undefined} ref={host}>
      <span data-part="wait" aria-hidden="true"></span>
    </div>
  )
}
