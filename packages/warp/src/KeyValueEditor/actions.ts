import { flush, type State } from '@weft-js/core'
import type { bindable } from '../bind'
import type { KeyValue } from '../KeyValueEditor'

type Refs = {
  serial: number
  body?: HTMLElement | undefined
  timer?: ReturnType<typeof setTimeout> | undefined
}
export function keyValueActions({
  held,
  ids,
  mode,
  text,
  refs,
  toJson,
}: {
  held: ReturnType<typeof bindable<KeyValue[]>>
  ids: State<number[]>
  mode: State<'form' | 'json'>
  text: State<string>
  refs: Refs
  toJson: (rows: KeyValue[]) => string
}) {
  const dup = (rows: KeyValue[], at: number) =>
    !!rows[at]!.key && rows.findIndex((r) => r.key === rows[at]!.key) !== at
  const hasDup = () => held.value.some((_, at) => dup(held.value, at))
  const edit = (at: number, part: 'key' | 'value', v: string) =>
    held.set(
      held.value.map((r, n) => (n === at ? { ...r, [part]: v } : r)),
      'keyboard',
    )
  const add = () => {
    held.set([...held.value, { key: '', value: '' }], 'pointer')
    ids.value = [...ids.value, ++refs.serial]
    flush()
    refs.body?.querySelector<HTMLElement>('tbody tr:last-child input')?.focus()
  }
  const remove = (at: number) => {
    held.set(
      held.value.filter((_, n) => n !== at),
      'pointer',
    )
    ids.value = ids.value.filter((_, n) => n !== at)
    flush()
    const left = refs.body?.querySelectorAll<HTMLElement>('[data-part="remove"]')
    ;(
      left?.[Math.min(at, (left?.length ?? 1) - 1)] ??
      refs.body?.querySelector<HTMLElement>('[data-part="add"]')
    )?.focus()
  }
  const flipMode = (m: 'form' | 'json') => {
    if (m === 'json') text.value = toJson(held.value)
    mode.value = m
  }
  const fromJson = (v: string) => {
    text.value = v
    clearTimeout(refs.timer)
    refs.timer = setTimeout(() => {
      try {
        const o = JSON.parse(v)
        if (!o || typeof o !== 'object' || Array.isArray(o)) return
        const rows = Object.entries(o).map(([key, val]) => ({
          key,
          value: typeof val === 'string' ? val : JSON.stringify(val),
        }))
        held.set(rows, 'keyboard')
        ids.value = rows.map(() => ++refs.serial)
      } catch {
        /* the editor shows the error; the last good value stands */
      }
    }, 250)
  }
  return { dup, hasDup, edit, add, remove, flipMode, fromJson }
}
