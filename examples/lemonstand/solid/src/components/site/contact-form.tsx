import { useSubmission } from '@solidjs/router'
import { createEffect, createSignal, For, on, Show, type JSX } from 'solid-js'

import { Lemon } from '~/components/lemon'
import { buttonStyles, cx } from '~/components/ui'
import { Check, LoaderCircle, Send } from '~/components/ui/icons'
import { contactAction } from '~/lib/actions'
import { INTERESTS, LEARNER_COUNTS, ROLES, type Interest } from '~/lib/leads'

const field =
  'min-h-12 w-full rounded-control bg-surface px-3.5 py-3 text-base text-ink ring-1 ring-line-strong outline-none transition-shadow placeholder:text-muted hover:ring-ink/35 focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger'

type Checked = 'name' | 'email' | 'role' | 'message'

export function ContactForm() {
  const submission = useSubmission(contactAction)
  const [interests, setInterests] = createSignal<Interest[]>([])
  // A field's error clears as soon as it is edited, and comes back with the next submit.
  const [edited, setEdited] = createSignal<Partial<Record<Checked, boolean>>>({})
  const result = () => submission.result
  const sent = () => {
    const r = result()
    return r?.ok ? r : undefined
  }
  const failure = () => {
    const r = result()
    return r && !r.ok ? r : undefined
  }
  const error = (name: Checked) => (edited()[name] ? undefined : failure()?.errors[name])
  const message = () => failure()?.message ?? submission.error?.message
  const edit = (name: Checked) => () => setEdited((e) => ({ ...e, [name]: true }))
  const toggle = (value: Interest) =>
    setInterests((list) =>
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    )
  let form: HTMLFormElement | undefined

  createEffect(
    on(failure, (failed) => {
      if (!failed) return
      setEdited({})
      form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }),
  )

  return (
    <Show
      when={sent()}
      keyed
      fallback={
        <form
          ref={form}
          action={contactAction}
          method="post"
          novalidate
          class="grid gap-5"
          aria-busy={submission.pending || undefined}
        >
          {contactIdentity(error, edit)}

          {contactInterests(interests, toggle)}

          {contactDetails(error, edit)}

          <input
            tabindex={-1}
            autocomplete="off"
            aria-hidden="true"
            class="hidden"
            name="website"
          />

          {contactFooter(message, () => submission.pending)}
        </form>
      }
    >
      {(done) => contactSuccess(done)}
    </Show>
  )
}

function contactIdentity(
  error: (name: Checked) => string | undefined,
  edit: (name: Checked) => () => void,
) {
  return (
    <div class="grid gap-5 sm:grid-cols-2">
      <Field label="Your name" error={error('name')} for="c-name">
        <input
          id="c-name"
          name="name"
          autocomplete="name"
          class={field}
          onInput={edit('name')}
          aria-invalid={!!error('name')}
          placeholder="Ms. Rivera"
        />
      </Field>
      <Field label="Email" error={error('email')} for="c-email">
        <input
          id="c-email"
          name="email"
          type="email"
          autocomplete="email"
          class={field}
          onInput={edit('email')}
          aria-invalid={!!error('email')}
          placeholder="you@district.org"
        />
      </Field>
      <Field label="I'm a…" error={error('role')} for="c-role">
        <select
          id="c-role"
          name="role"
          class={field}
          onChange={edit('role')}
          aria-invalid={!!error('role')}
        >
          <option value="" disabled selected>
            Choose one
          </option>
          <For each={ROLES}>{(r) => <option value={r.value}>{r.label}</option>}</For>
        </select>
      </Field>
      <Field label="School, library, or organization" optional for="c-org">
        <input
          id="c-org"
          name="organization"
          autocomplete="organization"
          class={field}
          placeholder="Maple Street Public Library"
        />
      </Field>
    </div>
  )
}

