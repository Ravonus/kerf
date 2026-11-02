import { KeyIcon } from '@weft-js/warp-icons'
import { isPasskeyCancel } from '@weft-js/warp-core'
import { derived, state } from '@weft-js/core'
import { Button } from '../Button'
import { Glyph } from '../parts'
import '../styles'
import '@weft-js/warp-core/styles/flows/sso.css'
import '@weft-js/warp-core/styles/layout/grid.css'

// a frame draws its content twice: a function child builds each copy (an element would move from one to the other)

/** Sign in with a passkey (09 §2.1): a frame button. WebAuthn is the app's; a cancelled OS sheet shows nothing. */
export function PasskeyButton({ onPasskey, onError, children, ...rest }: { onPasskey?: () => unknown; onError?: (e: unknown) => void; children?: unknown; [attr: string]: unknown }) {
  const busy = state(false)
  const press = async () => {
    busy.value = true
    try { await onPasskey?.() } catch (e) { if (!isPasskeyCancel(e)) onError?.(e) } finally { busy.value = false }
  }
  return <Button emphasis="frame" full loading={busy.value} onClick={press} {...rest}>{() => <><KeyIcon />{children ?? 'Continue with passkey'}</>}</Button>
}

/** One identity provider on offer. */
export interface SsoProvider { id: string; label: string; /** One path on the 24 grid: monochrome, never the provider's colours. */ glyph?: string; /** More words for assistive tech, after a short label: the label stays part of the name. */ name?: string | undefined }

/** Provider buttons (09 §2.1, §2.2): frame buttons in a row; each stays pending until the app redirects. */
export function SsoButtons({ providers, onProvider }: { providers: SsoProvider[]; onProvider?: ((id: string) => unknown) | undefined }) {
  const list = derived(() => providers)
  const busy = state<string | undefined>(undefined)
  const press = async (id: string) => {
    busy.value = id
    try { await onProvider?.(id) } finally { busy.value = undefined }
  }
  return (
    <div data-scope="grid" data-min="xs" data-cols="3">
      {list.value.map(p => <Button key={p.id} emphasis="frame" full loading={busy.value === p.id} onClick={() => press(p.id)}>{() => <>{p.glyph && <Glyph d={p.glyph} />}{p.label}{p.name && <span data-part="sr-only"> {p.name}</span>}</>}</Button>)}
    </div>
  )
}
