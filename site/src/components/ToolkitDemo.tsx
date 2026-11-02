import { onCleanup, onMount, state } from '@weft-js/core'
import { render } from '@weft-js/core/dom'

/* @weft visible */
/** One live demo: the demos' file loads when the first one nears the view, so the page itself stays light. */
export function ToolkitDemo({ name }: { name: string }) {
  let host: HTMLDivElement | undefined
  const failed = state(false)
  let stop: (() => void) | undefined
  let gone = false
  onMount(() => {
    import('../toolkit/cases').then(m => {
      if (gone) return
      host!.replaceChildren()
      const Case = (m as Record<string, () => unknown>)[name]!
      stop = render(() => <Case />, host!)
    }).catch(e => { console.error(e); failed.value = true })
  })
  onCleanup(() => { gone = true; stop?.() })
  return <div data-tk="demo" ref={el => (host = el)}>{failed.value ? <p>This demo failed to load.</p> : <span data-tk="wait">Loading demo</span>}</div>
}
