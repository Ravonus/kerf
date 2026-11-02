import { addTags, announce } from '@weft/warp-core'
import { derived, state, type State } from 'weft'
import { Field } from '../Field'
import { Tag } from '../Tag'
import { afterFlush } from './atoms'
import '@weft/warp-core/styles/inputs/choice.css'

export interface TagsInputProps {
  label: string
  hint?: any
  error?: any
  value: State<string[]>
  /** A false tag stays, critical: the field's error says why, once for all of them. */
  valid?: (tag: string) => boolean
  /** Called when the tags change, to clear a stale error. */
  onEdit?: () => void
  /** Enter with nothing typed: the form's submit. */
  onSubmit?: () => void
  /** Focuses the field when it mounts. */
  autofocus?: boolean
  [attr: string]: any
}

/**
 * TagsInput (09 §4.2): Enter, comma or a pasted list adds tags; an invalid one stays as a critical tag; Backspace
 * highlights the last tag, then removes it. warp had none, so it lives here. Changes are announced politely.
 */
export function TagsInput({ label, hint, error, value, valid, onEdit, onSubmit, ...rest }: TagsInputProps) {
  const draft = state('')
  const armed = state(false)
  let host: HTMLElement | undefined
  const say = (text: string) => { if (host) announce(host.ownerDocument, text) }
  const add = (raw: string) => {
    const { list, added } = addTags(value.value, raw)
    draft.value = ''
    if (!added.length) return
    value.value = list
    armed.value = false
    say(`Added ${added.join(', ')}. ${list.length} in total.`)
    onEdit?.()
  }
  const drop = (tag: string) => {
    value.value = value.value.filter(t => t !== tag)
    armed.value = false
    say(`Removed ${tag}.`)
    onEdit?.()
    afterFlush(() => host?.focus())
  }
  const key = (e: KeyboardEvent) => {
    const text = draft.value.trim()
    if ((e.key === 'Enter' || e.key === ',') && text) { e.preventDefault(); add(text) }
    else if (e.key === 'Enter') { e.preventDefault(); onSubmit?.() }
    else if (e.key === 'Backspace' && !draft.value && value.value.length) {
      if (armed.value) drop(value.value[value.value.length - 1])
      else armed.value = true
    } else if (e.key !== 'Backspace') armed.value = false
  }
  const paste = (e: ClipboardEvent) => {
    const t = e.clipboardData?.getData('text') ?? ''
    if (/[\s,;]/.test(t.trim())) { e.preventDefault(); add(`${draft.value} ${t}`) }
  }
  const last = derived(() => value.value[value.value.length - 1])
  return (
    <Field
      wrap
      label={label}
      hint={hint}
      error={error ?? ''}
      filled={value.value.length > 0 || !!draft.value}
      control={p => (
        <>
          {value.value.map(t => <Tag key={t} label={t} tone={valid && !valid(t) ? 'critical' : undefined} data-highlighted={armed.value && t === last.value ? '' : undefined} onRemove={() => drop(t)}>{t}</Tag>)}
          <input ref={(n: any) => (host = n)} data-part="input" id={p.id} placeholder=" " autocomplete="off" enterkeyhint="enter" aria-describedby={p.describedby} aria-invalid={p.invalid ? 'true' : undefined} value={draft.value} onInput={(e: any) => { draft.value = e.currentTarget.value; armed.value = false }} onKeyDown={key} onPaste={paste} onBlur={() => { if (draft.value.trim()) add(draft.value) }} {...rest} />
        </>
      )}
    />
  )
}
