import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Logo } from '@/components/logo'
import { SignInForm } from '@/components/sign-in-form'
import { currentSession } from '@/server/auth'

export const metadata: Metadata = { title: 'Sign in' }

async function SignedIn() {
  if (await currentSession()) redirect('/admin')
  return null
}

export default function Login() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Suspense><SignedIn /></Suspense>
      <Logo />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-muted">Sign in to see today's orders.</p>
      <SignInForm />
    </main>
  )
}
