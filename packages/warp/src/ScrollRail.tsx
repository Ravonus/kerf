import { onCleanup, onMount } from '@weft-js/core'
import './styles'
import '@weft-js/warp-core/styles/layout/scroll-rail.css'

/**
 * The page's scrollbar, drawn from below a sticky header (`--warp-scroll-rail-top`) instead of over it. The document
 * still scrolls, so keys, anchors, scroll restore and a phone's collapsing address bar work as ever; with a mouse or
 * trackpad the native bar steps aside and this thumb shows where you are, drags and jumps by a page on a press. Touch
 * screens keep their own overlay bar. Put one in the root layout.
 *
 * `below` names the sticky header (a CSS selector). The rail then starts at that header's bottom edge wherever it is:
 * under a banner that scrolls away, at a height that changes with the width, or as it shrinks on scroll. Without it,
 * the rail starts at `--warp-scroll-rail-top`.
 */
export function ScrollRail(props: { below?: string } = {}) {
  let rail!: HTMLElement
  let thumb!: HTMLElement
  onMount(() => {
    const doc = document.documentElement
    let frame = 0
    let idle: ReturnType<typeof setTimeout> | undefined
    // the rail's top follows the header's bottom edge, measured as the page moves
    let top = -1
    const place = () => {
      const header = props.below ? document.querySelector(props.below) : null
      if (!header) return
      const edge = Math.max(0, Math.round(header.getBoundingClientRect().bottom))
      if (edge !== top) rail.style.insetBlockStart = `${(top = edge)}px`
    }
    const size = () => {
      const track = rail.clientHeight
      const total = doc.scrollHeight - innerHeight
      const h = Math.max(32, (track * innerHeight) / doc.scrollHeight)
      return { track, total, h }
    }
    const draw = () => {
      frame = 0
      place()
      const { track, total, h } = size()
      rail.toggleAttribute('data-none', total <= 1)
      thumb.style.blockSize = `${h}px`
      thumb.style.translate = `0 ${total > 0 ? ((track - h) * scrollY) / total : 0}px`
    }
    const moved = () => {
      frame ||= requestAnimationFrame(draw)
      rail.setAttribute('data-active', '')
      clearTimeout(idle)
      idle = setTimeout(() => rail.removeAttribute('data-active'), 900)
    }
    const press = (e: PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      if (e.target !== thumb) {
        const below = e.clientY > thumb.getBoundingClientRect().bottom
        scrollBy({ top: (below ? 1 : -1) * innerHeight * 0.9 })
        return
      }
      const { track, total, h } = size()
      const from = e.clientY
      const start = scrollY
      thumb.setPointerCapture(e.pointerId)
      rail.setAttribute('data-dragging', '')
      const move = (m: PointerEvent) =>
        scrollTo({
          top: start + ((m.clientY - from) * total) / Math.max(1, track - h),
          behavior: 'instant',
        })
      const up = () => {
        rail.removeAttribute('data-dragging')
        thumb.removeEventListener('pointermove', move)
        thumb.removeEventListener('pointerup', up)
        thumb.removeEventListener('pointercancel', up)
      }
      thumb.addEventListener('pointermove', move)
      thumb.addEventListener('pointerup', up)
      thumb.addEventListener('pointercancel', up)
    }
    const grows = new ResizeObserver(moved)
    grows.observe(document.body)
    addEventListener('scroll', moved, { passive: true })
    addEventListener('resize', moved)
    rail.addEventListener('pointerdown', press)
    draw()
    onCleanup(() => {
      grows.disconnect()
      removeEventListener('scroll', moved)
      removeEventListener('resize', moved)
      rail.removeEventListener('pointerdown', press)
      cancelAnimationFrame(frame)
      clearTimeout(idle)
    })
  })
  return (
    <div ref={(n) => (rail = n)} data-scope="scroll-rail" data-none="" aria-hidden="true">
      <div ref={(n) => (thumb = n)} data-part="thumb"></div>
    </div>
  )
}
