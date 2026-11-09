/** How a property's value is read: a colour, a length, a space or radius step, a time, a shadow, an easing, a font. */
export type PropKind =
  | 'color'
  | 'length'
  | 'space'
  | 'radius'
  | 'time'
  | 'shadow'
  | 'ease'
  | 'font'
  | 'plain'

/** Where one property lands: CSS properties or tone channels, and how its value reads. */
export interface PartProp {
  css?: string | string[]
  vars?: string[]
  kind: PropKind
}

/** One restylable element: its selector, its own properties, its states and inner parts. */
export interface PartSpec {
  about?: string
  for?: string[]
  sel: string
  props?: Record<string, PartProp>
  states?: string[]
  sub?: Record<string, PartSpec>
}

/** States a part can take, as the selector each adds. */
export const STATES: Record<string, string>
/** Properties every part takes. */
export const PROPS: Record<string, PartProp>
/** The parts, by name. */
export const PARTS: Record<string, PartSpec>
/** Every part, sub-parts included, as `[path, spec]` with `path` like `nav.underline`. */
export function allParts(): [string, PartSpec][]
/** A part's properties: the shared ones, then its own. */
export function propsOf(spec: PartSpec): Record<string, PartProp>
/** The states a part takes. */
export function statesOf(spec: PartSpec): string[]
