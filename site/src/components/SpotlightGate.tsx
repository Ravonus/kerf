import { onCleanup, onMount, watch } from 'weft'
import { copyButtons } from '@weft/warp-core'
import { render } from 'weft/dom'
import { spotlightOpen } from '../lib/spotlight'

/** The ⌘K launcher fetched on first use. Everything in it stays out of a page nobody searches from. */
/* @weft client */
export function SpotlightGate() {
  let box: HTMLElement | undefined
  let stop: (() => void) | undefined
  let asked = false
  const load = () => {
    if (asked) return
    asked = true
    void import('./Spotlight').then(({ Spotlight }) => { stop = render(() => <Spotlight />, box!) as () => void })
  }
  watch(() => spotlightOpen.value, open => { if (open) load() })
  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (asked || e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      spotlightOpen.value = true
    }
    document.addEventListener('keydown', key)
    const copies = copyButtons()
    onCleanup(() => {
      document.removeEventListener('keydown', key)
      copies()
      stop?.()
    })
  })
  return <div ref={(n: any) => (box = n)}></div>
}
