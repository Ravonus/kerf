import type { Metadata } from 'next'
import { Logo } from '@/components/logo'
import { SignInForm } from '@/components/sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function Login() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Logo />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-muted">Sign in to see your list.</p>
      <SignInForm />
    </main>
  )
}
