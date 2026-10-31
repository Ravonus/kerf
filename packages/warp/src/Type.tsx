// Type by role (01 §2, PLAN §6): the spec defines the roles as tokens and leaves the element to the app, so these two
// are what an app reads them through. A size, weight or colour is never a prop.
import { untrack } from 'weft'
import type { TextRole, Tone } from 'weft/ds'
import './styles'
import './type.css'

type Open = { children?: any; [attr: string]: any }

/**
 * A real heading: `level` is the document outline (default 2), `role` the look, so the two can differ. `weft check`
 * follows `level` for skips (D035).
 */
export function Heading({ level = 2, role = 'heading', children, ...rest }: Open & { level?: 1 | 2 | 3 | 4 | 5 | 6; role?: 'display' | 'title' | 'heading' | 'label' }) {
  const n = untrack(() => level)
  if (n === 1) return <h1 data-scope="text" data-role={role} {...rest}>{children}</h1>
  if (n === 2) return <h2 data-scope="text" data-role={role} {...rest}>{children}</h2>
  if (n === 3) return <h3 data-scope="text" data-role={role} {...rest}>{children}</h3>
  if (n === 4) return <h4 data-scope="text" data-role={role} {...rest}>{children}</h4>
  if (n === 5) return <h5 data-scope="text" data-role={role} {...rest}>{children}</h5>
  return <h6 data-scope="text" data-role={role} {...rest}>{children}</h6>
}

/** Text in a role. A paragraph by default; `inline` makes it a span. `tone` colours it, `subtle` and `faint` quieten it. */
export function Text({ role, tone, subtle, faint, inline, children, ...rest }: Open & { role?: TextRole; tone?: Tone; subtle?: boolean; faint?: boolean; inline?: boolean }) {
  const ink = () => (subtle ? 'subtle' : faint ? 'faint' : undefined)
  if (untrack(() => inline)) return <span data-scope="text" data-role={role} data-tone={tone} data-ink={ink()} {...rest}>{children}</span>
  return <p data-scope="text" data-role={role} data-tone={tone} data-ink={ink()} {...rest}>{children}</p>
}
