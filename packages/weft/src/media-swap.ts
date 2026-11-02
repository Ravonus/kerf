// The swap runtime of `encoder: 'compatible'` (research 15 §5), a lazy chunk nothing loads without a compatible copy.
// The page shows the efficient file; a save has to get one that opens anywhere.
//
// Measured with real right-clicks in headed Chromium and Firefox (packages/plugin-media/test/save.headful.mjs): Chromium
// saves what the handler sets inside `contextmenu`, but Firefox only saves a URL that has finished loading, so a swap at
// the click is too late for it. Intent therefore starts at a 150 ms hover, and the click and long-press are the backstop.
//   Stills: drop the `<source>`s, and the `<img>` is already the fallback at the same widths and size.
//   GIF as video: a near-transparent `<img>` of the GIF over the video. Right-click lands on the image and saves it.
//   Video: a second `<video>` parked ahead on the copy flips in on a presented frame, up to 2 MB of copy.
// A copy the HTTP cache already holds swaps in at mount: nothing to fetch, and no hover to wait for.

import type { MediaAsset } from './media'

const DWELL = 150
const VIDEO_CAP = 2 * 1024 * 1024
const CONTROLS = 48

const saving = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
const idle = (run: () => void) => (window.requestIdleCallback ?? setTimeout)(run)

const cached = (url: string) => fetch(url, { cache: 'only-if-cached', mode: 'same-origin' }).then(r => {
  void r.body?.cancel()
  // oxlint-disable-next-line typescript/only-throw-error -- only `Promise.any` sees this, and it only needs a rejection; an Error here costs bytes
  if (!r.ok) throw r
})

function intent(el: HTMLElement, run: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const now = () => { clearTimeout(timer); run() }
  el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') timer = setTimeout(now, DWELL) })
  el.addEventListener('pointerleave', () => clearTimeout(timer))
  el.addEventListener('touchstart', () => { timer = setTimeout(now, DWELL) }, { passive: true })
  el.addEventListener('touchend', () => clearTimeout(timer))
  for (const name of ['pointerdown', 'contextmenu', 'dragstart']) el.addEventListener(name, e => { if (name !== 'pointerdown' || (e as PointerEvent).button === 2) now() })
}

/** A sibling over `el`, for the overlay and the second video. The wrapper `<Media>` renders is what it sits in. */
function above(el: HTMLElement, child: HTMLElement, bottom = 0) {
  child.style.cssText = `position:absolute;inset:0 0 ${bottom}px 0;width:100%;height:calc(100% - ${bottom}px)`
  el.after(child)
}

function stillSwap(img: HTMLImageElement) {
  img.parentElement?.querySelectorAll('source').forEach(s => s.remove())
}

function gifOverlay(video: HTMLVideoElement, copy: NonNullable<MediaAsset['copy']>) {
  let done = false
  return () => {
    if (done) return
    done = true
    const img = new Image()
    img.src = copy.src
    img.alt = ''
    above(video, img, video.controls ? CONTROLS : 0)
    img.style.opacity = '0.01'
  }
}

/** Research 15 §5.3: B parks on the frame A reaches in `lead` seconds, and they flip on B's first presented frame. */
function videoSwap(a: HTMLVideoElement, url: string, lead = 0.6) {
  let done = false
  return async () => {
    if (done || document.pictureInPictureElement === a || a.seeking) return
    done = true
    if (!a.requestVideoFrameCallback) return
    const b = document.createElement('video')
    b.muted = true
    b.playsInline = true
    b.loop = a.loop
    b.controls = a.controls
    b.preload = 'auto'
    b.poster = a.poster
    b.src = url
    above(a, b)
    b.style.opacity = '0'
    // oxlint-disable-next-line no-promise-executor-return -- `addEventListener` returns nothing a promise looks at, and braces cost bytes in <Media>
    const once = (name: string) => new Promise(ok => b.addEventListener(name, ok, { once: true }))
    await once('loadeddata')
    const flip = () => {
      b.style.opacity = '1'
      b.muted = a.muted
      a.muted = true
      requestAnimationFrame(() => { a.pause(); a.style.visibility = 'hidden' })
    }
    const target = a.paused ? a.currentTime : a.currentTime + lead
    b.currentTime = target
    await once('seeked')
    if (a.paused) return flip()
    const wait = (_: number, m: { mediaTime: number }) => {
      if (m.mediaTime < target - 0.05) return void a.requestVideoFrameCallback(wait)
      void b.play()
      b.requestVideoFrameCallback(flip)
    }
    a.requestVideoFrameCallback(wait)
  }
}

/** The best declared source this client decodes, preferring power-efficient (research 15 §5.1). Only before playback. */
async function choose(v: HTMLVideoElement, asset: MediaAsset) {
  const list = navigator.mediaCapabilities
  if (!list || v.currentTime > 0 || !v.paused) return
  const found: [HTMLSourceElement, boolean][] = []
  for (const s of v.querySelectorAll('source')) {
    if (s.media && !matchMedia(s.media).matches) continue
    const info = await list.decodingInfo({ type: 'file', video: { contentType: s.type, width: asset.width, height: asset.height, bitrate: 1e6, framerate: 30 } }).catch(() => null)
    if (info?.supported) found.push([s, info.powerEfficient])
  }
  const best = (found.find(f => f[1]) ?? found[0])?.[0]
  if (best && best !== v.querySelector('source')) v.src = best.src
}

export function attach(el: HTMLImageElement | HTMLVideoElement, asset: MediaAsset) {
  const copy = asset.copy
  if (!copy) return
  const mode = saving() ? 'never' : asset.swap ?? 'intent'
  if (el instanceof HTMLVideoElement) void choose(el, asset)
  if (mode === 'never') return
  let run: () => unknown
  if (el instanceof HTMLImageElement) run = () => stillSwap(el)
  else if (copy.type === 'image/gif') run = gifOverlay(el, copy)
  else if ((copy.bytes ?? Infinity) <= VIDEO_CAP) run = videoSwap(el, copy.src)
  else return
  // Already in the HTTP cache from an earlier visit: use it now. `only-if-cached` never touches the network, and a blob
  // or Cache Storage copy wouldn't do, because a `blob:` URL can't be saved.
  const urls = (el as HTMLImageElement).srcset?.split(', ').map(c => c.split(' ')[0]!) || [copy.src]
  void Promise.any(urls.map(cached)).then(run, () => {})
  if (mode === 'intent') intent(el, run)
  else if ((copy.ratio ?? 1) <= 1.5) idle(run)
}
