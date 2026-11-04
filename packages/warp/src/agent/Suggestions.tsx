import { Sweep, useSweep } from './bits'
import '../styles'
import '@weft-js/warp-core/styles/app/suggestions.css'

/** A prompt offered as a starting point. */
export type Suggestion = { id?: string; title: string; description?: string | undefined }

/** Starter prompts (sweep cards) on an empty conversation, chips after a turn (07 §1.3). Picking one sends it. */
export function Suggestions({
  items,
  variant,
  onPick,
  ...rest
}: {
  items: Suggestion[]
  variant?: 'cards' | 'chips' | undefined
  onPick?: (s: Suggestion) => void
  [attr: string]: unknown
}) {
  useSweep()
  return (
    <div
      data-scope="suggestions"
      data-variant={variant === 'chips' ? 'chips' : undefined}
      {...rest}
    >
      {items.map((s) => (
        <button key={s.id ?? s.title} type="button" data-sweep="" onClick={() => onPick?.(s)}>
          <Sweep />
          <span>{s.title}</span>
          {s.description !== undefined && <small>{s.description}</small>}
        </button>
      ))}
    </div>
  )
}
