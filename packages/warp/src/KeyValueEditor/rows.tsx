import { XIcon } from '@weft-js/warp-icons'
import type { State } from '@weft-js/core'
import { Button } from '../Button'
import { Segmented } from '../Choice'
import type { bindable } from '../bind'
import type { KeyValue } from '../KeyValueEditor'

type Mode = 'form' | 'json'
export function formatSwitcher(
  label: () => string,
  mode: State<Mode>,
  flipMode: (m: Mode) => void,
) {
  return (
    <Segmented
      label={`${label()} format`}
      size="sm"
      value={mode.value}
      options={[
        { value: 'form', label: 'Form' },
        { value: 'json', label: 'JSON' },
      ]}
      onChange={(m) => flipMode(m)}
    />
  )
}

type Rows = {
  setBody: (n: HTMLDivElement) => void
  keyLabel: string
  valueLabel: string
  ids: State<number[]>
  held: ReturnType<typeof bindable<KeyValue[]>>
  dup: (rows: KeyValue[], at: number) => boolean
  edit: (at: number, part: 'key' | 'value', v: string) => void
  add: () => void
  remove: (at: number) => void
}
export function KeyValueRows({
  setBody,
  keyLabel,
  valueLabel,
  ids,
  held,
  dup,
  edit,
  add,
  remove,
}: Rows) {
  return (
    <div ref={setBody}>
      <table>
        <thead>
          <tr>
            <th scope="col">{keyLabel}</th>
            <th scope="col">{valueLabel}</th>
            <th scope="col">
              <span data-part="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ids.value.map((rowId, at) => (
            <tr key={rowId}>
              <td>
                <input
                  aria-label={`${keyLabel}, row ${at + 1}`}
                  value={held.value[at]?.key ?? ''}
                  data-duplicate={held.value[at] && dup(held.value, at) ? '' : undefined}
                  onInput={(e: Event) =>
                    edit(at, 'key', (e.currentTarget as HTMLInputElement).value)
                  }
                />
              </td>
              <td>
                <input
                  aria-label={`${valueLabel}, row ${at + 1}`}
                  value={held.value[at]?.value ?? ''}
                  onInput={(e: Event) =>
                    edit(at, 'value', (e.currentTarget as HTMLInputElement).value)
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  data-part="remove"
                  aria-label={`Remove row ${at + 1}`}
                  onClick={() => remove(at)}
                >
                  <XIcon />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button emphasis="ghost" tone="neutral" size="sm" data-part="add" onClick={add}>
        Add row
      </Button>
    </div>
  )
}
