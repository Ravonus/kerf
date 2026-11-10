// The public shapes: options in, state out, and what a renderer is handed each frame.

/** A scroll axis. */
export type Axis = 'x' | 'y'
/** Where the movement came from. `native` is the browser moving it: focus, find-in-page, an anchor. */
export type ScrollSource = 'wheel' | 'touch' | 'key' | 'bar' | 'api' | 'snap' | 'select' | 'native'
/** Maps 0..1 time to 0..1 progress. */
export type Easing = (t: number) => number

/** The thumb's size. Leave `size` out for a thumb that grows and shrinks with the content, as a native one does. */
export interface ThumbOptions {
  /** A fixed length in px: the thumb never grows or shrinks. */
  size?: number
  /** The shortest a proportional thumb gets. Default 24. */
  min?: number
  /** The longest a proportional thumb gets. */
  max?: number
}

/** How the bars look and where they sit. Colours are any CSS colour. */
export interface BarOptions {
  /** Thumb thickness at rest, px. Default 6. */
  width?: number
  /** Thumb thickness while hovered or dragged, px. Default 10. */
  hoverWidth?: number
  /** Gap between the thumb and the edge of the area, px. Default 2. */
  inset?: number
  /** Corner radius, px. Default: half the thickness. */
  radius?: number
  color?: string
  hoverColor?: string
  activeColor?: string
  /** The track behind the thumb. Default transparent. */
  track?: string
  hoverTrack?: string
  /** `overlay` floats over the content; `gutter` reserves room beside it. Default `overlay`. */
  layout?: 'overlay' | 'gutter'
  /** When the bar shows. `scroll` (default): while scrolling or hovered. `hover`: while the pointer is over the area. */
  show?: 'always' | 'scroll' | 'hover' | 'never'
  /** How long the bar stays after scrolling stops, ms. Default 900. */
  hideDelay?: number
  /** Fade length, ms. Default 200. */
  fade?: number
  /** A press on the track: `page` steps a page (repeating while held), `jump` moves there. Alt flips it. */
  trackClick?: 'page' | 'jump'
}

/** Snapping, as CSS scroll-snap does it. */
export interface SnapOptions {
  /** Snap positions in px, or a function returning them (read again on every resize). */
  points?: readonly number[] | (() => readonly number[])
  /** Elements in the content to snap to, aligned by `align`. */
  selector?: string
  align?: 'start' | 'center' | 'end'
  /** `mandatory` always rests on a point; `proximity` only when within `proximity` px. Default `proximity`. */
  type?: 'mandatory' | 'proximity'
  proximity?: number
  axis?: Axis
}

/** What a scroller does and how it looks. Every field is optional. */
export interface ScrollOptions {
  /**
   * Who moves the content. `native` (default): the browser scrolls it, on the compositor, so it keeps moving while
   * the main thread is busy; this draws the bars and runs the API, and the wheel, touch and key options are the
   * browser's own. `engine`: every input runs here, with this package's easing, momentum, rubber band and keys.
   */
  mode?: 'native' | 'engine'
  /** Which axes scroll. Default `both`: an axis whose content fits shows no bar. */
  axes?: Axis | 'both'
  thumb?: ThumbOptions
  bar?: BarOptions
  /** Draws the bars. Default: DOM elements styled by CSS. `canvas()` from `@weft-js/scroll/canvas` paints them. */
  renderer?: Renderer
  /** Animation length for wheel notches, keys and smooth `scrollTo`, ms. Default 220. */
  duration?: number
  easing?: Easing
  /** Touch inertia: the share of velocity kept per ms. Default 0.998 (iOS's normal rate). */
  friction?: number
  /** Coast after a touch fling. Default true. */
  momentum?: boolean
  /** Wheel distance multiplier. Default 1. */
  wheelSpeed?: number
  /** px for a wheel "line" and an arrow key. Default 40. */
  lineHeight?: number
  /** Rubber-band past the edges on touch. Default `bounce`. */
  overscroll?: 'bounce' | 'none'
  /** At an edge, hand the gesture to the scroller outside (`auto`), or keep it (`contain`). Default `auto`. */
  chain?: 'auto' | 'contain'
  snap?: SnapOptions
  /** Arrows, Page keys, Home, End and Space scroll the area. Default true. */
  keyboard?: boolean
  /** Scroll while a text selection or a drag is held past the edge. Default true. */
  autoscroll?: boolean
  /** Touch input: `js` (default) runs it here; `native` leaves touch to the browser. */
  touch?: 'js' | 'native'
  /** Drag the content with a mouse, as a hand tool. Default false. */
  grab?: boolean
  /** `reduce` makes every animated scroll instant. Default `auto`: follows prefers-reduced-motion. */
  motion?: 'auto' | 'reduce' | 'full'
  /** The viewport's accessible name. With it, the viewport is a `region` landmark. */
  label?: string
  /** Also fire a `scroll` event in the frame a position is written, so listeners draw with that frame. Default true. */
  syncEvents?: boolean
  /** Called once per frame in which the position or overscroll changed. */
  onScroll?: (state: ScrollState) => void
}

/** Where the scroller is. `x` is the DOM's `scrollLeft`, so it runs negative in right-to-left content. */
export interface ScrollState {
  x: number
  y: number
  /** The furthest `y` and furthest-from-zero `x` can go. */
  maxX: number
  maxY: number
  /** 0 at the start, 1 at the end, for each axis. In right-to-left content `progressX` 0 is the right edge. */
  progressX: number
  progressY: number
  /** Rubber-band offset past an edge, px. */
  overscrollX: number
  overscrollY: number
  /** px per ms. */
  velocityX: number
  velocityY: number
  source: ScrollSource
}

/** One bar as a renderer draws it: boxes are px within the bar's own track. */
export interface BarFrame {
  axis: Axis
  track: { width: number; height: number }
  thumb: { x: number; y: number; width: number; height: number }
  /** 0 at rest, 1 fully hovered: a renderer can ease the thickness with it. */
  grow: number
  hover: boolean
  active: boolean
  progress: number
  /** The thumb's offset along the track at the scroll start and at the end, px: what a scroll timeline animates. */
  span: { start: number; end: number }
  rtl: boolean
  bar: Required<Omit<BarOptions, 'radius'>> & { radius: number }
}

/** Draws the bars. The scroller owns the track elements and their pointer handling; a renderer only paints. */
export interface Renderer {
  /** Build what it needs inside a bar's track element. */
  mount(track: HTMLElement, axis: Axis): void
  /** Paint a frame. Called only when something about it changed. */
  draw(track: HTMLElement, frame: BarFrame): void
  /** Called while `grow` eases: true asks for another frame. */
  animates?: boolean
  unmount(track: HTMLElement): void
}

/** What `scroller` returns. */
export interface Scroller {
  /** The current position and limits. */
  state(): ScrollState
  scrollTo(to: { top?: number; left?: number; behavior?: ScrollBehavior }): void
  scrollBy(by: { top?: number; left?: number; behavior?: ScrollBehavior }): void
  /** Bring `el` into view, as `Element.scrollIntoView` does, within this scroller only. */
  scrollIntoView(
    el: Element,
    o?: {
      block?: ScrollLogicalPosition
      inline?: ScrollLogicalPosition
      behavior?: ScrollBehavior
      margin?: number
    },
  ): void
  /** Stop any animation or coast where it is. */
  stop(): void
  /** Measure again: call after a change no ResizeObserver can see. */
  refresh(): void
  update(options: ScrollOptions): void
  destroy(): void
  readonly viewport: HTMLElement
}
