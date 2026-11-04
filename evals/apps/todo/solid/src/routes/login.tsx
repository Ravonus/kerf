import { Title } from '@solidjs/meta'
import { createAsync, Navigate, useSubmission, type RouteDefinition } from '@solidjs/router'
import { Show } from 'solid-js'

import { field, primary } from '~/components/button'
import { Logo } from '~/components/logo'
import { getViewer, signInAction } from '~/lib/data'

export const route = { preload: () => getViewer() } satisfies RouteDefinition

export default function Login() {
  // Deferred so a signed-in visitor gets a redirect, not a flash of the form.
  const viewer = createAsync(() => getViewer(), { deferStream: true })
  const submission = useSubmission(signInAction)
  const error = () => submission.result?.error

  return (
    <main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Title>Sign in · Daybook</Title>
      <Show when={viewer()}>
        <Navigate href="/todos" />
      </Show>
      <Logo />
      <h1 class="mt-8 text-3xl font-semibold tracking-tight">Welcome back</h1>
      <p class="mt-2 text-muted">Sign in to pick up where you left off.</p>
      <form action={signInAction} method="post" class="mt-8 flex flex-col gap-4">
        <div>
          <label for="email" class="mb-1.5 block text-sm font-medium">
            Email
          </label>
          <input id="email" name="email" type="email" required autocomplete="email" class={field} />
        </div>
        <div>
          <label for="password" class="mb-1.5 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autocomplete="current-password"
            class={field}
          />
        </div>
        <button type="submit" class={`${primary} mt-2 w-full`} disabled={submission.pending}>
          Sign in
        </button>
        <p role="alert" class="min-h-6 text-sm font-medium text-danger">
          {error()}
        </p>
      </form>
    </main>
  )
}
