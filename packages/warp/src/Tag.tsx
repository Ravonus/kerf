import type { Tone } from './Button'
import { Icon } from './Icon'
import './styles'
import '@weft/ui-core/styles/components/tag.css'

/** A tag: user content (05 §6). `onRemove` adds the remove button, named "Remove {label}". */
export function Tag({ tone, swatch, onRemove, children, ...rest }: { tone?: Tone; swatch?: boolean; onRemove?: () => void; children: string; [attr: string]: any }) {
  return (
    <span data-scope="tag" data-tone={tone} {...rest}>
      {swatch && <span data-part="swatch"></span>}
      {children}
      {onRemove && <button type="button" data-part="remove" aria-label={`Remove ${children}`} onClick={onRemove}><Icon name="x" /></button>}
    </span>
  )
}
