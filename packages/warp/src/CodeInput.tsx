import { codeLayer, indented, jsonProblem } from '@weft/ui-core'
import { derived, onCleanup, state, untrack, type State } from 'weft'
import { bindable, type Bindable } from './bind'
import { Button } from './Button'
import { Field, type FieldShell } from './Field'
import { use } from './use'
import '@weft/ui-core/styles/rich/body.css'
import '@weft/ui-core/styles/rich/code-input.css'

export type CodeInputProps = FieldShell & Bindable<string> & {
  language?: string
  lineNumbers?: boolean
  tabSize?: 2 | 4
  /** Soft-wraps long lines; line numbers then give way, since a number no longer means one row. */
  wrap?: boolean
  rows?: number
  /** The line to mark in the gutter. */
  errorLine?: number
  name?: string
}

const LEAVE = 'Tab indents · Esc then Tab leaves'

/**
 * A code field (04 CodeInput; inputs-rich.html:2223-2241): a <textarea> over a layer coloured with the CSS Custom
 * Highlight API, so a key press builds no spans; browsers without it show the textarea's own plain text. Tab indents,
 * Shift+Tab outdents, and Esc then Tab leaves, which the hint says. No autocorrect, spellcheck or autocapitalize.
 */
export function CodeInput({ value, defaultValue, onValueChange, language, lineNumbers = true, tabSize = 2, wrap, rows = 8, errorLine, name, hint, ...rest }: CodeInputProps) {
  const held = bindable<string>(() => value, () => defaultValue, '', () => onValueChange)
  const lines = derived(() => held.value.split('\n').map((_, n) => n + 1))
  const numbered = derived(() => lineNumbers && !wrap)
  let box: HTMLDivElement | undefined
  let leaving = false
  const set = (area: HTMLTextAreaElement) => held.set(area.value, 'keyboard')
  const onKey = (e: KeyboardEvent) => {
    const area = e.currentTarget as HTMLTextAreaElement
    if (e.key === 'Escape') { leaving = true; return }
    if (e.key !== 'Tab') { if (e.key !== 'Shift') leaving = false; return }
    if (leaving) { leaving = false; return }
    e.preventDefault()
    const r = indented(area.value, area.selectionStart, area.selectionEnd, tabSize, e.shiftKey)
    area.setSelectionRange(r.from, r.to)
    // execCommand keeps the browser's undo history, which setRangeText throws away
    if (!document.execCommand?.('insertText', false, r.insert)) area.setRangeText(r.insert, r.from, r.to, 'end')
    area.setSelectionRange(r.start, r.end)
    set(area)
  }
  use(codeLayer, () => box, () => ({ text: held.value, language }))
  return (
    <Field
      {...rest}
      hint={hint ?? LEAVE}
      attrs={{ 'data-multiline': '' }}
      filled={held.value.length > 0}
      control={({ id, describedby, invalid, rest: live }) => (
        <div data-part="body">
          <div ref={(n: any) => (box = n)} class="code-in" data-wrap={wrap ? '' : undefined} style={`--_tab:${tabSize}`}>
            {numbered.value && <ol data-part="lines" class="ln" aria-hidden="true">{lines.value.map(n => <li key={n} data-error={n === errorLine ? '' : undefined}>{n}</li>)}</ol>}
            <div data-part="surface">
              <pre data-part="layer" aria-hidden="true">{`${held.value}\n`}</pre>
              <textarea {...live} data-part="input" id={id} rows={rows} name={name} spellcheck={false} autocapitalize="off" autocomplete="off" wrap={wrap ? 'soft' : 'off'} aria-describedby={describedby} aria-invalid={invalid ? 'true' : undefined} value={held.value} onInput={e => set(e.currentTarget as HTMLTextAreaElement)} onKeyDown={onKey}>{untrack(() => held.value)}</textarea>
            </div>
          </div>
        </div>
      )}
    />
  )
}

export type JsonEditorProps = Omit<CodeInputProps, 'language' | 'errorLine'> & {
  /** Checks parsed JSON; what it returns shows as the field's error. */
  schema?: (value: unknown) => string | null | undefined
}

/**
 * CodeInput for JSON (04 JsonEditor): parse errors, and an optional schema's, name their line in the field's error and
 * pin the sweep; Format rewrites it with `tabSize`.
 */
export function JsonEditor({ value, defaultValue, onValueChange, schema, tabSize = 2, ...rest }: JsonEditorProps) {
  const held = bindable<string>(() => value, () => defaultValue, '', () => onValueChange)
  const checked = state(held.value)
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(timer))
  const change = (v: string, reason: any) => {
    held.set(v, reason)
    clearTimeout(timer)
    timer = setTimeout(() => (checked.value = v), 250)
  }
  const problem = derived(() => (checked.value.trim() ? jsonProblem(checked.value) : null))
  const failed = derived(() => {
    const p = problem.value
    if (p) return `Invalid JSON${p.line ? ` on line ${p.line}` : ''}: ${p.message}`
    if (!schema || !checked.value.trim()) return undefined
    return schema(JSON.parse(checked.value)) ?? undefined
  })
  const summary = derived(() => {
    if (!checked.value.trim()) return LEAVE
    const o = JSON.parse(checked.value)
    return `Valid JSON · ${o && typeof o === 'object' ? `${Object.keys(o).length} ${Object.keys(o).length === 1 ? 'key' : 'keys'}` : typeof o} · ${LEAVE}`
  })
  const format = () => {
    if (jsonProblem(held.value)) return
    const next = JSON.stringify(JSON.parse(held.value), null, untrack(() => tabSize))
    held.set(next, 'pointer')
    checked.value = next
  }
  return (
    <CodeInput
      {...(rest as FieldShell)}
      tabSize={tabSize}
      language="json"
      value={held.value}
      onValueChange={change}
      error={failed.value}
      hint={problem.value ? LEAVE : summary.value}
      errorLine={problem.value?.line}
      end={<span data-part="suffix"><Button emphasis="ghost" tone="neutral" size="sm" disabled={!!problem.value} onClick={format}>Format</Button></span>}
    />
  )
}
