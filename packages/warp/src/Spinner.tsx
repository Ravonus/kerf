import './styles'
import '@weft/warp-core/styles/components/spinner.css'

/** A spinner: one arc, 0.8s; a pulse under reduced motion. `label` names it (role="status"); without one it is decorative. */
export function Spinner({ label, size }: { label?: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span data-scope="spinner" data-size={size === 'md' ? undefined : size} role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}></span>
}
