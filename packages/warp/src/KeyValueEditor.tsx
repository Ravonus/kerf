import { flush, onCleanup, state, untrack } from 'weft'
import { bindable, type Bindable } from './bind'
import { Button } from './Button'
import { Segmented } from './Choice'
import { JsonEditor } from './CodeInput'
import { Field, type FieldShell } from './Field'
import { Icon } from './Icon'
import '@weft/ui-core/styles/rich/body.css'
import '@weft/ui-core/styles/rich/key-value.css'

export type KeyValue = { key: string; value: string }

export type KeyValueEditorProps = FieldShell & Bindable<KeyValue[]> & {
  keyLabel?: string
  valueLabel?: string
  /** A Form ⇄ JSON switch; both keep the value. */
  json?: boolean
}

const toJson = (rows: KeyValue[]) => JSON.stringify(Object.fromEntries(rows.filter(r => r.key).map(r => [r.key, r.value])), null, 2)

/**
 * A table of `key | value | remove` rows with Add row (04 KeyValueEditor). A duplicate key is a caution, not a block.
 * With `json`, a Form ⇄ JSON switch shows the same value as a JsonEditor. Rows keep their identity, so typing never
 * loses focus; adding focuses the new key, removing the row before.
 */
export function KeyValueEditor({ value, defaultValue, onValueChange, keyLabel = 'Key', valueLabel = 'Value', json, hint, ...rest }: KeyValueEditorProps) {
  const held = bindable<KeyValue[]>(() => value, () => defaultValue, [], () => onValueChange)
  let serial = 0
  const ids = state(untrack(() => held.value.map(() => ++serial)))
  const mode = state<'form' | 'json'>('form')
  const text = state('')
  let body: HTMLElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(timer))
  const dup = (rows: KeyValue[], at: number) => !!rows[at].key && rows.findIndex(r => r.key === rows[at].key) !== at
  const hasDup = () => held.value.some((_, at) => dup(held.value, at))
  const edit = (at: number, part: 'key' | 'value', v: string) => held.set(held.value.map((r, n) => (n === at ? { ...r, [part]: v } : r)), 'keyboard')
  const add = () => {
    held.set([...held.value, { key: '', value: '' }], 'pointer')
    ids.value = [...ids.value, ++serial]
    flush()
    body?.querySelector<HTMLElement>('tbody tr:last-child input')?.focus()
  }
  const remove = (at: number) => {
    held.set(held.value.filter((_, n) => n !== at), 'pointer')
    ids.value = ids.value.filter((_, n) => n !== at)
    flush()
    const left = body?.querySelectorAll<HTMLElement>('[data-part="remove"]')
    ;(left?.[Math.min(at, (left?.length ?? 1) - 1)] ?? body?.querySelector<HTMLElement>('[data-part="add"]'))?.focus()
  }
  const flipMode = (m: 'form' | 'json') => {
    if (m === 'json') text.value = toJson(held.value)
    mode.value = m
  }
  const fromJson = (v: string) => {
    text.value = v
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        const o = JSON.parse(v)
        if (!o || typeof o !== 'object' || Array.isArray(o)) return
        const rows = Object.entries(o).map(([key, val]) => ({ key, value: typeof val === 'string' ? val : JSON.stringify(val) }))
        held.set(rows, 'keyboard')
        ids.value = rows.map(() => ++serial)
      } catch { /* the editor shows the error; the last good value stands */ }
    }, 250)
  }
  const switcher = untrack(() => json) ? <Segmented label={`${rest.label} format`} size="sm" value={mode.value} options={[{ value: 'form', label: 'Form' }, { value: 'json', label: 'JSON' }]} onChange={(m: any) => flipMode(m)} /> : undefined
  return (
    <div data-scope="kv">
      {switcher}
      {mode.value === 'json'
        ? <JsonEditor {...rest} value={text.value} onValueChange={fromJson} />
        : (
          <Field
            {...rest}
            group
            filled
            hint={hasDup() ? 'That key is already here: the last one wins.' : hint}
            attrs={{ 'data-multiline': '' }}
            control={() => (
              <div ref={(n: any) => (body = n)}>
                <table>
                  <thead><tr><th scope="col">{keyLabel}</th><th scope="col">{valueLabel}</th><th scope="col"><span data-part="sr-only">Remove</span></th></tr></thead>
                  <tbody>
                    {ids.value.map((rowId, at) => (
                      <tr key={rowId}>
                        <td><input aria-label={`${keyLabel}, row ${at + 1}`} value={held.value[at]?.key ?? ''} data-duplicate={held.value[at] && dup(held.value, at) ? '' : undefined} onInput={(e: any) => edit(at, 'key', e.currentTarget.value)} /></td>
                        <td><input aria-label={`${valueLabel}, row ${at + 1}`} value={held.value[at]?.value ?? ''} onInput={(e: any) => edit(at, 'value', e.currentTarget.value)} /></td>
                        <td><button type="button" data-part="remove" aria-label={`Remove row ${at + 1}`} onClick={() => remove(at)}><Icon name="x" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button emphasis="ghost" tone="neutral" size="sm" data-part="add" onClick={add}>Add row</Button>
              </div>
            )}
          />
        )}
    </div>
  )
}
