import { onCleanup, state, untrack } from '@kerf/core'
import { formReset } from '@kerf/veneer-core'
import { bindable, type Bindable } from './bind'
import { JsonEditor } from './CodeInput'
import { Field, type FieldShell } from './Field'
import { use } from '@kerf/veneer-core/kerf'
import { KeyValueRows, formatSwitcher } from './KeyValueEditor/rows'
import { keyValueActions } from './KeyValueEditor/actions'
import '@kerf/veneer-core/styles/rich/body.css'
import '@kerf/veneer-core/styles/rich/key-value.css'

/** One row of a KeyValueEditor. */
export type KeyValue = { key: string; value: string }

/** Props for KeyValueEditor. */
export type KeyValueEditorProps = FieldShell &
  Bindable<KeyValue[]> & {
    keyLabel?: string
    valueLabel?: string
    /** A Form ⇄ JSON switch; both keep the value. */
    json?: boolean
  }

const toJson = (rows: KeyValue[]) =>
  JSON.stringify(
    Object.fromEntries(rows.filter((r) => r.key).map((r) => [r.key, r.value])),
    null,
    2,
  )

/**
 * A table of `key | value | remove` rows with Add row (04 KeyValueEditor). A duplicate key is a caution, not a block.
 * With `json`, a Form ⇄ JSON switch shows the same value as a JsonEditor. Rows keep their identity, so typing never
 * loses focus; adding focuses the new key, removing the row before.
 */
export function KeyValueEditor({
  value,
  defaultValue,
  onValueChange,
  keyLabel = 'Key',
  valueLabel = 'Value',
  json,
  hint,
  ...rest
}: KeyValueEditorProps) {
  const held = bindable<KeyValue[]>(
    () => value,
    () => defaultValue,
    [],
    () => onValueChange,
  )
  const refs: {
    serial: number
    body?: HTMLElement | undefined
    timer?: ReturnType<typeof setTimeout> | undefined
  } = { serial: 0 }
  const ids = state(untrack(() => held.value.map(() => ++refs.serial)))
  const mode = state<'form' | 'json'>('form')
  const text = state('')
  onCleanup(() => clearTimeout(refs.timer))
  const { dup, hasDup, edit, add, remove, flipMode, fromJson } = keyValueActions({
    held,
    ids,
    mode,
    text,
    refs,
    toJson,
  })
  const switcher = untrack(() => json)
    ? formatSwitcher(() => rest.label, mode, flipMode)
    : undefined
  let root: HTMLDivElement | undefined
  use(
    formReset,
    () => root,
    () => () => {
      clearTimeout(refs.timer)
      held.reset()
      ids.value = held.value.map(() => ++refs.serial)
      text.value = toJson(held.value)
    },
  )
  return (
    <div ref={(n) => (root = n)} data-scope="kv">
      {switcher}
      {mode.value === 'json' ? (
        <JsonEditor {...rest} value={text.value} onValueChange={fromJson} />
      ) : (
        <Field
          {...rest}
          group
          filled
          hint={hasDup() ? 'That key is already here: the last one wins.' : hint}
          attrs={{ 'data-multiline': '' }}
          control={() => (
            <KeyValueRows
              setBody={(n) => (refs.body = n)}
              keyLabel={keyLabel}
              valueLabel={valueLabel}
              ids={ids}
              held={held}
              dup={dup}
              edit={edit}
              add={add}
              remove={remove}
            />
          )}
        />
      )}
    </div>
  )
}
