import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { AccountMenu } from '@/components/account-menu'
import { Logo } from '@/components/logo'
import { TodoApp } from '@/components/todo-app'
import { currentUser } from '@/server/auth'
import { type Filter, loadTodos } from '@/server/todo-data'

export const metadata: Metadata = { title: 'Todos' }

type Search = Promise<{ filter?: string | string[] }>

export default function Todos({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4 sm:px-6">
          <Link href="/todos"><Logo /></Link>
          <Suspense fallback={<span className="size-9 rounded-full bg-tint" />}>
            <Account />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Todos</h1>
        <Suspense fallback={<ListSkeleton />}>
          <List searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  )
}

async function Account() {
  const user = await currentUser()
  return <AccountMenu name={user.name} email={user.email} />
}

async function List({ searchParams }: { searchParams: Search }) {
  const [user, { filter: raw }] = await Promise.all([currentUser(), searchParams])
  const filter: Filter = raw === 'active' || raw === 'done' ? raw : 'all'
  const { rows, left } = await loadTodos(user.id, filter)
  return <TodoApp todos={rows} left={left} filter={filter} />
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="mt-6 animate-pulse">
      <div className="h-12 rounded-xl border border-line bg-raised" />
      <div className="mt-5 h-9 w-56 rounded-lg bg-tint" />
      <div className="mt-4 h-96 rounded-2xl border border-line bg-raised" />
    </div>
  )
}
