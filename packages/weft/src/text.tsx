// @weft-js/core/text: <Text> (research 31 §6). `reserve` holds the text's place while it isn't here yet, with placeholder text
// in the real element, so the browser gives it the real font, width and wrapping and there's nothing to measure. It
// marks the placeholder for warp's SkeletonScope (05 §5) and has no CSS of its own. `stream` is X035's fix.

import { derived, effect, flush, onCleanup, onMount, state, untrack } from '@weft-js/core'
import { placeholder } from './shape'

export interface TextProps {
  as?: 'p' | 'span' | 'div' | 'li' | 'h1' | 'h2' | 'h3' | 'h4'
  /** Hold a place while there's no text: a length, a sample string (from `.shape`), or `true` for one line's worth. */
  reserve?: boolean | number | string
  /**
   * Streamed text. Tokens land once a frame, the height only grows and in whole lines, and complete blocks never
   * rewrite, so a tail that reflows never moves the lines above it (X035).
   */
  stream?: boolean
  /** With `stream`: render a complete block (Markdown, say). The tail stays plain text until its block closes. */
  format?: (block: string) => any
  class?: string
  style?: string
  children?: any
}

const hosts: Record<string, (a: () => any, c: () => any) => any> = {
  p: (a, c) => <p {...a()}>{c()}</p>,
  span: (a, c) => <span {...a()}>{c()}</span>,
  div: (a, c) => <div {...a()}>{c()}</div>,
  li: (a, c) => <li {...a()}>{c()}</li>,
  h1: (a, c) => <h1 {...a()}>{c()}</h1>,
  h2: (a, c) => <h2 {...a()}>{c()}</h2>,
  h3: (a, c) => <h3 {...a()}>{c()}</h3>,
  h4: (a, c) => <h4 {...a()}>{c()}</h4>,
}

const FENCE = /^ {0,3}(```|~~~)/

/**
 * Split streamed Markdown where it's safe: everything before the last blank line outside a code fence is complete and
 * never changes; the rest is the tail, and it's still being written (research 11 §7.3).
 */
export function streamBlocks(text: string): { done: string[]; tail: string } {
  const done: string[] = []
  const lines = text.split('\n')
  let block: string[] = [], fence = false
  lines.forEach((line, i) => {
    const last = i === lines.length - 1
    if (FENCE.test(line)) fence = !fence
    if (!fence && !last && !line.trim()) {
      if (block.length) done.push(block.join('\n'))
      block = []
    } else block.push(line)
  })
  return { done, tail: block.join('\n') }
}

/** Blocks are appended, so a complete one is never written twice. */
function Blocks(props: { text: () => string; format?: (block: string) => any }) {
  const parts = derived(() => streamBlocks(props.text()))
  const list = derived(() => parts.value.done.map((text, i) => ({ text, i })))
  return (
    <>
      {list.value.map(b => <div key={b.i} data-block="done" style={props.format ? undefined : 'white-space:pre-wrap'}>{props.format ? props.format(b.text) : b.text}</div>)}
      <div data-block="tail" style="white-space:pre-wrap">{parts.value.tail}</div>
    </>
  )
}

export function Text(props: TextProps) {
  let el: HTMLElement | undefined
  const kid = derived(() => (typeof props.children === 'function' ? props.children() : props.children))
  const streaming = untrack(() => props.stream)
  const shown = state<any>(streaming ? untrack(() => kid.value) : undefined) // one write per frame, however many tokens
  const value = streaming ? shown : kid
  const busy = derived(() => !!props.reserve && (value.value == null || value.value === '' || value.value === false))
  const sample = () => (typeof props.reserve === 'string' ? props.reserve : placeholder(typeof props.reserve === 'number' ? props.reserve : 80))
  const live = derived(() => streaming && typeof value.value === 'string') // read alone, so a token doesn't rebuild the blocks
  if (streaming) {
    onMount(() => {
      let high = 0, frame = 0, width = 0
      // The frame lays out after this write anyway, so reading the height here costs no extra layout.
      const hold = () => {
        const box = el!.getBoundingClientRect()
        if (box.width !== width) { high = 0; width = box.width } // a new width wraps differently: the old height means nothing
        const leading = parseFloat(getComputedStyle(el!).lineHeight)
        high = Math.max(high, leading ? Math.ceil(box.height / leading - 0.01) * leading : box.height)
        el!.style.minBlockSize = `${high}px`
      }
      effect(() => kid.value, () => {
        frame ||= requestAnimationFrame(() => {
          frame = 0
          shown.value = untrack(() => kid.value)
          flush()
          hold()
        })
      })
      onCleanup(() => cancelAnimationFrame(frame))
    })
  }
  const content = () => {
    if (busy.value) return <span data-skeleton style="color:transparent">{sample()}</span>
    return live.value ? <Blocks text={() => value.value ?? ''} format={props.format} /> : value.value
  }
  return hosts[untrack(() => props.as) ?? (streaming ? 'div' : 'p')](
    () => ({
      class: props.class,
      style: props.style,
      ref: (e: HTMLElement) => (el = e),
      'data-scope': busy.value ? 'skeleton-scope' : undefined,
      'aria-busy': busy.value ? 'true' : undefined,
    }),
    content,
  )
}

export { fit, lines, measure, measureEngine, type FitSpec, type MeasureHandle, type MeasureProvider, type MeasureSpec, type TextBox } from './measure'
