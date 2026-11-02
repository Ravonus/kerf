import { onCleanup, onMount, state } from '@weft-js/core'
import { render } from '@weft-js/core/dom'
import { previews } from '../generated/previews'

/* @weft visible */
/** A live preview: the file holding it loads when it nears the view, so a page only pays for what's looked at. */
export function Preview({ file, name }: { file: string; name: string }) {
  let host: HTMLDivElement | undefined
  const failed = state(false)
  let stop: (() => void) | undefined
  let gone = false
  onMount(() => {
    previews[file]!().then(m => {
      if (gone) return
      host!.replaceChildren()
      const Case = (m as Record<string, () => unknown>)[name]!
      stop = render(() => <Case />, host!)
    }).catch(e => { console.error(e); failed.value = true })
  })
  onCleanup(() => { gone = true; stop?.() })
  return <div data-site="preview" ref={el => (host = el)}>{failed.value ? <p>This preview failed to load.</p> : <span data-part="wait">Loading preview</span>}</div>
}
