// JSX types for `jsxImportSource: "@kerf/core"`. Types only: the compiler turns JSX into DOM code, so nothing imports this
// at runtime. Intrinsic elements check event handlers (`currentTarget` is the element) and leave other attributes open.

type Handler<E extends Event, T> = (event: E & { currentTarget: T; target: EventTarget }) => void
/** Multi-word events by their camelCase JSX names (`onKeyDown`): the compiler lowercases the name after `on`. */
type Camel = {
  KeyDown: 'keydown'
  KeyUp: 'keyup'
  KeyPress: 'keypress'
  BeforeInput: 'beforeinput'
  ContextMenu: 'contextmenu'
  MouseDown: 'mousedown'
  MouseUp: 'mouseup'
  MouseMove: 'mousemove'
  MouseEnter: 'mouseenter'
  MouseLeave: 'mouseleave'
  MouseOver: 'mouseover'
  MouseOut: 'mouseout'
  PointerDown: 'pointerdown'
  PointerUp: 'pointerup'
  PointerMove: 'pointermove'
  PointerEnter: 'pointerenter'
  PointerLeave: 'pointerleave'
  PointerOver: 'pointerover'
  PointerOut: 'pointerout'
  PointerCancel: 'pointercancel'
  TouchStart: 'touchstart'
  TouchEnd: 'touchend'
  TouchMove: 'touchmove'
  TouchCancel: 'touchcancel'
  FocusIn: 'focusin'
  FocusOut: 'focusout'
  DragStart: 'dragstart'
  DragEnd: 'dragend'
  DragEnter: 'dragenter'
  DragLeave: 'dragleave'
  DragOver: 'dragover'
  AnimationStart: 'animationstart'
  AnimationEnd: 'animationend'
  AnimationIteration: 'animationiteration'
  AnimationCancel: 'animationcancel'
  TransitionEnd: 'transitionend'
  TransitionStart: 'transitionstart'
  TransitionRun: 'transitionrun'
  TransitionCancel: 'transitioncancel'
  CompositionStart: 'compositionstart'
  CompositionUpdate: 'compositionupdate'
  CompositionEnd: 'compositionend'
  GotPointerCapture: 'gotpointercapture'
  LostPointerCapture: 'lostpointercapture'
  CanPlay: 'canplay'
  CanPlayThrough: 'canplaythrough'
  DurationChange: 'durationchange'
  LoadedData: 'loadeddata'
  LoadedMetadata: 'loadedmetadata'
  LoadStart: 'loadstart'
  RateChange: 'ratechange'
  TimeUpdate: 'timeupdate'
  VolumeChange: 'volumechange'
}
type Bubble<T> = {
  [K in keyof GlobalEventHandlersEventMap as `on${Capitalize<K & string>}`]?: Handler<
    GlobalEventHandlersEventMap[K],
    T
  >
} & { [K in keyof Camel as `on${K}`]?: Handler<GlobalEventHandlersEventMap[Camel[K]], T> } & {
  onDoubleClick?: Handler<MouseEvent, T>
}
/** Every event, and React's `onClickCapture` form of it. */
// oxlint-disable-next-line typescript/no-redundant-type-constituents -- a false positive: the mapped keys here aren't a union with `string` anywhere
type Events<T> = Bubble<T> & { [K in keyof Bubble<T> & string as `${K}Capture`]?: Bubble<T>[K] }

/** What an HTML or SVG element takes in JSX: its events, `ref`, `class`, `style`, and any other attribute. */
export type HTMLAttributes<T> = Events<T> & {
  children?: unknown
  key?: string | number | undefined
  /** `ref={el}` assigns a variable (`let el!: HTMLInputElement`); `ref={fn}` calls it with the element. */
  ref?: T | ((el: T) => void) | undefined
  class?: unknown
  /** The same as `class`, for React habits. */
  className?: unknown
  /** A string, or an object with camelCase or kebab-case names; numbers are px unless the property is unitless. */
  style?: unknown
  /** React's spelling of `innerHTML={html}`. The HTML isn't escaped. */
  dangerouslySetInnerHTML?: { __html: string } | null
  [attr: string]: unknown
}

/** The types TypeScript reads to check JSX. */
export namespace JSX {
  /** What a JSX expression is. */
  export type Element = unknown
  /** Names the prop that holds what's between the tags. */
  export interface ElementChildrenAttribute {
    children: {}
  }
  /** What every component takes, whatever its props: `key`, and `bind:` on a prop. */
  export interface IntrinsicAttributes {
    key?: string | number | undefined
    [bound: `bind:${string}`]: unknown
  }
  /** Every tag and what it takes. */
  export type IntrinsicElements = {
    [K in keyof HTMLElementTagNameMap]: HTMLAttributes<HTMLElementTagNameMap[K]>
  } & {
    [K in Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>]: HTMLAttributes<
      SVGElementTagNameMap[K]
    >
  }
}
