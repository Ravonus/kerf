import { parseMentions, uid, type MentionItem } from '@weft-js/warp-core'
import { derived, state, untrack } from '@weft-js/core'
import { bindable, type Bindable } from './bind'
import { Field, type FieldShell } from './Field'
import { mentionActions, type MentionRefs } from './MentionsInput/actions'
import { MentionsEnd } from './MentionsInput/end'
import '@weft-js/warp-core/styles/rich/listbox.css'
import '@weft-js/warp-core/styles/rich/popover.css'
import '@weft-js/warp-core/styles/rich/helpers.css'

/** Props for MentionsInput. */
export type MentionsInputProps = FieldShell &
  Bindable<string> & {
    /** Trigger character → its search. Superseded calls are aborted. */
    triggers: Record<string, (q: string, signal: AbortSignal) => Promise<MentionItem[]>>
    rows?: number
    name?: string | undefined
  }

/**
 * A plain textarea with trigger characters (04 MentionsInput; inputs-rich.html:2367-2401), so paste, autofill and
 * spellcheck still work. The list opens at the caret: ↑/↓ then Enter or Tab inserts, Esc closes, and an insertion is
 * announced. The value keeps tokens as `@[Ada Lovelace](user:ada)`; the textarea shows the name, and editing inside a
 * name turns it back into plain text.
 */
export function MentionsInput({
  triggers,
  rows = 3,
  value,
  defaultValue,
  onValueChange,
  name,
  hint,
  ...rest
}: MentionsInputProps) {
  const id = uid('men')
  const held = bindable<string>(
    () => value,
    () => defaultValue,
    '',
    () => onValueChange,
  )
  const start = untrack(() => parseMentions(held.value))
  const text = state(start.text)
  const hits = state<MentionItem[]>([])
  const active = state(0)
  const open = state(false)
  const said = state('')
  const empty = state('')
  const refs: MentionRefs = { marks: start.marks, written: held.value }
  const { onInput, onKey, scan, pick } = mentionActions(
    { held, text, hits, active, open, said, empty, refs },
    () => triggers,
  )
  const person = derived(() => refs.at?.trigger === '@')
  return (
    <Field
      {...rest}
      hint={hint}
      attrs={{ 'data-multiline': '' }}
      filled={text.value.length > 0}
      reset={held.reset}
      hold={open.value}
      control={(p) => (
        <textarea
          ref={(n) => (refs.area = n)}
          {...p.rest}
          data-part="input"
          id={p.id}
          rows={rows}
          placeholder=" "
          aria-describedby={p.describedby}
          aria-invalid={p.invalid ? 'true' : undefined}
          aria-autocomplete="list"
          aria-controls={id}
          aria-activedescendant={
            open.value && hits.value.length ? `${id}-${active.value}` : undefined
          }
          value={text.value}
          onInput={onInput}
          onKeyDown={onKey}
          onClick={scan}
        >
          {start.text}
        </textarea>
      )}
      end={
        <MentionsEnd
          refs={refs}
          hits={hits}
          active={active}
          empty={empty}
          person={person}
          said={said}
          held={held}
          name={name}
          id={id}
          pick={pick}
        />
      }
    />
  )
}
