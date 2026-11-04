// Layout primitives (02 §3, PLAN §6): each is the spec's `data-scope` box and nothing else. Relationships, not pixels:
// `gap` is the closed Space scale, widths are named, and there is no breakpoint prop, since the boxes answer to their
// container. `as` picks the element from the tags below; weft has no dynamic tag, so each is one compiled template.
import { untrack } from '@weft-js/core'
import type { Space } from '@weft-js/core/ds'
import './styles'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/base.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/grid.css'
import '@weft-js/warp-core/styles/layout/split.css'
import '@weft-js/warp-core/styles/layout/center.css'
import '@weft-js/warp-core/styles/layout/cover.css'
import '@weft-js/warp-core/styles/layout/frame.css'
import '@weft-js/warp-core/styles/layout/spacer.css'
import '@weft-js/warp-core/styles/layout/inset.css'
import './layout.css'

type Open = { children?: unknown; [attr: string]: unknown }
type Tag = keyof typeof TAGS
/** A breakpoint a layout can switch at. */
export type Step = 'tablet' | 'desktop'
type Box = Open & { as?: Tag | undefined; gap?: Space | undefined }

function Div({ children, ...rest }: Open) {
  return <div {...rest}>{children}</div>
}
function Section({ children, ...rest }: Open) {
  return <section {...rest}>{children}</section>
}
function Article({ children, ...rest }: Open) {
  return <article {...rest}>{children}</article>
}
function Main({ children, ...rest }: Open) {
  return <main {...rest}>{children}</main>
}
function Header({ children, ...rest }: Open) {
  return <header {...rest}>{children}</header>
}
function Footer({ children, ...rest }: Open) {
  return <footer {...rest}>{children}</footer>
}
function Nav({ children, ...rest }: Open) {
  return <nav {...rest}>{children}</nav>
}
function Aside({ children, ...rest }: Open) {
  return <aside {...rest}>{children}</aside>
}
function Form({ children, ...rest }: Open) {
  return <form {...rest}>{children}</form>
}
function Ul({ children, ...rest }: Open) {
  return <ul {...rest}>{children}</ul>
}
function Ol({ children, ...rest }: Open) {
  return <ol {...rest}>{children}</ol>
}
const TAGS = {
  div: Div,
  section: Section,
  article: Article,
  main: Main,
  header: Header,
  footer: Footer,
  nav: Nav,
  aside: Aside,
  form: Form,
  ul: Ul,
  ol: Ol,
}

function Element({ as, ...rest }: Box) {
  const Tag = TAGS[untrack(() => as) ?? 'div']
  return <Tag {...rest} />
}

const MIN_STEPS = new Set(['xs', 'sm', 'md', 'lg'])

/** Vertical flow; the gap is the relationship between the children. */
export function Stack({
  gap,
  align,
  divided,
  ...rest
}: Box & { align?: 'start' | 'center' | 'end' | undefined; divided?: boolean | undefined }) {
  return (
    <Element
      data-scope="stack"
      data-gap={gap}
      data-align={align}
      data-divided={divided ? '' : undefined}
      {...rest}
    />
  )
}

/** A horizontal cluster that wraps. `reflow` makes it a Stack below that step; `wrap={false}` keeps it on one line. */
export function Row({
  gap,
  justify,
  align,
  wrap,
  reflow,
  ...rest
}: Box & {
  justify?: 'start' | 'between' | 'end' | 'center' | undefined
  align?: 'start' | 'baseline' | undefined
  wrap?: boolean | undefined
  reflow?: Step | undefined
}) {
  return (
    <Element
      data-scope="row"
      data-gap={gap}
      data-justify={justify === 'start' ? undefined : justify}
      data-align={align}
      data-wrap={wrap === false ? 'none' : undefined}
      data-reflow={reflow}
      {...rest}
    />
  )
}

/** Intrinsic columns: as many as fit at `min`, a step or a length like `12rem`, never more than `cols`. A child with `data-span="full"` takes the row. */
export function Grid({
  gap,
  min,
  cols,
  ...rest
}: Box & {
  min?: 'xs' | 'sm' | 'md' | 'lg' | (string & {}) | undefined
  cols?: 2 | 3 | 4 | 6 | undefined
}) {
  return (
    <Element
      data-scope="grid"
      data-gap={gap}
      data-min={min && MIN_STEPS.has(min) ? min : undefined}
      data-cols={cols}
      style={min && !MIN_STEPS.has(min) ? `--_min:${min}` : undefined}
      {...rest}
    />
  )
}

/** A fixed side and a fluid main, stacked below its step. Each child is a container. */
export function Split({
  gap,
  side,
  width,
  at,
  ...rest
}: Box & {
  side?: 'start' | 'end' | undefined
  width?: 'rail' | 'nav' | 'list' | 'half' | undefined
  at?: Step | undefined
}) {
  return (
    <Element
      data-scope="split"
      data-gap={gap}
      data-side={side === 'start' ? undefined : side}
      data-width={width}
      data-at={at === 'tablet' ? undefined : at}
      {...rest}
    />
  )
}

/** A measured column, centred, with page gutters when `gutter` is set. */
export function Center({
  max,
  gutter,
  intrinsic,
  ...rest
}: Box & {
  max?: 'measure' | 'narrow' | 'content' | 'wide' | undefined
  gutter?: boolean | undefined
  intrinsic?: boolean | undefined
}) {
  return (
    <Element
      data-scope="center"
      data-max={max === 'content' ? undefined : max}
      data-gutter={gutter ? '' : undefined}
      data-intrinsic={intrinsic ? '' : undefined}
      {...rest}
    />
  )
}

/** Fills the screen: the child with `data-part="center"` is centred, a header and footer hug the edges (auth, error pages). */
export function Cover({ gap, min, ...rest }: Box & { min?: 'screen' | 'fill' | undefined }) {
  return (
    <Element
      data-scope="cover"
      data-gap={gap}
      data-min={min === 'screen' ? undefined : min}
      {...rest}
    />
  )
}

/** A fixed-ratio media box with no chrome of its own. */
export function Frame({
  ratio,
  ...rest
}: Box & { ratio?: 'square' | '4:3' | '3:2' | '16:9' | '21:9' | '3:4' | '9:16' | undefined }) {
  return <Element data-scope="frame" data-ratio={ratio === '16:9' ? undefined : ratio} {...rest} />
}

/** Takes the free space in a Row or Stack, so what follows sits at the far end. */
export function Spacer(rest: Open) {
  return <div data-scope="spacer" {...rest}></div>
}

/** A sunken, padded region. */
export function Inset({ pad, ...rest }: Box & { pad?: 'group' | 'section' | undefined }) {
  return <Element data-scope="inset" data-pad={pad === 'section' ? pad : undefined} {...rest} />
}
