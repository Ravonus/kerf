import type { Tone } from './Button'
import './styles'
import '@weft-js/warp-core/styles/components/badge.css'

/**
 * A status or count badge (05 §5). `dot` adds a status dot; a count badge says its unit to screen readers in
 * `srText` (never an aria-label on a span, review 03 m2).
 */
export function Badge({ tone, emphasis, count, dot, srText, children, ...rest }: { tone?: Tone | undefined; emphasis?: 'soft' | 'solid' | 'outline'; count?: boolean | undefined; dot?: boolean; srText?: string; children?: unknown; [attr: string]: unknown }) {
  return (
    <span data-scope="badge" data-tone={tone} data-emphasis={emphasis === 'soft' ? undefined : emphasis} data-count={count ? '' : undefined} {...rest}>
      {dot && <span data-scope="status-dot" data-tone={tone}></span>}
      {children}
      {srText && <span data-part="sr-only"> {srText}</span>}
    </span>
  )
}
