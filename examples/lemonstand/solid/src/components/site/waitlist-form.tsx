import { useSubmission } from '@solidjs/router'
import { createEffect, createMemo, createUniqueId, For, Show } from 'solid-js'

import { buttonStyles, cx } from '~/components/ui'
import { ArrowRight, Check, LoaderCircle } from '~/components/ui/icons'
import { joinWaitlistAction } from '~/lib/actions'
import { ROLES, type Role } from '~/lib/leads'

type WaitlistProps = {
  source: string
  tone?: 'light' | 'dark'
  defaultRole?: Role
  cta?: string
}

function useWaitlist(props: WaitlistProps) {
  const id = createUniqueId()
  const dark = () => props.tone === 'dark'
  // Two of these share one action on the home page; `source` tells their submissions apart.
  const submission = useSubmission(
    joinWaitlistAction,
    ([form]) => form.get('source') === props.source,
  )
  const result = () => submission.result
  const joined = createMemo(() => {
    const r = result()
    return r?.ok ? r : undefined
  })
  const failure = () => {
    const r = result()
    return r && !r.ok ? r : undefined
  }
  const emailError = () => failure()?.errors.email
  const message = () => failure()?.message ?? submission.error?.message
  let input: HTMLInputElement | undefined

  createEffect(() => {
    if (emailError()) input?.focus()
  })

  return {
    id,
    dark,
    submission,
    joined,
    emailError,
    message,
    setInput: (node: HTMLInputElement) => (input = node),
  }
}

export function WaitlistForm(props: WaitlistProps) {
  const { id, dark, submission, joined, emailError, message, setInput } = useWaitlist(props)

  return (
    <Show
      when={joined()}
      keyed
      fallback={
        <form
          action={joinWaitlistAction}
          method="post"
          novalidate
          class="w-full"
          aria-busy={submission.pending || undefined}
        >
          <input type="hidden" name="source" value={props.source} />
          <div
            class={cx(
              'flex flex-col gap-2 rounded-[1.05rem] p-2 sm:flex-row sm:items-center',
              dark()
                ? 'bg-white/8 ring-1 ring-white/15'
                : 'bg-surface shadow-card ring-1 ring-line-strong',
            )}
          >
            <label for={`${id}-email`} class="sr-only">
              Email address
            </label>
            <input
              ref={setInput}
              id={`${id}-email`}
              name="email"
              type="email"
              inputmode="email"
              autocomplete="email"
              required
              placeholder="you@school.org"
              aria-invalid={emailError() ? true : undefined}
              aria-describedby={`${id}-error`}
              class={cx(
                'min-h-11 min-w-0 flex-1 rounded-control bg-transparent px-3 text-base outline-none focus-visible:ring-2',
                dark()
                  ? 'text-white placeholder:text-white/60 focus-visible:ring-lemon'
                  : 'text-ink placeholder:text-muted focus-visible:ring-ring',
              )}
            />
            {waitlistRole(id, dark, props)}
            {/* Honeypot: hidden from people and screen readers. */}
            <input
              tabindex={-1}
              autocomplete="off"
              aria-hidden="true"
              class="hidden"
              name="website"
            />
            {waitlistSubmit(dark, () => submission.pending, props)}
          </div>
          {waitlistMessage(id, dark, emailError, message)}
        </form>
      }
    >
      {(done) => waitlistSuccess(done, dark)}
    </Show>
  )
}

function waitlistRole(id: string, dark: () => boolean, props: WaitlistProps) {
  return (
    <>
      <label for={`${id}-role`} class="sr-only">
        I am a
      </label>
      <select
        id={`${id}-role`}
        name="role"
        class={cx(
          'min-h-11 rounded-control px-3 text-[0.95rem] outline-none focus-visible:ring-2 sm:w-44',
          dark()
            ? 'bg-white/10 text-white focus-visible:ring-lemon [&>option]:text-ink'
            : 'bg-sunken text-ink focus-visible:ring-ring',
        )}
      >
        <option value="">I&apos;m a…</option>
        <For each={ROLES}>
          {(r) => (
            <option value={r.value} selected={r.value === props.defaultRole}>
              {r.label}
            </option>
          )}
        </For>
      </select>
    </>
  )
}

function waitlistSubmit(
  dark: () => boolean,
  pending: () => boolean | undefined,
  props: WaitlistProps,
) {
  return (
    <button
      type="submit"
      disabled={pending()}
      class={buttonStyles({
        variant: dark() ? 'lemon' : 'primary',
        class: 'group shrink-0',
      })}
    >
      <Show
        when={pending()}
        fallback={
          <>
            {props.cta ?? 'Join the waitlist'}
            <ArrowRight class="size-4 transition-transform group-hover:translate-x-0.5" />
          </>
        }
      >
        <LoaderCircle class="size-4 animate-spin" />
        <span class="sr-only">Joining…</span>
      </Show>
    </button>
  )
}

function waitlistMessage(
  id: string,
  dark: () => boolean,
  emailError: () => string | undefined,
  message: () => string | undefined,
) {
  return (
    <p
      id={`${id}-error`}
      aria-live="polite"
      class={cx(
        'mt-2.5 min-h-5 px-1 text-sm',
        emailError() || message()
          ? dark()
            ? 'font-medium text-[#ffb4a8]'
            : 'font-medium text-danger'
          : dark()
            ? 'text-white/70'
            : 'text-muted',
      )}
    >
      {emailError() ?? message() ?? "Free to join. We'll only email you about Lemonstand."}
    </p>
  )
}

function waitlistSuccess(done: { alreadyJoined: boolean; email: string }, dark: () => boolean) {
  return (
    <div
      role="status"
      class={cx(
        'flex animate-pop-in items-start gap-3 rounded-card p-4',
        dark()
          ? 'bg-white/8 text-white ring-1 ring-lemon/50'
          : 'bg-surface shadow-card ring-1 ring-line',
      )}
    >
      <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-leaf text-white">
        <Check class="size-4" strokeWidth={3} />
      </span>
      <div>
        <p class="font-semibold">
          {done.alreadyJoined ? "You're already on the list." : "You're on the list."}
        </p>
        <p class={cx('text-sm', dark() ? 'text-white/75' : 'text-muted')}>
          We&apos;ll email <span class="font-medium">{done.email}</span> when early access opens. No
          spam, ever.
        </p>
      </div>
    </div>
  )
}
