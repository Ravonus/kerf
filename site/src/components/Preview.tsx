import { onCleanup, onMount } from 'weft'
import { on } from 'weft/browser'
import { render } from 'weft/dom'
import { previews } from '../generated/previews'

/** The narrowest a card lays each kind of stage out at: a chart or a form squeezed into a card's width breaks apart. */
const LEAST: Record<string, number> = { center: 0, narrow: 340, start: 420, fill: 440 }
/** The smallest a card draws a picture to fit it whole: below this its words are specks, so it shows its top instead. */
const READABLE = 0.3

/**
 * A hub card's preview is a picture of the example: laid out at a working width (`--tile-zoom` of the card, never
 * under the stage's least), then scaled to the card and centred. A tall one shrinks to fit while it stays readable
 * (most of its width's scale, and never under READABLE), or with `fit="contain"` always; otherwise it keeps its width
 * and shows its top, fading out at the card's edge, and says so in `data-crop`. Where the card sets `--tile-hug` (a
 * phone's one column), the stage is no fixed shape: it is as tall as the picture, up to that height.
 */
function fitTile(host: HTMLElement, fit?: string, width?: number) {
  const stage = host.parentElement
  if (!stage) return
  const css = getComputedStyle(host)
  const hug = parseFloat(css.getPropertyValue('--tile-hug')) || 0
  if (!hug) stage.style.removeProperty('block-size')
  const W = stage.clientWidth, H = hug || stage.clientHeight
  if (!W || !H) return
  const zoom = parseFloat(css.getPropertyValue('--tile-zoom')) || 0.8
  const vw = width ?? Math.max(W / zoom, LEAST[host.dataset.stage ?? 'center'] ?? 0)
  host.style.setProperty('--tile-w', `${vw}px`)
  const ch = host.offsetHeight
  let s = W / vw
  let crop = false
  if (ch * s > H) {
    const all = H / ch
    if (fit === 'top' || (fit !== 'contain' && (all < s * 0.6 || all < READABLE))) crop = true
    else s = all
  }
  // A hugging stage takes the picture's height, so the picture sits at its top with no band above or below.
  const h = hug ? Math.min(Math.ceil(ch * s), H) : H
  if (hug) stage.style.blockSize = `${h}px`
  const x = (W - vw * s) / 2, y = crop ? 0 : (h - ch * s) / 2
  host.style.transform = `translate(${x}px, ${y}px) scale(${s})`
  host.toggleAttribute('data-crop', crop)
  // The fade stops short of the stage's bottom rule, so the card keeps its line under the picture.
  stage.style.maskImage = crop ? 'linear-gradient(#000 calc(100% - 44px), transparent calc(100% - 1px), #000 calc(100% - 1px))' : ''
  host.style.opacity = '1'
}

/* @weft visible */
/**
 * One example, running. Its group's file loads as it nears the view, and until then the box holds its height with a
 * skeleton, so nothing below it moves. `Replay` on the frame sends `stage:replay` here.
 */
export function Preview({ file, id, stage = 'center', tile, fit, width }: { file: string; id: string; stage?: string; tile?: boolean; fit?: string; width?: number }) {
  let host!: HTMLDivElement
  let stop: (() => void) | undefined
  let gone = false
  let watch: ResizeObserver | undefined
  const show = (Case: any) => {
    stop?.()
    host.replaceChildren()
    stop = render(() => <Case />, host) as any
    host.toggleAttribute('data-ready', true)
    if (tile) fitTile(host, fit, width)
  }
  let loaded: any
  const replay = () => loaded && show(loaded)
  onMount(() => {
    on(host, 'stage:replay' as any, replay)
    if (tile) {
      // The card's width and the example's height both move it: a chart draws after it measures, a phone turns.
      let queued = false
      watch = new ResizeObserver(() => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => { queued = false; if (!gone && host.hasAttribute('data-ready')) fitTile(host, fit, width) })
      })
      watch.observe(host)
      if (host.parentElement) watch.observe(host.parentElement)
    }
    previews[file]!().then(m => {
      if (gone) return
      loaded = m[id]
      show(loaded)
    }).catch(e => {
      console.error(e)
      host.textContent = 'This example failed to load.'
      host.toggleAttribute('data-ready', true)
      if (tile) fitTile(host, fit, width)
    })
  })
  onCleanup(() => { gone = true; watch?.disconnect(); stop?.() })
  return (
    <div data-part="mount" data-stage={stage} inert={tile ? true : undefined} ref={host}>
      <span data-part="wait" aria-hidden="true"></span>
    </div>
  )
}
