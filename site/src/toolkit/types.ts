// The shape of a component page. Words and examples are written by hand in docs/ and examples/; names, props and types are
// read from warp's source by scripts/toolkit.mjs, so those can't drift.
export type Stage = 'center' | 'narrow' | 'start' | 'fill'

export type ExampleRef = {
  /** A named export of this group's examples file. Also the anchor. */
  id: string
  title: string
  /** One sentence. `code` in backticks. */
  note?: string | undefined
  /** center: centred cluster (default). narrow: one column, 360 wide, for fields. start: top left. fill: the whole stage. */
  stage?: Stage | undefined
  /** The stage's height while it loads, and its minimum after. */
  height?: number | undefined
  codeOpen?: boolean | undefined
  /** Pin this example's scope, whatever the page bar says. */
  scope?: { expression?: 'quiet' | 'balanced' | 'vivid'; theme?: 'light' | 'dark'; form?: 'phone' | 'tablet' } | undefined
  /** Show a Replay button: for toasts and entrances. */
  replay?: boolean | undefined
}

export type Section =
  | { kind: 'variants' | 'sizes' | 'states' | 'composition'; title: string; intro?: string; examples: ExampleRef[] }
  | { kind: 'prose'; title: string; md: string }

export type Knob = {
  prop: string
  control?: 'segmented' | 'select' | 'switch' | 'text' | 'slider'
  label?: string
  /** Else the prop's union, from the type checker. */
  options?: (string | number)[]
  min?: number
  max?: number
  step?: number
  /** What the stage starts with. Code prints a prop only when it differs from `default`. */
  initial?: unknown
  /** The component's own default, when the source can't say. */
  default?: unknown
  when?: { prop: string; is: unknown[] }
}

export type Playground = {
  /** A named export that takes the knobs as props. */
  example: string
  /** `{props}` and `{children}` are filled in: '<Button{props}>{children}</Button>'. */
  code: string
  knobs: Knob[]
  presets?: { label: string; values: Record<string, unknown> }[]
  stage?: Stage
  height?: number
}

export type Doc = {
  /** Must be one of warp's exports. */
  component: string
  /** One plain sentence, at most 120 characters. The page's lede and its meta description. */
  summary: string
  /** The example that opens the page. Else the first one, simplest section first. */
  hero?: string
  use?: { when: string[]; instead?: { name: string; why: string }[] }
  playground?: Playground
  sections: Section[]
  /** The index tile: an export, default the page's first example. */
  tile?: string
  /** How the tile lays that export out, when it isn't one of the page's examples. */
  tileStage?: Stage
  /**
   * How the card fits the example. Each card lays it out at a working width, then scales it to the card. `contain`
   * shrinks a tall example until all of it shows (charts do this); `top` keeps the width and shows its top, fading out.
   * Unset, a tall example shrinks while it stays readable and otherwise shows its top.
   */
  tileFit?: 'contain' | 'top'
  /** The width, in CSS pixels, the card lays the example out at before scaling it. Smaller draws it larger. */
  tileWidth?: number
  keyboard?: [keys: string, action: string][]
  a11yNotes?: string[]
  /** Fills in what the source's doc comments don't say. */
  propDocs?: Record<string, string>
  hideProps?: string[]
  related?: string[]
}

export type DocGroup = {
  /** The name of the examples file. */
  file: string
  title: string
  intro: string
  /** A pack: the index shows four tiles and a link to the rest. */
  pack?: boolean
  docs: Doc[]
}
