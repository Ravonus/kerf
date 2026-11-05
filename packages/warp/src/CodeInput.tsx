import { codeLayer, indented, jsonProblem, type ChangeReason } from '@weft-js/warp-core'
import { derived, onCleanup, state, untrack } from '@weft-js/core'
import { bindable, type Bindable } from './bind'
import { Button } from './Button'
import { Field, type FieldShell } from './Field'
import { use } from '@weft-js/warp-core/weft'
import '@weft-js/warp-core/styles/rich/body.css'
import '@weft-js/warp-core/styles/rich/code-input.css'

type CodeOwn = Bindable<string> & {
  /** After a form's reset put the value back. */
  onReset?: () => void
  language?: string | undefined
  /** Numbers each line in a gutter. Default `true`; off while `wrap` is on. */
  lineNumbers?: boolean
  tabSize?: 2 | 4
  /** Soft-wraps long lines; line numbers then give way, since a number no longer means one row. */
  wrap?: boolean
  rows?: number
  /** The line to mark in the gutter. */
  errorLine?: number | undefined
  name?: string | undefined
}

/** Props for CodeInput: the field shell, the bound text and the editor's own options. */
export type CodeInputProps = FieldShell & CodeOwn

const LEAVE = 'Tab indents · Esc then Tab leaves'

function codeKeys(tabSize: () => 2 | 4, set: (area: HTMLTextAreaElement) => void) {
  let leaving = false
  const onKey = (e: KeyboardEvent) => {
    const area = e.currentTarget as HTMLTextAreaElement
    if (e.key === 'Escape') {
      leaving = true
      return
    }
    if (e.key !== 'Tab') {
      if (e.key !== 'Shift') leaving = false
      return
    }
    if (leaving) {
      leaving = false
      return
    }
    e.preventDefault()
    const r = indented(area.value, area.selectionStart, area.selectionEnd, tabSize(), e.shiftKey)
    area.setSelectionRange(r.from, r.to)
    // execCommand keeps the browser's undo history, which setRangeText throws away
    if (!document.execCommand?.('insertText', false, r.insert))
      area.setRangeText(r.insert, r.from, r.to, 'end')
    area.setSelectionRange(r.start, r.end)
    set(area)
  }
  return onKey
}

function attachCode(
  box: () => HTMLDivElement | undefined,
  text: () => string,
  language: () => string | undefined,
) {
  use(codeLayer, box, () => ({ text: text(), language: language() }))
}

function codeValue(
  value: () => CodeOwn['value'],
  initial: () => string | undefined,
  onChange: () => CodeOwn['onValueChange'],
) {
  return bindable<string>(value, initial, '', onChange)
}

function codeEvents(held: ReturnType<typeof codeValue>, tabSize: () => 2 | 4) {
  const set = (area: HTMLTextAreaElement) => held.set(area.value, 'keyboard')
  return { set, onKey: codeKeys(tabSize, set) }
}

function codeReset(held: ReturnType<typeof codeValue>, onReset: () => void) {
  return () => {
    held.reset()
    onReset()
  }
}

/**
 * A code field (04 CodeInput; inputs-rich.html:2223-2241): a <textarea> over a layer coloured with the CSS Custom
 * Highlight API, so a key press builds no spans; browsers without it show the textarea's own plain text. Tab indents,
 * Shift+Tab outdents, and Esc then Tab leaves, which the hint says. No autocorrect, spellcheck or autocapitalize.
 */
export function CodeInput({
  value,
  defaultValue,
  onValueChange,
  language,
  lineNumbers = true,
  tabSize = 2,
  wrap,
  rows = 8,
  errorLine,
  name,
  hint,
  onReset,
  ...rest
}: CodeInputProps) {
  const held = codeValue(
    () => value,
    () => defaultValue,
    () => onValueChange,
  )
  const lines = derived(() => held.value.split('\n').map((_, n) => n + 1))
  const numbered = derived(() => lineNumbers && !wrap)
  let box: HTMLDivElement | undefined
  const { set, onKey } = codeEvents(held, () => tabSize)
  attachCode(
    () => box,
    () => held.value,
    () => language,
  )
  return (
    <Field
      {...rest}
      hint={hint ?? LEAVE}
      attrs={{ 'data-multiline': '' }}
      filled={held.value.length > 0}
      reset={codeReset(held, () => onReset?.())}
      control={(p) => (
        <div data-part="body">
          <div
            ref={(n) => (box = n)}
            class="code-in"
            data-wrap={wrap ? '' : undefined}
            style={`--_tab:${tabSize}`}
          >
            {numbered.value && (
              <ol data-part="lines" class="ln" aria-hidden="true">
                {lines.value.map((n) => (
                  <li key={n} data-error={n === errorLine ? '' : undefined}>
                    {n}
                  </li>
                ))}
              </ol>
            )}
            <div data-part="surface">
              <pre data-part="layer" aria-hidden="true">{`${held.value}\n`}</pre>
              <textarea
                {...p.rest}
                data-part="input"
                id={p.id}
                rows={rows}
                name={name}
                spellcheck={false}
                autocapitalize="off"
                autocomplete="off"
                wrap={wrap ? 'soft' : 'off'}
                aria-describedby={p.describedby}
                aria-invalid={p.invalid ? 'true' : undefined}
                value={held.value}
                onInput={(e) => set(e.currentTarget)}
                onKeyDown={onKey}
              >
                {untrack(() => held.value)}
              </textarea>
            </div>
          </div>
        </div>
      )}
    />
  )
}

/** Props for JsonEditor: CodeInput with the language fixed to JSON, and a schema check. */
export type JsonEditorProps = FieldShell &
  Omit<CodeOwn, 'language' | 'errorLine'> & {
    /** Checks parsed JSON; what it returns shows as the field's error. */
    schema?: (value: unknown) => string | null | undefined
  }

/**
 * CodeInput for JSON (04 JsonEditor): parse errors, and an optional schema's, name their line in the field's error and
 * pin the sweep; Format rewrites it with `tabSize`.
 */
export function JsonEditor({
  value,
  defaultValue,
  onValueChange,
  schema,
  tabSize = 2,
  ...rest
}: JsonEditorProps) {
  const held = bindable<string>(
    () => value,
    () => defaultValue,
    '',
    () => onValueChange,
  )
  const checked = state(held.value)
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(timer))
  const change = (v: string, reason: ChangeReason) => {
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
    const next = JSON.stringify(
      JSON.parse(held.value),
      null,
      untrack(() => tabSize),
    )
    held.set(next, 'pointer')
    checked.value = next
  }
  return (
    <CodeInput
      {...rest}
      tabSize={tabSize}
      language="json"
      value={held.value}
      onValueChange={change}
      onReset={() => {
        clearTimeout(timer)
        checked.value = held.value
      }}
      error={failed.value}
      hint={problem.value ? LEAVE : summary.value}
      errorLine={problem.value?.line}
      end={
        <span data-part="suffix">
          <Button
            emphasis="ghost"
            tone="neutral"
            size="sm"
            disabled={!!problem.value}
            onClick={format}
          >
            Format
          </Button>
        </span>
      }
    />
  )
}
