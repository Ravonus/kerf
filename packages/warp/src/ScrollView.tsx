import { scroller, type ScrollOptions, type Scroller } from '@weft-js/scroll'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/scroll/styles.css'
import '@weft-js/warp-core/styles/layout/scroll-view.css'

/** Props for ScrollView: every `@weft-js/scroll` option, plus the box's own class and style. */
export interface ScrollViewProps extends ScrollOptions {
  children?: unknown
  class?: string | undefined
  style?: string | undefined
  /** Receives the scroller once it runs: `scrollTo`, `scrollIntoView`, `state` and the rest. */
  controller?: ((s: Scroller) => void) | undefined
}

/**
 * A scroll area with Warp's bars (`@weft-js/scroll`), drawn in the DOM or, with `renderer={canvas()}` from
 * `@weft-js/scroll/canvas`, on a canvas. By default the browser scrolls it and the thumb follows on the compositor;
 * `mode="engine"` runs wheel, touch and momentum in JavaScript instead. Give it a height. Before its script runs it
 * scrolls natively with the browser's own bar, so the server's HTML works on its own.
 */
export function ScrollView(props: ScrollViewProps) {
  let root: HTMLDivElement | undefined
  const make = (el: HTMLDivElement, o: ScrollOptions & Pick<ScrollViewProps, 'controller'>) => {
    const s = scroller(el, o)
    o.controller?.(s)
    return s
  }
  use(
    make,
    () => root,
    () => {
      const { children: _children, class: _class, style: _style, ...options } = props
      return options
    },
  )
  return (
    <div
      ref={(n) => (root = n)}
      data-scope="scroll-view"
      data-scroll=""
      data-axes={props.axes ?? 'both'}
      class={props.class}
      style={props.style}
    >
      <div data-part="viewport" aria-label={props.label} role={props.label ? 'region' : undefined}>
        <div data-part="content">{props.children}</div>
      </div>
      <div data-part="scrollbar" data-orientation="vertical">
        <div data-part="thumb"></div>
      </div>
      <div data-part="scrollbar" data-orientation="horizontal">
        <div data-part="thumb"></div>
      </div>
    </div>
  )
}
