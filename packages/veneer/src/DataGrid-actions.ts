// Editing, filters and saved view actions for a grid.
import { moved, toCSV } from '@kerf/veneer-core'
import { derived } from '@kerf/core'
import type { DataGridProps, GridColumn, GridPaste } from './DataGrid'
import { shownText } from './DataGrid-rows'
import type { GridState, GridLines } from './DataGrid-model'

export function gridEditing<T>(
  props: DataGridProps<T>,
  st: GridState<T>,
  ln: GridLines<T>,
  say: (s: string) => void,
) {
  const { current, change, all, refs, cols } = st
  const { lines } = ln
  const reorder = (col: string, to: number) => {
    const order = current.value.order.filter((k) => !current.value.hidden.includes(k))
    const placed = moved(order, col, to)
    change({
      order: [...placed, ...current.value.order.filter((k) => current.value.hidden.includes(k))],
    })
    const c = all.value.find((x) => x.id === col)
    say(`${c?.header} moved to column ${placed.indexOf(col) + 1} of ${placed.length}`)
    queueMicrotask(() =>
      refs.el?.querySelector<HTMLElement>(`thead th[data-col="${col}"] button`)?.focus(),
    )
  }
  const paste = (cell: HTMLElement, matrix: string[][]) => {
    const flat = lines.value.filter((l) => l.kind === 'row')
    const startRow = flat.findIndex((l) => l.id === cell.parentElement!.dataset.row)
    const startCol = cols.value.findIndex((c) => c.id === cell.dataset.col)
    const changes: GridPaste<T>[] = []
    let refused = 0
    matrix.forEach((line, r) =>
      line.forEach((text, c) => {
        const row = flat[startRow + r],
          col = cols.value[startCol + c]
        if (!row || !col?.edit) return void refused++
        const value = typeof col.edit === 'function' ? col.edit(text) : text
        if ((col.validate?.(value) ?? true) !== true) return void refused++
        changes.push({ row: row.row, column: col.id, value })
      }),
    )
    if (changes.length) {
      if (props.onPaste) props.onPaste(changes)
      else for (const x of changes) props.onEdit?.(x.row, x.column, x.value)
    }
    say(
      `Pasted ${changes.length} ${changes.length === 1 ? 'cell' : 'cells'}${refused ? `, ${refused} refused` : ''}`,
    )
  }
  return { reorder, paste }
}

export function gridViewActions<T>(
  props: DataGridProps<T>,
  st: GridState<T>,
  ln: GridLines<T>,
  say: (s: string) => void,
) {
  const { current, change, all, at, saved, named, closed, cols, read } = st
  const { visible } = ln
  const toggleHidden = (c: GridColumn<T>, on: boolean) =>
    change({
      hidden: on ? current.value.hidden.filter((x) => x !== c.id) : [...current.value.hidden, c.id],
    })
  const askSort = (c: GridColumn<T>) => {
    const s = current.value.sort
    change({
      sort: { id: c.id, dir: s?.id === c.id && s.dir === 'ascending' ? 'descending' : 'ascending' },
    })
  }
  const setFilter = (k: string, v: string) => {
    at.value = 1
    const f = { ...current.value.filters }
    if (v) f[k] = v
    else delete f[k]
    change({ filters: f })
  }
  const applied = derived(() =>
    Object.entries(current.value.filters).map(([k, v]) => ({
      k,
      v,
      c: all.value.find((x) => x.id === k),
    })),
  )
  const opOf = (c?: GridColumn<T>) => (c?.filter === 'min' ? '≥' : c?.filter === 'text' ? '~' : '=')

  const save = () => {
    const name = `My view ${Object.keys(saved.value).filter((k) => k.startsWith('My view')).length + 1}`
    saved.value = { ...saved.value, [name]: structuredClone(current.value) }
    named.value = name
    props.onSaveView?.(name, current.value)
    say(`Saved “${name}”`)
  }
  const useView = (name: string) => {
    const v = saved.value[name]
    if (!v) return
    named.value = name
    closed.value = {}
    at.value = 1
    current.value = structuredClone(v)
  }
  const download = () => {
    const shown = cols.value
    const csv = toCSV(
      shown.map((c) => c.header),
      visible.value.map((r) => shown.map((c) => shownText(c, read(c, r)))),
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${props.exportName === undefined ? 'export' : props.exportName}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    say(`Exported ${visible.value.length} rows`)
  }

  return { toggleHidden, askSort, setFilter, applied, opOf, save, useView, download }
}
