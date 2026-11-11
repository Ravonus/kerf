import { derived, state, type State } from '@kerf-js/core'
import { Field } from '../Field'
import { Tag } from '../Tag'
import { tagActions } from './TagsInput/actions'
import '@kerf-js/veneer-core/styles/inputs/choice.css'

/** Props for TagsInput. */
export interface TagsInputProps {
  label: string
  hint?: unknown
  error?: unknown
  value: State<string[]>
  /** A false tag stays, critical: the field's error says why, once for all of them. */
  valid?: (tag: string) => boolean
  /** Called when the tags change, to clear a stale error. */
  onEdit?: (() => void) | undefined
  /** Enter with nothing typed: the form's submit. */
  onSubmit?: () => void
  /** Focuses the field when it mounts. */
  autofocus?: boolean
  [attr: string]: unknown
}

/**
 * TagsInput (09 §4.2): Enter, comma or a pasted list adds tags; an invalid one stays as a critical tag; Backspace
 * highlights the last tag, then removes it. Veneer had none, so it lives here. Changes are announced politely.
 */
export function TagsInput({
  label,
  hint,
  error,
  value,
  valid,
  onEdit,
  onSubmit,
  ...rest
}: TagsInputProps) {
  const draft = state('')
  const armed = state(false)
  const refs: { host?: HTMLElement | undefined } = {}
  const { add, drop, key, paste } = tagActions({
    value: () => value,
    draft,
    armed,
    refs,
    onEdit: () => onEdit?.(),
    onSubmit: () => onSubmit?.(),
  })
  const last = derived(() => value.value[value.value.length - 1])
  return (
    <Field
      wrap
      label={label}
      hint={hint}
      error={error ?? ''}
      filled={value.value.length > 0 || !!draft.value}
      control={(p) => (
        <>
          {value.value.map((t) => (
            <Tag
              key={t}
              label={t}
              tone={valid && !valid(t) ? 'critical' : undefined}
              data-highlighted={armed.value && t === last.value ? '' : undefined}
              onRemove={() => drop(t)}
            >
              {t}
            </Tag>
          ))}
          <input
            ref={(n) => (refs.host = n)}
            data-part="input"
            id={p.id}
            placeholder=" "
            autocomplete="off"
            enterkeyhint="enter"
            aria-describedby={p.describedby}
            aria-invalid={p.invalid ? 'true' : undefined}
            value={draft.value}
            onInput={(e: Event) => {
              draft.value = (e.currentTarget as HTMLInputElement).value
              armed.value = false
            }}
            onKeyDown={key}
            onPaste={paste}
            onBlur={() => {
              if (draft.value.trim()) add(draft.value)
            }}
            {...rest}
          />
        </>
      )}
    />
  )
}
