// JSX types for `jsxImportSource: "weft"`. Types only: the compiler turns JSX into DOM code, so nothing imports this
// at runtime. Intrinsic elements check event handlers (`currentTarget` is the element) and leave other attributes open.

type Handler<E extends Event, T> = (event: E & { currentTarget: T; target: EventTarget }) => void
/** Multi-word events by their camelCase JSX names (`onKeyDown`): the compiler lowercases the name after `on`. */
type Camel = {
  KeyDown: 'keydown'; KeyUp: 'keyup'; KeyPress: 'keypress'; BeforeInput: 'beforeinput'; ContextMenu: 'contextmenu'
  MouseDown: 'mousedown'; MouseUp: 'mouseup'; MouseMove: 'mousemove'; MouseEnter: 'mouseenter'; MouseLeave: 'mouseleave'
  MouseOver: 'mouseover'; MouseOut: 'mouseout'; PointerDown: 'pointerdown'; PointerUp: 'pointerup'
  PointerMove: 'pointermove'; PointerEnter: 'pointerenter'; PointerLeave: 'pointerleave'; PointerOver: 'pointerover'
  PointerOut: 'pointerout'; PointerCancel: 'pointercancel'; TouchStart: 'touchstart'; TouchEnd: 'touchend'
  TouchMove: 'touchmove'; TouchCancel: 'touchcancel'; FocusIn: 'focusin'; FocusOut: 'focusout'; DragStart: 'dragstart'
  DragEnd: 'dragend'; DragEnter: 'dragenter'; DragLeave: 'dragleave'; DragOver: 'dragover'
  AnimationStart: 'animationstart'; AnimationEnd: 'animationend'; AnimationIteration: 'animationiteration'
  AnimationCancel: 'animationcancel'; TransitionEnd: 'transitionend'; TransitionStart: 'transitionstart'
  TransitionRun: 'transitionrun'; TransitionCancel: 'transitioncancel'; CompositionStart: 'compositionstart'
  CompositionUpdate: 'compositionupdate'; CompositionEnd: 'compositionend'; GotPointerCapture: 'gotpointercapture'
  LostPointerCapture: 'lostpointercapture'; CanPlay: 'canplay'; CanPlayThrough: 'canplaythrough'
  DurationChange: 'durationchange'; LoadedData: 'loadeddata'; LoadedMetadata: 'loadedmetadata'; LoadStart: 'loadstart'
  RateChange: 'ratechange'; TimeUpdate: 'timeupdate'; VolumeChange: 'volumechange'
}
type Bubble<T> = {
  [K in keyof GlobalEventHandlersEventMap as `on${Capitalize<K & string>}`]?: Handler<GlobalEventHandlersEventMap[K], T>
} & { [K in keyof Camel as `on${K}`]?: Handler<GlobalEventHandlersEventMap[Camel[K]], T> } & { onDoubleClick?: Handler<MouseEvent, T> }
/** Every event, and React's `onClickCapture` form of it. */
type Events<T> = Bubble<T> & { [K in keyof Bubble<T> & string as `${K}Capture`]?: Bubble<T>[K] }

export type HTMLAttributes<T> = Events<T> & {
  children?: unknown
  key?: string | number
  /** `ref={el}` assigns a variable (`let el!: HTMLInputElement`); `ref={fn}` calls it with the element. */
  ref?: T | ((el: T) => void)
  class?: unknown
  /** The same as `class`, for React habits. */
  className?: unknown
  /** A string, or an object with camelCase or kebab-case names; numbers are px unless the property is unitless. */
  style?: unknown
  /** React's spelling of `innerHTML={html}`. The HTML isn't escaped. */
  dangerouslySetInnerHTML?: { __html: string } | null
  [attr: string]: unknown
}

export namespace JSX {
  export type Element = any
  export interface ElementChildrenAttribute { children: {} }
  export interface IntrinsicAttributes { key?: string | number }
  export type IntrinsicElements = { [K in keyof HTMLElementTagNameMap]: HTMLAttributes<HTMLElementTagNameMap[K]> } & {
    [K in Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>]: HTMLAttributes<SVGElementTagNameMap[K]>
  }
}
