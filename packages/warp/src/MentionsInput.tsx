import {
  caretPoint,
  comboPopup,
  findTrigger,
  mentionToken,
  parseMentions,
  serializeMentions,
  shiftMarks,
  uid,
  type MentionItem,
  type MentionMark,
} from '@weft-js/warp-core'
import { derived, flush, onCleanup, state, untrack, watch } from '@weft-js/core'
import { bindable, type Bindable } from './bind'
import { Field, type FieldShell } from './Field'
import { use } from '@weft-js/warp-core/weft'
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

const initials = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)

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
  let marks: MentionMark[] = start.marks
  let written = held.value
  const hits = state<MentionItem[]>([])
  const active = state(0)
  const open = state(false)
  const said = state('')
  const empty = state('')
  let at: { trigger: string; query: string; at: number } | undefined
  let area: HTMLTextAreaElement | undefined
  let pop: HTMLDivElement | undefined
  let mark: HTMLSpanElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let stop: AbortController | undefined
  const cancel = () => {
    clearTimeout(timer)
    stop?.abort()
    stop = undefined
  }
  onCleanup(cancel)
  use(
    comboPopup,
    () => pop,
    () => ({ open: open.value, anchor: mark!, onClose: () => (open.value = false) }),
  )
  // a value set from outside: a write of our own compares equal
  watch(
    () => held.value,
    (v) => {
      if (v === written) return
      const next = parseMentions(v)
      written = v
      marks = next.marks
      text.value = next.text
    },
  )
  const publish = (reason: 'keyboard' | 'pointer') => {
    written = serializeMentions(area!.value, marks)
    held.set(written, reason)
  }
  const place = () => {
    const a = area!
    const p = caretPoint(a, at!.at)
    mark!.style.insetInlineStart = `${a.offsetLeft + Math.min(p.x, a.clientWidth - 220)}px`
    mark!.style.insetBlockStart = `${a.offsetTop + p.y}px`
  }
  const scan = () => {
    const a = area!
    at = findTrigger(a.value, a.selectionStart, Object.keys(triggers), marks)
    cancel()
    if (!at) {
      open.value = false
      return
    }
    const found = at
    // oxlint-disable-next-line typescript/no-misused-promises -- the body catches its own failure, and a sync wrapper would add a closure to a hot field
    timer = setTimeout(async () => {
      const me = (stop = new AbortController())
      try {
        const r = await triggers[found.trigger]!(found.query, me.signal)
        if (me !== stop) return
        hits.value = r
        active.value = 0
        empty.value = r.length ? '' : `No matches for ${found.trigger}${found.query}`
        place()
        open.value = true
      } catch {
        if (me === stop) open.value = false
      }
    }, 120)
  }
  const pick = (n: number, reason: 'keyboard' | 'pointer') => {
    const a = area!,
      it = hits.value[n]
    if (!it || !at) return
    const shown = at.trigger + it.label
    const end = a.selectionStart
    const was = a.value
    a.setRangeText(`${shown} `, at.at, end, 'end')
    marks = [
      ...shiftMarks(marks, was, a.value),
      { start: at.at, end: at.at + shown.length, token: mentionToken(at.trigger, it) },
    ]
    open.value = false
    text.value = a.value
    publish(reason)
    a.focus()
    said.value = `${it.label} inserted`
  }
  const onInput = () => {
    const a = area!
    marks = shiftMarks(marks, text.value, a.value)
    text.value = a.value
    publish('keyboard')
    scan()
  }
  const onKey = (e: KeyboardEvent) => {
    if (!open.value || e.isComposing) return
    if (e.key === 'Escape') {
      e.preventDefault()
      open.value = false
      return
    }
    const n = hits.value.length
    if (!n) return
    const by = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key]
    if (by) {
      e.preventDefault()
      active.value = (active.value + by + n) % n
      flush()
      pop?.querySelector('[data-active]')?.scrollIntoView?.({ block: 'nearest' })
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(active.value, 'keyboard')
    }
  }
  const person = derived(() => at?.trigger === '@')
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
          ref={(n) => (area = n)}
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
        <>
          <span ref={(n) => (mark = n)} data-part="caret-anchor" aria-hidden="true"></span>
          <div
            ref={(n) => (pop = n)}
            data-scope="popover"
            data-kind="combo"
            data-sweep=""
            popover="manual"
            role="presentation"
            onPointerDown={(e) => e.preventDefault()}
          >
            <span data-part="sweep" aria-hidden="true"></span>
            <ul data-part="listbox" role="listbox" id={id} aria-label="Suggestions">
              {hits.value.map((it, n) => (
                <li
                  key={it.id}
                  role="option"
                  id={`${id}-${n}`}
                  aria-selected={n === active.value ? 'true' : 'false'}
                  data-active={n === active.value ? '' : undefined}
                  onClick={() => pick(n, 'pointer')}
                >
                  {person.value && (
                    <span class="av" aria-hidden="true">
                      {initials(it.label)}
                    </span>
                  )}
                  <span>{it.label}</span>
                  {it.meta && <span data-part="opt-meta">{it.meta}</span>}
                </li>
              ))}
              {!hits.value.length && (
                <li role="option" aria-disabled="true" aria-selected="false">
                  {empty.value}
                </li>
              )}
            </ul>
          </div>
          <span data-part="sr-only" role="status">
            {said.value}
          </span>
          {name && <input type="hidden" name={name} value={held.value} />}
        </>
      }
    />
  )
}
