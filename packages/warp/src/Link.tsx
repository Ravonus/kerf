// A link (05 §4): warp's sheet and the link's own rules, apart from the type roles so a role costs only its rules.
import { untrack } from '@weft-js/core'
import './styles'
import '@weft-js/warp-core/styles/components/link.css'

type Open = { children?: unknown; [attr: string]: unknown }

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
