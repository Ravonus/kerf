import { createEffect, createSignal, For, on, onCleanup, Show } from 'solid-js'
import { Checkbox } from '@kobalte/core/checkbox'
import { DropdownMenu } from '@kobalte/core/dropdown-menu'
import {
  columnFilteringFeature, columnVisibilityFeature, createColumnHelper, createExpandedRowModel, createFilteredRowModel, createPaginatedRowModel, createSortedRowModel, createTable,
  filterFn_includesString, flexRender, globalFilteringFeature, rowExpandingFeature, rowPaginationFeature, rowSelectionFeature, rowSortingFeature,
  sortFn_alphanumeric, tableFeatures,
} from '@tanstack/solid-table'
import { money, pageSize, projects, type Project } from '../../shared/data'

const features = tableFeatures({
  columnFilteringFeature, columnVisibilityFeature, globalFilteringFeature, rowExpandingFeature, rowPaginationFeature, rowSelectionFeature, rowSortingFeature,
  filteredRowModel: createFilteredRowModel(), sortedRowModel: createSortedRowModel(), paginatedRowModel: createPaginatedRowModel(), expandedRowModel: createExpandedRowModel(),
  filterFns: { includesString: filterFn_includesString }, sortFns: { alphanumeric: sortFn_alphanumeric },
})
export const helper = createColumnHelper<typeof features, Project>()

function Detail(p: { row: Project; open: boolean; span: number }) {
  const [mounted, setMounted] = createSignal(p.open)
  createEffect(on(() => p.open, o => { if (o) setMounted(true); else { const t = setTimeout(() => setMounted(false), 300); onCleanup(() => clearTimeout(t)) } }))
  return <Show when={mounted()}><tr><td colSpan={p.span}><div class="slide" data-closing={p.open ? undefined : ''}><div><dl class="grid grid-cols-[8rem_1fr] gap-2 p-4">
    <dt>Owner</dt><dd>{p.row.owner}</dd><dt>Region</dt><dd>{p.row.region}</dd><dt>Budget</dt><dd>{money(p.row.budget)}</dd></dl></div></div></td></tr></Show>
}
const Box = (p: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <Checkbox checked={p.checked} onChange={p.onChange}><Checkbox.Input aria-label={p.label} class="peer sr-only" /><Checkbox.Control class="size-4 rounded border peer-checked:bg-green-700" /></Checkbox>
)

export function DataTable(props: { label: string; columns: any }) {
  const [data, setData] = createSignal(projects)
  ;(window as any).__tick = () => setData(d => d.map(r => (r.id === 'p0' ? { ...r, budget: r.budget + 1 } : r)))
  const table = createTable({ features, columns: props.columns, get data() { return data() }, getRowId: (r: Project) => r.id, getRowCanExpand: () => true, globalFilterFn: 'includesString', initialState: { pagination: { pageIndex: 0, pageSize } } } as any) as any
  const picked = () => Object.keys(table.atoms.rowSelection.get() ?? {}).length
  const count = () => table.getFilteredRowModel().rows.length
  const pag = () => table.atoms.pagination.get()
  return (
    <>
      <h1 class="text-3xl font-bold">{props.label}</h1>
      <div class="my-4 flex flex-wrap items-center gap-2">
        <input aria-label="Filter projects" placeholder="Filter projects" class="rounded border px-3 py-2" value={table.atoms.globalFilter.get() ?? ''} onInput={e => table.setGlobalFilter(e.currentTarget.value)} />
        <span role="status">{count()} of {data().length}</span>
        <Show when={picked() > 0}><button class="rounded border px-3 py-2">Archive {picked()}</button></Show>
        <DropdownMenu>
          <DropdownMenu.Trigger class="ml-auto rounded border px-3 py-2">Columns</DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content class="rounded border bg-white p-1 shadow">
            <For each={table.getAllLeafColumns()}>{(c: any) => <DropdownMenu.CheckboxItem class="px-3 py-1" closeOnSelect={false} checked={c.getIsVisible()} onChange={v => c.toggleVisibility(v)}>{String(c.columnDef.header)}</DropdownMenu.CheckboxItem>}</For>
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu>
      </div>
      <div class="overflow-x-auto rounded border"><table class="w-full text-left">
        <caption class="sr-only">{props.label}</caption>
        <thead><tr>
          <th class="w-10 p-2"><Box label="Select all" checked={table.getIsAllPageRowsSelected()} onChange={v => table.toggleAllPageRowsSelected(v)} /></th>
          <th class="w-10" />
          <For each={table.getVisibleLeafColumns()}>{(c: any) => <th aria-sort={c.getIsSorted() === 'asc' ? 'ascending' : c.getIsSorted() === 'desc' ? 'descending' : 'none'} class="p-2"><button onClick={c.getToggleSortingHandler()}>{String(c.columnDef.header)}</button></th>}</For>
        </tr></thead>
        <tbody><For each={table.getRowModel().rows}>{(row: any) => <>
          <tr class="border-t">
            <td class="p-2"><Box label={`Select ${row.original.name}`} checked={row.getIsSelected()} onChange={v => row.toggleSelected(v)} /></td>
            <td><button aria-label={`Details for ${row.original.name}`} aria-expanded={row.getIsExpanded()} onClick={() => row.toggleExpanded()}>{row.getIsExpanded() ? '▾' : '▸'}</button></td>
            <For each={row.getVisibleCells()}>{(cell: any) => <td class="p-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>}</For>
          </tr>
          <Detail row={row.original} open={row.getIsExpanded()} span={table.getVisibleLeafColumns().length + 2} />
        </>}</For></tbody>
      </table></div>
      <div class="mt-3 flex items-center gap-2">
        <span>{pag().pageIndex * pag().pageSize + 1}–{Math.min((pag().pageIndex + 1) * pag().pageSize, count())} of {count()}</span>
        <button class="ml-auto rounded border px-3 py-1 disabled:opacity-50" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</button>
        <button class="rounded border px-3 py-1 disabled:opacity-50" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button>
      </div>
    </>
  )
}
