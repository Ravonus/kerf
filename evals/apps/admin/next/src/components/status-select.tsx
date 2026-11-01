'use client'

import { startTransition, useOptimistic, useState } from 'react'
import { statuses } from '@/lib/orders'
import { setStatus } from '@/server/orders'
import { StatusBadge } from './status-badge'
import { field } from './order-filters'

export function StatusSelect({ id, status }: { id: number; status: string }) {
  const [shown, show] = useOptimistic(status)
  const [problem, setProblem] = useState('')

  function change(next: string) {
    startTransition(async () => {
      setProblem('')
      show(next)
      try {
        await setStatus(id, next)
      } catch (e) {
        console.error(e)
        setProblem("That status wasn't saved. Please try again.")
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <StatusBadge status={shown} />
      <select aria-label="Status" value={shown} onChange={e => change(e.target.value)} className={`${field} capitalize`}>
        {statuses.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <p role="alert" className="text-sm font-medium text-danger empty:hidden">{problem}</p>
    </div>
  )
}
