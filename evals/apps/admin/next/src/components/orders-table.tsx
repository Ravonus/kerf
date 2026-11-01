'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useEffect, useOptimistic, useRef, useState } from 'react'
import { type Dir, type OrderRow, type SortKey } from '@/lib/orders'
import { markShipped } from '@/server/orders'
import { bodyCell, headCell, OrderCells, tableRow } from './order-cells'

export type SortColumn = { key: SortKey; label: string; href: string; right?: boolean }

function SortButton({ column, dir }: { column: SortColumn; dir?: Dir }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.push(column.href))}
      className={`inline-flex cursor-pointer items-center gap-1 tracking-wide uppercase hover:text-ink focus-visible:outline-3 focus-visible:outline-accent ${dir ? 'text-ink' : ''}`}
    >
      {column.label}
      <span aria-hidden="true" className="w-3 text-[10px]">{dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : ''}</span>
    </button>
  )
}

function SelectAll({ all, some, onChange }: { all: boolean; some: boolean; onChange: (checked: boolean) => void }) {
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => { if (box.current) box.current.indeterminate = some && !all }, [all, some])
  return <input ref={box} type="checkbox" aria-label="Select all" checked={all} onChange={e => onChange(e.target.checked)} className={check} />
}

const check = 'tick block size-4 cursor-pointer rounded border border-faint transition-colors checked:border-accent focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent'

export function OrdersTable({ rows, columns, sort, dir }: { rows: OrderRow[]; columns: SortColumn[]; sort: SortKey; dir: Dir }) {
  const [shown, ship] = useOptimistic(rows, (state, ids: number[]) => state.map(r => (ids.includes(r.id) ? { ...r, status: 'shipped' } : r)))
  const [selected, setSelected] = useState<number[]>([])
  const [problem, setProblem] = useState('')

  function shipSelected() {
    const ids = selected
    startTransition(async () => {
      setProblem('')
      setSelected([])
      ship(ids)
      try {
        await markShipped(ids)
      } catch (e) {
        console.error(e)
        setSelected(ids)
        setProblem("Those orders weren't updated. Please try again.")
      }
    })
  }

  const toggle = (id: number, on: boolean) => setSelected(now => (on ? [...now, id] : now.filter(other => other !== id)))

  return (
    <>
      <div className="mb-3 flex min-h-9 items-center gap-3">
        <button
          type="button"
          disabled={!selected.length}
          onClick={shipSelected}
          className="h-9 cursor-pointer rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition-[background-color,opacity] hover:bg-accent-strong focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50"
        >
          Mark shipped
        </button>
        <span className="text-sm text-muted tabular-nums">{selected.length ? `${selected.length} selected` : ''}</span>
        <p role="alert" className="text-sm font-medium text-danger empty:hidden">{problem}</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
        <table className="w-full min-w-[42rem] border-collapse">
          <thead className="bg-tint">
            <tr className="border-b border-line">
              <th scope="col" className="w-10 px-4 py-2.5">
                <SelectAll all={rows.length > 0 && selected.length === rows.length} some={selected.length > 0} onChange={on => setSelected(on ? rows.map(r => r.id) : [])} />
              </th>
              {columns.map(column => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={column.key === sort ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`${headCell} ${column.right ? 'text-right' : ''}`}
                >
                  <SortButton column={column} dir={column.key === sort ? dir : undefined} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(order => (
              <tr key={order.id} className={tableRow}>
                <td className={`${bodyCell} w-10`}>
                  <input type="checkbox" aria-label={`Select order ${order.id}`} checked={selected.includes(order.id)} onChange={e => toggle(order.id, e.target.checked)} className={check} />
                </td>
                <OrderCells order={order} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
