// The public editor adapter and the cell's ordinary renderer share event semantics.
import { onMount, untrack } from '@kerf-js/core'

type EditorProps = {
  label: string
  start: string
  onDone: (save: boolean, text: string) => void
  onLeave?: (save: boolean, text: string) => void
  invalid?: boolean
  describedby?: string | undefined
}

/** The input used to edit a cell. */
export function Editor(props: EditorProps) {
  return untrack(() =>
    tableEditor({
      label: () => props.label,
      start: () => props.start,
      callbacks: props,
      invalid: () => props.invalid,
      describedby: () => props.describedby,
    }),
  )
}

/** Render the input under its editing owner, keeping the original callback receiver. */
export function tableEditor({
  label,
  start,
  callbacks,
  invalid,
  describedby,
}: {
  label: () => string
  start: () => string
  callbacks: Pick<EditorProps, 'onDone' | 'onLeave'>
  invalid?: () => boolean | undefined
  describedby?: () => string | undefined
}) {
  let input: HTMLInputElement | undefined
  onMount(() => {
    input?.focus()
    input?.select()
  })
  return (
    <label>
      <span data-part="sr-only">{label()}</span>
      <input
        ref={(n) => (input = n)}
        data-part="editor"
        aria-invalid={invalid?.() ? 'true' : undefined}
        aria-describedby={describedby?.()}
        value={start()}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== 'Escape') return
          e.preventDefault()
          e.stopPropagation()
          callbacks.onDone(e.key === 'Enter', (e.currentTarget as HTMLInputElement).value)
        }}
        onBlur={(e: FocusEvent) =>
          (callbacks.onLeave ?? callbacks.onDone)(true, (e.currentTarget as HTMLInputElement).value)
        }
      />
    </label>
  )
}
