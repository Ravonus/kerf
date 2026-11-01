import Link from 'next/link'
import { type ReactNode, Suspense } from 'react'
import { AccountMenu } from '@/components/account-menu'
import { AdminNav, NavLinks } from '@/components/admin-nav'
import { Logo } from '@/components/logo'
import { currentUser } from '@/server/auth'

async function Account() {
  const user = await currentUser()
  return <AccountMenu name={user.name} email={user.email} />
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col lg:flex-row">
      <aside className="sticky top-0 z-10 flex flex-col gap-3 border-b border-line bg-paper/90 p-4 backdrop-blur lg:h-dvh lg:w-56 lg:shrink-0 lg:gap-6 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between">
          <Link href="/admin"><Logo /></Link>
          <Suspense fallback={<span className="size-9 rounded-full bg-tint" />}>
            <Account />
          </Suspense>
        </div>
        <Suspense fallback={<NavLinks />}>
          <AdminNav />
        </Suspense>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  )
}
