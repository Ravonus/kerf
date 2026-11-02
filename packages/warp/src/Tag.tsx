import { XIcon } from '@weft-js/warp-icons'
import type { Tone } from './Button'
import './styles'
import '@weft-js/warp-core/styles/components/tag.css'

/** A tag: user content (05 §6). `onRemove` adds the remove button, named "Remove {label}". */
export function Tag({ tone, swatch, onRemove, label, children, ...rest }: { tone?: Tone | undefined; swatch?: boolean; onRemove?: () => void; /** The name for the remove button, when `children` is an expression (the compiler hands those over as a thunk). */ label?: string | undefined; children: unknown; [attr: string]: unknown }) {
  return (
    <span data-scope="tag" data-tone={tone} {...rest}>
      {swatch && <span data-part="swatch"></span>}
      {children}
      {onRemove && <button type="button" data-part="remove" aria-label={`Remove ${(label ?? children) as string}`} onClick={onRemove}><XIcon /></button>}
    </span>
  )
}
