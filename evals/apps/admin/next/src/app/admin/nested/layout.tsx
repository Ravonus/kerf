import { type ReactNode, Suspense } from 'react'
import { currentUser } from '@/server/auth'
import { loadReach } from '@/server/data'

async function Reach() {
  await currentUser()
  const { customers, cities } = await loadReach()
  return `${customers.toLocaleString('en-US')} customers across ${cities.toLocaleString('en-US')} cities.`
}

export default function NestedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Regions</h1>
        <p className="mt-1 min-h-5 text-sm text-muted">
          <Suspense>
            <Reach />
          </Suspense>
        </p>
      </div>
      {children}
    </div>
  )
}
