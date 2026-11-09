import type { ThemeTone } from './theme-tone'
import './styles'
import '@weft-js/warp-core/styles/components/pill.css'

type PillProps = {
  tone?: ThemeTone | undefined
  children?: unknown
  [attr: string]: unknown
}

/** A selectable pill backed by a native button. */
export function Pill({ tone, children, type = 'button', ...rest }: PillProps) {
  return (
    <button type={type} data-scope="pill" data-tone={tone} data-sweep="" {...rest}>
      {children}
      <span data-part="sweep" aria-hidden="true"></span>
    </button>
  )
}

/** A pill that navigates to a destination. */
export function PillLink({ tone, href, children, ...rest }: PillProps & { href: string }) {
  return (
    <a href={href} data-scope="pill" data-tone={tone} data-sweep="" {...rest}>
      {children}
      <span data-part="sweep" aria-hidden="true"></span>
    </a>
  )
}
