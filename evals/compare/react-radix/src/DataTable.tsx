import { Fragment, useEffect, useState } from 'react'
import * as Checkbox from '@radix-ui/react-checkbox'
import * as Menu from '@radix-ui/react-dropdown-menu'
import {
  columnVisibilityFeature,
  createColumnHelper,
  createExpandedRowModel,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  columnFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { money, pageSize, projects, type Project } from '../../shared/data'

const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric },
})
export const helper = createColumnHelper<typeof features, Project>()

function Detail({ row, open, span }: { row: Project; open: boolean; span: number }) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) setMounted(true)
    else {
      const t = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(t)
    }
  }, [open])
  if (!mounted) return null
  return (
    <tr>
      <td colSpan={span}>
        <div className="slide" data-closing={open ? undefined : ''}>
          <div>
            <dl className="facts">
              <dt>Owner</dt>
              <dd>{row.owner}</dd>
              <dt>Region</dt>
              <dd>{row.region}</dd>
              <dt>Budget</dt>
              <dd>{money(row.budget)}</dd>
            </dl>
          </div>
        </div>
      </td>
    </tr>
  )
}

export function DataTable({ label, columns }: { label: string; columns: any }) {
  const [data, setData] = useState(projects)
  ;(window as any).__tick = () =>
    setData((d) => d.map((r) => (r.id === 'p0' ? { ...r, budget: r.budget + 1 } : r)))
  const table = useTable({
    features,
    columns,
    data,
    getRowId: (r: Project) => r.id,
    getRowCanExpand: () => true,
    globalFilterFn: 'includesString',
    initialState: { pagination: { pageIndex: 0, pageSize } },
  } as any) as any
  const picked = Object.keys(table.state.rowSelection ?? {}).length
  const pag = table.state.pagination
  const count = table.getFilteredRowModel().rows.length
  return (
    <>
      <h1>{label}</h1>
      <div className="tools">
        <input
          aria-label="Filter projects"
          placeholder="Filter projects"
          className="input"
          value={table.state.globalFilter ?? ''}
          onChange={(e) => table.setGlobalFilter(e.target.value)}
        />
        <span role="status">
          {count} of {data.length}
        </span>
        {picked > 0 && <button className="btn">Archive {picked}</button>}
        <Menu.Root>
          <Menu.Trigger className="btn push">Columns</Menu.Trigger>
          <Menu.Portal>
            <Menu.Content className="pop">
              {table.getAllLeafColumns().map((c: any) => (
                <Menu.CheckboxItem
                  key={c.id}
                  className="item"
                  checked={c.getIsVisible()}
                  onCheckedChange={(v) => c.toggleVisibility(!!v)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {String(c.columnDef.header)}
                </Menu.CheckboxItem>
              ))}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <div className="frame">
        <table className="grid">
          <caption className="sr">{label}</caption>
          <thead>
            <tr>
              <th className="narrow">
                <Checkbox.Root
                  aria-label="Select all"
                  className="check"
                  checked={table.getIsAllPageRowsSelected()}
                  onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
                >
                  <Checkbox.Indicator className="tick" />
                </Checkbox.Root>
              </th>
              <th className="narrow" />
              {table.getVisibleLeafColumns().map((c: any) => (
                <th
                  key={c.id}
                  aria-sort={
                    c.getIsSorted() === 'asc'
                      ? 'ascending'
                      : c.getIsSorted() === 'desc'
                        ? 'descending'
                        : 'none'
                  }
                >
                  <button className="sort" onClick={c.getToggleSortingHandler()}>
                    {String(c.columnDef.header)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row: any) => (
              <Fragment key={row.id}>
                <tr data-selected={row.getIsSelected() ? '' : undefined}>
                  <td>
                    <Checkbox.Root
                      aria-label={`Select ${row.original.name}`}
                      className="check"
                      checked={row.getIsSelected()}
                      onCheckedChange={(v) => row.toggleSelected(!!v)}
                    >
                      <Checkbox.Indicator className="tick" />
                    </Checkbox.Root>
                  </td>
                  <td>
                    <button
                      aria-label={`Details for ${row.original.name}`}
                      aria-expanded={row.getIsExpanded()}
                      onClick={() => row.toggleExpanded()}
                    >
                      {row.getIsExpanded() ? '▾' : '▸'}
                    </button>
                  </td>
                  {row.getVisibleCells().map((cell: any) => (
                    <td key={cell.id} data-label={String(cell.column.columnDef.header)}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
                <Detail
                  row={row.original}
                  open={row.getIsExpanded()}
                  span={table.getVisibleLeafColumns().length + 2}
                />
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span>
          {pag.pageIndex * pag.pageSize + 1}–{Math.min((pag.pageIndex + 1) * pag.pageSize, count)}{' '}
          of {count}
        </span>
        <button
          className="btn push"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          Previous
        </button>
        <button className="btn" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
          Next
        </button>
      </div>
    </>
  )
}
