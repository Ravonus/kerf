import { onCleanup, onMount } from '@kerf/core'
import { render } from '@kerf/core/dom'
import { previews } from '../generated/previews'

/** The narrowest a card lays each kind of stage out at: a chart or a form squeezed into a card's width breaks apart. */
const LEAST: Record<string, number> = { center: 0, narrow: 340, start: 420, fill: 440 }
/**
 * The smallest a card draws a picture to fit it whole: below this its words are specks, so it shows its top instead.
 * The card can set its own (`--tile-readable`): a desktop's cards are wide enough to hold half size.
 */
const READABLE = 0.3

/**
 * A hub card's preview is a picture of the example: laid out at a working width (`--tile-zoom` of the card, never
 * under the stage's least), then scaled to the card and centred. A tall one shrinks to fit while it stays readable
 * (most of its width's scale, and never under the card's readable scale), or with `fit="contain"` always; otherwise it keeps its width
 * and shows its top, fading out at the card's edge, and says so in `data-crop`. Where the card sets `--tile-hug` (a
 * phone's one column), the stage is no fixed shape: it is as tall as the picture, up to that height.
 */
function fitTile(host: HTMLElement, fit?: string, width?: number) {
  const stage = host.parentElement
  if (!stage) return
  const css = getComputedStyle(host)
  const hug = parseFloat(css.getPropertyValue('--tile-hug')) || 0
  if (!hug) stage.style.removeProperty('block-size')
  const W = stage.clientWidth,
    H = hug || stage.clientHeight
  if (!W || !H) return
  const zoom = parseFloat(css.getPropertyValue('--tile-zoom')) || 0.8
  const readable = parseFloat(css.getPropertyValue('--tile-readable')) || READABLE
  let vw = width ?? Math.max(W / zoom, LEAST[host.dataset.stage ?? 'center'] ?? 0)
  host.style.setProperty('--tile-w', `${vw}px`)
  // An example with a least width of its own past that one is laid out at it, so the picture holds all of it.
  if (host.scrollWidth > vw + 1) {
    vw = host.scrollWidth
    host.style.setProperty('--tile-w', `${vw}px`)
  }
  const ch = host.offsetHeight
  let s = W / vw
  let crop = false
  if (ch * s > H) {
    const all = H / ch
    if (fit === 'top' || (fit !== 'contain' && (all < s * 0.6 || all < readable))) crop = true
    else s = all
  }
  // A hugging stage takes the picture's height, so the picture sits at its top with no band above or below.
  const h = hug ? Math.min(Math.ceil(ch * s), H) : H
  if (hug) stage.style.blockSize = `${h}px`
  const x = (W - vw * s) / 2,
    y = crop ? 0 : (h - ch * s) / 2
  host.style.transform = `translate(${x}px, ${y}px) scale(${s})`
  host.toggleAttribute('data-crop', crop)
  // The fade stops short of the stage's bottom rule, so the card keeps its line under the picture.
  stage.style.maskImage = crop
    ? 'linear-gradient(#000 calc(100% - 44px), transparent calc(100% - 1px), #000 calc(100% - 1px))'
    : ''
  host.style.opacity = '1'
}

/* @kerf visible */
/**
 * One example, running. Its group's file loads as it nears the view, and until then the box holds its height with a
 * skeleton, so nothing below it moves. `Replay` on the frame sends `stage:replay` here.
 */
export function Preview({
  file,
  id,
  stage = 'center',
  tile,
  fit,
  width,
}: {
  file: string
  id: string
  stage?: string | undefined
  tile?: boolean
  fit?: string | undefined
  width?: number | undefined
}) {
  // oxlint-disable-next-line no-unassigned-vars -- the compiler assigns it through ref
  let host!: HTMLDivElement
  let stop: (() => void) | undefined
  let gone = false
  let watch: ResizeObserver | undefined
  const show = (Case: () => unknown) => {
    stop?.()
    host.replaceChildren()
    stop = render(() => <Case />, host)
    host.toggleAttribute('data-ready', true)
    if (tile) fitTile(host, fit, width)
  }
  let loaded: (() => unknown) | undefined
  const replay = () => {
    if (loaded) show(loaded)
  }
  onMount(() => {
    host.addEventListener('stage:replay', replay)
    if (tile) {
      // The card's width and the example's height both move it: a chart draws after it measures, a phone turns.
      let queued = false
      watch = new ResizeObserver(() => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
          queued = false
          if (!gone && host.hasAttribute('data-ready')) fitTile(host, fit, width)
        })
      })
      watch.observe(host)
      if (host.parentElement) watch.observe(host.parentElement)
    }
    previews[file]!()
      .then((m) => {
        if (gone) return
        const shown = m[id] as () => unknown
        loaded = shown
        show(shown)
      })
      .catch((e) => {
        console.error(e)
        host.textContent = 'This example failed to load.'
        host.toggleAttribute('data-ready', true)
        if (tile) fitTile(host, fit, width)
      })
  })
  onCleanup(() => {
    gone = true
    host?.removeEventListener('stage:replay', replay)
    watch?.disconnect()
    stop?.()
  })
  return (
    <div data-part="mount" data-stage={stage} inert={tile ? true : undefined} ref={host}>
      <span data-part="wait" aria-hidden="true"></span>
    </div>
  )
}
