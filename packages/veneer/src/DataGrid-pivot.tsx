// Pivot table rendering.
import { pivotTable } from '@kerf-js/veneer-core'
import { derived, state, untrack, type State } from '@kerf-js/core'
import { Segmented } from './Choice'

/** One value a pivot totals. */
export interface PivotMeasure<T> {
  id: string
  label: string
  value: (row: T) => number
  format?: ((v: number) => string) | undefined
}

function PivotToolbar<T>({
  measures,
  measure,
}: {
  measures: PivotMeasure<T>[]
  measure: State<string>
}) {
  return (
    <div data-part="toolbar">
      <span data-part="spacer"></span>
      <Segmented
        label="Pivot measure"
        value={measure.value}
        options={measures.map((x) => ({ value: x.id, label: x.label }))}
        onChange={(v: string) => (measure.value = v)}
      />
    </div>
  )
}

/** A pivot (06 §6; data.html:1790): rows × columns × a measure, heat cells and totals both ways. */
export function PivotTable<T>({
  rows,
  caption,
  row,
  column,
  rowHeader = '',
  measures,
}: {
  rows: readonly T[]
  caption: string
  row: (r: T) => string
  column: (r: T) => string
  rowHeader?: string
  measures: PivotMeasure<T>[]
}) {
  const measure = state(untrack(() => measures[0]!.id))
  const m = derived(() => measures.find((x) => x.id === measure.value) ?? measures[0])
  const p = derived(() => pivotTable(rows, row, column, m.value!.value))
  const f = (v: number) => (m.value!.format ? m.value!.format(v) : String(v))
  return (
    <div data-scope="table" data-phone="columns">
      {measures.length > 1 && <PivotToolbar measures={measures} measure={measure} />}
      <div data-part="viewport" tabindex="0" role="region" aria-label={caption}>
        <table>
          <caption data-part="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{rowHeader || <span data-part="sr-only">Rows</span>}</th>
              {p.value.colKeys.map((c) => (
                <th key={c} scope="col" data-numeric="">
                  {c}
                </th>
              ))}
              <th scope="col" data-numeric="">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {p.value.rowKeys.map((r, i) => (
              <tr key={r}>
                <th scope="row">{r}</th>
                {p.value.colKeys.map((c, j) => (
                  <td
                    key={c}
                    data-numeric=""
                    data-heat=""
                    style={`--v:${p.value.cells[i]![j]!.share.toFixed(2)}`}
                  >
                    {p.value.cells[i]![j]!.value ? f(p.value.cells[i]![j]!.value) : '–'}
                  </td>
                ))}
                <td data-numeric="">
                  <b>{f(p.value.rowTotals[i]!)}</b>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-part="aggregate">
              <th scope="row">Total</th>
              {p.value.colTotals.map((v, j) => (
                <td key={j} data-numeric="">
                  {f(v)}
                </td>
              ))}
              <td data-numeric="">{f(p.value.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
