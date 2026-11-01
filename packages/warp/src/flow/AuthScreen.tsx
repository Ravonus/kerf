import { WeaveIcon } from '@weft/icons'
import '../styles'
import '@weft/warp-core/styles/flows/tokens.css'
import '@weft/warp-core/styles/flows/base.css'
import '@weft/warp-core/styles/flows/auth.css'

const THREADS = Array.from({ length: 24 }, (_, i) => ({ x: 12 + i * 26 }))
const WEFT = [[180, 0.15, 0.75], [300, 0.35, 0.95], [420, 0.05, 0.55], [560, 0.25, 0.85]].map(([y, a, b], i) => ({ i, d: `M${a * 640} ${y} H${b * 640}` }))

/** The woven lines of the brand panel: warp threads, and weft that draws once. */
const WeaveArt = () => (
  <svg data-part="weave" viewBox="0 0 640 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    {THREADS.map(t => <line key={t.x} x1={t.x} y1="0" x2={t.x} y2="800" />)}
    {WEFT.map(w => <path key={w.i} pathLength="1" style={`--i:${w.i}`} d={w.d} />)}
  </svg>
)


/** The product's mark: a logo of the app's, or warp's woven square. */
export const AuthLogo = ({ logo, name }: { logo?: any; name?: any }) => <span data-part="logo">{logo ?? <WeaveIcon />}{name}</span>

/**
 * The auth layout (09 §2.2), by its own width: full-bleed under 600, a 420 card on the page at 600–999, split with the
 * brand panel from 1000. The panel is decorative, so it is hidden from assistive tech; quiet flattens it by token.
 */
export function AuthScreen({ logo, name, quote, cite, brand, children, ...rest }: { logo?: any; name?: any; quote?: any; cite?: any; brand?: any; children?: any; [attr: string]: any }) {
  return (
    <div data-scope="auth" {...rest}>
      <div data-part="layout">
        <aside data-part="brand" aria-hidden="true">
          <AuthLogo logo={logo} name={name} />
          <WeaveArt />
          {brand}
          {quote !== undefined && <blockquote>{quote}{cite !== undefined && <cite>{cite}</cite>}</blockquote>}
        </aside>
        <div data-part="main"><div data-part="panel">{children}</div></div>
      </div>
    </div>
  )
}
