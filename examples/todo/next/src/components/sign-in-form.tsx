'use client'

import { useActionState } from 'react'
import { signIn } from '@/server/account'

const field =
  'h-12 w-full rounded-xl border border-line bg-raised px-4 text-base outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/25'

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, {})

  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={field}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={field}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-12 cursor-pointer rounded-xl bg-accent font-semibold text-on-accent transition-[background-color,opacity] hover:bg-accent-strong focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-progress disabled:opacity-70"
      >
        Sign in
      </button>
      <p role="alert" className="min-h-6 text-sm font-medium text-danger">
        {state.error}
      </p>
    </form>
  )
}
