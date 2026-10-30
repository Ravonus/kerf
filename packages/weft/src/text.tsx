// weft/text: <Text> (research 31 §6). `reserve` holds the text's place while it isn't here yet, with placeholder text
// in the real element, so the browser gives it the real font, width and wrapping and there's nothing to measure. It
// marks the placeholder for warp's SkeletonScope (05 §5) and has no CSS of its own. `stream` is X035's fix.

import { derived, effect, onCleanup, onMount, untrack } from 'weft'
import { placeholder } from './shape'

export interface TextProps {
  as?: 'p' | 'span' | 'div' | 'li' | 'h1' | 'h2' | 'h3' | 'h4'
  /** Hold a place while there's no text: a length, a sample string (from `.shape`), or `true` for one line's worth. */
  reserve?: boolean | number | string
  /** Streamed text: the height only grows, so a tail that reflows never moves the lines above upward. */
  stream?: boolean
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

export function Text(props: TextProps) {
  let el: HTMLElement | undefined
  const kid = derived(() => (typeof props.children === 'function' ? props.children() : props.children))
  const busy = derived(() => !!props.reserve && (kid.value == null || kid.value === '' || kid.value === false))
  const sample = () => (typeof props.reserve === 'string' ? props.reserve : placeholder(typeof props.reserve === 'number' ? props.reserve : 80))
  if (untrack(() => props.stream)) {
    onMount(() => {
      let high = 0, frame = 0
      effect(() => kid.value, () => {
        frame ||= requestAnimationFrame(() => {
          frame = 0
          high = Math.max(high, el!.getBoundingClientRect().height)
          el!.style.minBlockSize = `${high}px`
        })
      })
      onCleanup(() => cancelAnimationFrame(frame))
    })
  }
  return hosts[untrack(() => props.as) ?? 'p'](
    () => ({
      class: props.class,
      style: props.style,
      ref: (e: HTMLElement) => (el = e),
      'data-scope': busy.value ? 'skeleton-scope' : undefined,
      'aria-busy': busy.value ? 'true' : undefined,
    }),
    () => (busy.value ? <span data-skeleton style="color:transparent">{sample()}</span> : kid.value),
  )
}
