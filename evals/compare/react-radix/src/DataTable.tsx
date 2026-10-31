import { Fragment, useEffect, useState } from 'react'
import * as Checkbox from '@radix-ui/react-checkbox'
import * as Menu from '@radix-ui/react-dropdown-menu'
import {
  columnVisibilityFeature, createColumnHelper, createExpandedRowModel, createFilteredRowModel, createPaginatedRowModel, createSortedRowModel,
  filterFn_includesString, globalFilteringFeature, columnFilteringFeature, rowExpandingFeature, rowPaginationFeature, rowSelectionFeature, rowSortingFeature,
  sortFn_alphanumeric, tableFeatures, useTable,
} from '@tanstack/react-table'
import { money, projects, type Project } from '../../shared/data'

const features = tableFeatures({
  columnFilteringFeature, columnVisibilityFeature, globalFilteringFeature, rowExpandingFeature, rowPaginationFeature, rowSelectionFeature, rowSortingFeature,
  filteredRowModel: createFilteredRowModel(), sortedRowModel: createSortedRowModel(), paginatedRowModel: createPaginatedRowModel(), expandedRowModel: createExpandedRowModel(),
  filterFns: { includesString: filterFn_includesString }, sortFns: { alphanumeric: sortFn_alphanumeric },
})
export const helper = createColumnHelper<typeof features, Project>()

function Detail({ row, open, span }: { row: Project; open: boolean; span: number }) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => { if (open) setMounted(true); else { const t = setTimeout(() => setMounted(false), 300); return () => clearTimeout(t) } }, [open])
  if (!mounted) return null
  return <tr><td colSpan={span}><div className="slide" data-closing={open ? undefined : ''}><div><dl className="grid grid-cols-[8rem_1fr] gap-2 p-4">
    <dt>Owner</dt><dd>{row.owner}</dd><dt>Region</dt><dd>{row.region}</dd><dt>Budget</dt><dd>{money(row.budget)}</dd></dl></div></div></td></tr>
}

export function DataTable({ label, columns }: { label: string; columns: any }) {
  const [data, setData] = useState(projects)
  ;(window as any).__tick = () => setData(d => d.map(r => (r.id === 'p0' ? { ...r, budget: r.budget + 1 } : r)))
  const table = useTable({ features, columns, data, getRowId: (r: Project) => r.id, getRowCanExpand: () => true, globalFilterFn: 'includesString', initialState: { pagination: { pageIndex: 0, pageSize: 20 } } } as any) as any
  const picked = Object.keys(table.state.rowSelection ?? {}).length
  const pag = table.state.pagination
  const count = table.getFilteredRowModel().rows.length
  return (
    <>
      <h1 className="text-3xl font-bold">{label}</h1>
      <div className="my-4 flex flex-wrap items-center gap-2">
        <input aria-label="Filter projects" placeholder="Filter projects" className="rounded border px-3 py-2" value={table.state.globalFilter ?? ''} onChange={e => table.setGlobalFilter(e.target.value)} />
        <span role="status">{count} of {data.length}</span>
        {picked > 0 && <button className="rounded border px-3 py-2">Archive {picked}</button>}
        <Menu.Root>
          <Menu.Trigger className="ml-auto rounded border px-3 py-2">Columns</Menu.Trigger>
          <Menu.Portal><Menu.Content className="rounded border bg-white p-1 shadow">
            {table.getAllLeafColumns().map((c: any) => (
              <Menu.CheckboxItem key={c.id} className="px-3 py-1 data-[highlighted]:bg-gray-100" checked={c.getIsVisible()} onCheckedChange={v => c.toggleVisibility(!!v)} onSelect={e => e.preventDefault()}>{String(c.columnDef.header)}</Menu.CheckboxItem>
            ))}
          </Menu.Content></Menu.Portal>
        </Menu.Root>
      </div>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left">
          <caption className="sr-only">{label}</caption>
          <thead><tr>
            <th className="w-10 p-2"><Checkbox.Root aria-label="Select all" className="size-4 rounded border" checked={table.getIsAllPageRowsSelected()} onCheckedChange={v => table.toggleAllPageRowsSelected(!!v)}><Checkbox.Indicator className="block size-full bg-green-700" /></Checkbox.Root></th>
            <th className="w-10" />
            {table.getVisibleLeafColumns().map((c: any) => (
              <th key={c.id} aria-sort={c.getIsSorted() === 'asc' ? 'ascending' : c.getIsSorted() === 'desc' ? 'descending' : 'none'} className="p-2">
                <button onClick={c.getToggleSortingHandler()}>{String(c.columnDef.header)}</button>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {table.getRowModel().rows.map((row: any) => (
              <Fragment key={row.id}>
                <tr className="border-t">
                  <td className="p-2"><Checkbox.Root aria-label={`Select ${row.original.name}`} className="size-4 rounded border" checked={row.getIsSelected()} onCheckedChange={v => row.toggleSelected(!!v)}><Checkbox.Indicator className="block size-full bg-green-700" /></Checkbox.Root></td>
                  <td><button aria-label={`Details for ${row.original.name}`} aria-expanded={row.getIsExpanded()} onClick={() => row.toggleExpanded()}>{row.getIsExpanded() ? '▾' : '▸'}</button></td>
                  {row.getVisibleCells().map((cell: any) => <td key={cell.id} className="p-2"><table.FlexRender cell={cell} /></td>)}
                </tr>
                <Detail row={row.original} open={row.getIsExpanded()} span={table.getVisibleLeafColumns().length + 2} />
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span>{pag.pageIndex * pag.pageSize + 1}–{Math.min((pag.pageIndex + 1) * pag.pageSize, count)} of {count}</span>
        <button className="ml-auto rounded border px-3 py-1 disabled:opacity-50" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Previous</button>
        <button className="rounded border px-3 py-1 disabled:opacity-50" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Next</button>
      </div>
    </>
  )
}
