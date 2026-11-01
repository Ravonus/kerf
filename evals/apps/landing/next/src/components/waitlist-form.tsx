'use client'

import { useActionState } from 'react'
import { joinWaitlist } from '@/server/waitlist'

export function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlist, { joined: false })

  return (
    <form action={action} id="join" className="scroll-mt-24">
      <label htmlFor="email" className="mb-2 block text-sm font-medium">Email</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={!!state.error}
          aria-describedby="join-status"
          className="h-12 w-full min-w-0 rounded-xl sm:flex-1 border border-line bg-raised px-4 text-base outline-none transition-colors placeholder:text-faint focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/25 aria-invalid:border-danger"
        />
        <button
          type="submit"
          aria-disabled={pending}
          className="h-12 cursor-pointer rounded-xl bg-accent px-7 font-semibold text-on-accent transition-[background-color,opacity] hover:bg-accent-strong focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:cursor-progress aria-disabled:opacity-70"
        >
          Join
        </button>
      </div>
      <p id="join-status" role="status" className="mt-3 min-h-6 text-sm">
        {state.joined && <span className="font-medium text-success">You're on the list</span>}
        {state.error && <span className="font-medium text-danger">{state.error}</span>}
      </p>
    </form>
  )
}
