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
 * A scroll area whose scrolling runs in JavaScript (`@weft-js/scroll`): wheel, trackpad, touch with inertia, keys,
 * focus and nested hand-off behave as native ones do, the same in every browser, and the bars are Warp's, drawn in
 * the DOM or, with `renderer={canvas()}` from `@weft-js/scroll/canvas`, on a canvas. Give it a height. Before its
 * script runs it scrolls natively, so the server's HTML works on its own.
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
