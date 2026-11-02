import { derived } from 'weft'
import type { Interaction } from 'weft/interaction'
import { Icon, type IconRef } from './Icon'
import { useUi } from './use-ui'
import './styles'
import '@weft/warp-core/styles/components/button.css'
import '@weft/warp-core/styles/components/spinner.css'

export type Tone = 'neutral' | 'accent' | 'positive' | 'caution' | 'critical' | 'info'
export type Emphasis = 'solid' | 'soft' | 'outline' | 'ghost' | 'frame' | 'link'

export interface ButtonProps {
  /** solid (default) · soft · outline · ghost · frame (the signature) · link. Fixed at creation: it picks the anatomy. */
  emphasis?: Emphasis
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  /** A frame button with the solid fill sweeping in. */
  fill?: boolean
  full?: boolean
  /** Icon only: `label` is then required (it is the accessible name). */
  icon?: IconRef
  label?: string
  /** Busy: the label stays the accessible name (hidden by opacity), presses are swallowed, focus stays. */
  loading?: boolean
  /** `interaction()`'s row: real events fill it, and it draws whoever set it. */
  ui?: Interaction
  children?: any
  [attr: string]: any
}

const swept = (e: Emphasis) => e === 'soft' || e === 'outline' || e === 'frame'

/**
 * A native button (05 §2), the specimen markup exactly: solid, ghost and link draw their sweep in CSS (the ::before
 * wipe); soft and outline append one [data-part="sweep"]; frame carries the six-part signature anatomy (SIGNATURE §1b).
 */
export function Button({ emphasis = 'solid', tone, size, fill, full, icon, label, loading, type = 'button', onClick, ui, ref, children, ...rest }: ButtonProps) {
  let host: HTMLButtonElement | undefined
  useUi(() => ui, () => host)
  const canLoad = derived(() => loading !== undefined)
  const glyph = derived(() => icon)
  // a loading or aria-disabled button swallows presses (components.html guard())
  const press = (e: MouseEvent) => {
    const el = e.currentTarget as HTMLElement
    if (el.hasAttribute('data-loading') || el.getAttribute('aria-disabled') === 'true') return e.preventDefault()
    onClick?.(e)
  }
  const content = () => <>{glyph.value && <Icon name={glyph.value} />}{children}</>
  return (
    <button
      type={type}
      data-scope="button"
      data-emphasis={emphasis === 'solid' ? undefined : emphasis}
      data-tone={tone}
      data-size={size === 'md' ? undefined : size}
      data-fill={emphasis === 'frame' && fill ? '' : undefined}
      data-full={full ? '' : undefined}
      data-icon-only={glyph.value && !children ? '' : undefined}
      aria-label={label}
      data-sweep={swept(emphasis) ? '' : undefined}
     
      data-loading={loading ? '' : undefined}
      aria-busy={loading ? 'true' : undefined}
      aria-disabled={loading ? 'true' : undefined}
      onClick={press}
      {...rest}
      ref={(n: any) => { host = n; ref?.(n) }}
    >
      {emphasis === 'frame' ? (
        <>
          {fill && <span data-part="sweep-fill" aria-hidden="true"></span>}
          <span data-part="frame-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span data-part="sweep-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span data-part="sweep-outline" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <span data-part="sweep-label">{content()}</span>
          <span data-part="sweep-content" aria-hidden="true">{content()}</span>
        </>
      ) : canLoad.value ? (
        <span data-part="label">{content()}</span>
      ) : (
        content()
      )}
      {loading && <span data-scope="spinner" data-part="spinner" aria-hidden="true"></span>}
      {(emphasis === 'soft' || emphasis === 'outline') && <span data-part="sweep" aria-hidden="true"></span>}
    </button>
  )
}
