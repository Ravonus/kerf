// Type by role (01 §2, PLAN §6): the spec defines the roles as tokens and leaves the element to the app, so these
// are what an app reads them through. A size, weight or colour is never a prop.
import { untrack } from '@weft-js/core'
import type { TextRole, Tone } from '@weft-js/core/ds'
import './styles'
import '@weft-js/warp-core/styles/components/link.css'
import './type.css'

type Open = { children?: unknown; [attr: string]: unknown }

type HeadingRole = 'display' | 'title' | 'heading' | 'label'

/** The role each level takes by default, so a page's `h1` is one size everywhere (`weft check` keeps the same table: D006). */
const ROLE: Record<number, HeadingRole> = {
  1: 'title',
  2: 'heading',
  3: 'heading',
  4: 'label',
  5: 'label',
  6: 'label',
}

/**
 * A real heading: `level` is the document outline (default 2) and picks the role: `title` for h1, `heading` for h2 and
 * h3, `label` below. `role` overrides the look, so the two can differ, and `weft check` flags a level that renders at
 * two roles in one app (D006). It follows `level` for skips too (D035).
 */
export function Heading({
  level = 2,
  role,
  children,
  ...rest
}: Open & { level?: 1 | 2 | 3 | 4 | 5 | 6 | undefined; role?: HeadingRole | undefined }) {
  const n = untrack(() => level)
  const look = () => role ?? ROLE[n]
  if (n === 1)
    return (
      <h1 data-scope="text" data-role={look()} {...rest}>
        {children}
      </h1>
    )
  if (n === 2)
    return (
      <h2 data-scope="text" data-role={look()} {...rest}>
        {children}
      </h2>
    )
  if (n === 3)
    return (
      <h3 data-scope="text" data-role={look()} {...rest}>
        {children}
      </h3>
    )
  if (n === 4)
    return (
      <h4 data-scope="text" data-role={look()} {...rest}>
        {children}
      </h4>
    )
  if (n === 5)
    return (
      <h5 data-scope="text" data-role={look()} {...rest}>
        {children}
      </h5>
    )
  return (
    <h6 data-scope="text" data-role={look()} {...rest}>
      {children}
    </h6>
  )
}

/** Text in a role. A paragraph by default; `inline` makes it a span. `tone` colours it, `subtle` and `faint` quieten it. */
export function Text({
  role,
  tone,
  subtle,
  faint,
  inline,
  children,
  ...rest
}: Open & {
  role?: TextRole
  tone?: Tone | undefined
  subtle?: boolean
  faint?: boolean
  inline?: boolean
}) {
  const ink = () => (subtle ? 'subtle' : faint ? 'faint' : undefined)
  if (untrack(() => inline))
    return (
      <span data-scope="text" data-role={role} data-tone={tone} data-ink={ink()} {...rest}>
        {children}
      </span>
    )
  return (
    <p data-scope="text" data-role={role} data-tone={tone} data-ink={ink()} {...rest}>
      {children}
    </p>
  )
}

/**
 * A link (05 §4): underlined, with the underline sweep. `subtle` takes the surrounding ink, and `external` opens a new
 * tab and says so. A bare `<a>` gets Warp's colour from the base layer; this adds the rest, and D007 points to it.
 */
export function Link({
  href,
  subtle,
  external,
  children,
  ...rest
}: Open & { href: string; subtle?: boolean | undefined; external?: boolean | undefined }) {
  if (untrack(() => external))
    return (
      <a
        data-scope="link"
        data-variant={subtle ? 'subtle' : undefined}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
        <span class="vh"> (opens in a new tab)</span>
      </a>
    )
  return (
    <a data-scope="link" data-variant={subtle ? 'subtle' : undefined} href={href} {...rest}>
      {children}
    </a>
  )
}