function contactInterests(interests: () => Interest[], toggle: (value: Interest) => void) {
  return (
    <fieldset>
      <legend class="mb-2.5 text-sm font-semibold">
        What are you thinking about? <span class="font-normal text-muted">Pick any</span>
      </legend>
      <div class="flex flex-wrap gap-2">
        <For each={INTERESTS}>
          {(i) => {
            const on = () => interests().includes(i.value)
            return (
              <button
                type="button"
                aria-pressed={on()}
                onClick={() => toggle(i.value)}
                class={cx(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-pill px-4 text-sm font-medium transition-colors',
                  on()
                    ? 'bg-navy text-white ring-1 ring-navy'
                    : 'bg-surface text-ink ring-1 ring-line-strong hover:ring-ink/35',
                )}
              >
                <Show when={on()}>
                  <Check class="size-3.5" strokeWidth={3} />
                </Show>
                {i.label}
              </button>
            )
          }}
        </For>
      </div>
      <For each={interests()}>{(v) => <input type="hidden" name="interests[]" value={v} />}</For>
    </fieldset>
  )
}

function contactDetails(
  error: (name: Checked) => string | undefined,
  edit: (name: Checked) => () => void,
) {
  return (
    <>
      <Field label="How many young people might take part?" optional for="c-count">
        <select id="c-count" name="learnerCount" class={field}>
          <option value="">Not sure / skip</option>
          <For each={LEARNER_COUNTS}>{(c) => <option value={c.value}>{c.label}</option>}</For>
        </select>
      </Field>

      <Field label="Tell us a little more" error={error('message')} for="c-msg">
        <textarea
          id="c-msg"
          name="message"
          rows={5}
          class={`${field} resize-y`}
          onInput={edit('message')}
          aria-invalid={!!error('message')}
          placeholder="We run a teen maker club on Thursdays and want to try a 4-week business sprint this spring…"
        />
      </Field>
    </>
  )
}

function contactFooter(message: () => string | undefined, pending: () => boolean | undefined) {
  return (
    <div class="flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p
        aria-live="polite"
        class={cx('text-sm', message() ? 'font-medium text-danger' : 'text-muted')}
      >
        {message() ?? 'We never share your info. A person on our team reads every note.'}
      </p>
      <button
        type="submit"
        disabled={pending()}
        class={buttonStyles({ variant: 'primary', size: 'lg', class: 'w-full sm:w-auto' })}
      >
        <Show when={pending()} fallback={<Send class="size-4" />}>
          <LoaderCircle class="size-4 animate-spin" />
        </Show>
        Send message
      </button>
    </div>
  )
}

function contactSuccess(done: { name: string; email: string }) {
  return (
    <div role="status" class="flex animate-pop-in flex-col items-center gap-4 py-8 text-center">
      <Lemon uid="contact-sent" expression="excited" pose="celebrate" size={200} decorative />
      <h3 class="font-display text-display-md font-medium">Message received.</h3>
      <p class="max-w-sm text-muted">
        Thanks, {done.name.split(' ')[0]}. A real person on our team reads every note, and
        we&apos;ll reply to <span class="font-medium text-ink">{done.email}</span> soon.
      </p>
      <p class="inline-flex items-center gap-2 rounded-pill bg-leaf-soft px-3 py-1.5 text-sm font-semibold text-leaf-ink">
        <Check class="size-4" /> You&apos;re also on the early-access list
      </p>
    </div>
  )
}

function Field(props: {
  label: string
  for: string
  error?: string
  optional?: boolean
  children?: JSX.Element
}) {
  return (
    <div class="grid gap-1.5">
      <label for={props.for} class="text-sm font-semibold">
        {props.label}{' '}
        <Show when={props.optional}>
          <span class="font-normal text-muted">(optional)</span>
        </Show>
      </label>
      {props.children}
      <Show when={props.error}>
        <p class="text-sm font-medium text-danger" role="alert">
          {props.error}
        </p>
      </Show>
    </div>
  )
}
