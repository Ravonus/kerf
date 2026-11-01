// What the flow screens share (09 §1): the title, mark and rail parts, the step's form frame and its error surfaces.
// Internal, except what the barrel names.
import { announce, mapFlowError, secondsClock, type FlowError, type FlowErrorOptions } from '@weft/warp-core'
import { derived, flush, onCleanup, onMount, state, untrack, watch } from 'weft'
import { Alert } from '../Alert'
import { Button, type ButtonProps } from '../Button'
import { Banner } from '../parts'
import { toast } from '../Toast'
import '../styles'
import '@weft/warp-core/styles/flows/tokens.css'
import '@weft/warp-core/styles/flows/base.css'
import '@weft/warp-core/styles/flows/meter.css' // the result mark
import '@weft/warp-core/styles/layout/stack.css'

export type Heading = 'h1' | 'h2' | 'h3'

/** A step's title: focus lands here on arrival (09 §1.1). */
export function Title({ as, id, children }: { as?: Heading; id?: string; children?: any }) {
  const level = derived(() => as ?? 'h1')
  return (
    <>
      {level.value === 'h3' ? <h3 data-part="title" data-part-title="" tabindex="-1" id={id}>{children}</h3>
        : level.value === 'h2' ? <h2 data-part="title" data-part-title="" tabindex="-1" id={id}>{children}</h2>
        : <h1 data-part="title" data-part-title="" tabindex="-1" id={id}>{children}</h1>}
    </>
  )
}

/** The result mark; `draw` strokes a check in. */
export function Mark({ tone, draw, children }: { tone?: 'positive' | 'caution' | 'critical'; draw?: boolean; children?: any }) {
  return <span data-part="mark" data-tone={tone}>{draw ? <svg viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" data-draw="" d="m5 12.5 4.5 4.5L19 7.5" /></svg> : children}</span>
}

/** The flows rail: `value` in percent. */
export function Rail({ value, on = true, ...rest }: { value: number; on?: boolean; [attr: string]: any }) {
  return <span data-part="rail" data-on={on ? '' : undefined} style={`--v:${value}%`} {...rest}><span data-part="rail-fill"></span></span>
}

/**
 * Seconds counting down to zero while `seconds()` holds a number; a new number restarts it. Nothing runs on the server
 * or before mount, so the first paint is the full count.
 */
export function useCooldown(seconds: () => number | undefined, onDone?: () => void) {
  const left = state(untrack(seconds) ?? 0)
  let stop: (() => void) | undefined
  const start = (n: number | undefined) => {
    stop?.()
    stop = undefined
    left.value = n ?? 0
    if (n) stop = secondsClock(n, s => (left.value = s), onDone)
  }
  onMount(() => {
    // a fresh object each run: a restart with the same seconds still restarts
    watch(() => ({ n: seconds() }), v => start(v.n))
    onCleanup(() => stop?.())
  })
  return left
}

/** What `<Form of={mutation}>` gives its children; a step reads it, so warp never imports the server's Form. */
export interface FormLike {
  readonly pending: { readonly value: boolean }
  readonly errors: { readonly value: Record<string, string> }
  readonly message: { readonly value: string | undefined }
  value?(name: any): any
}

/** How a screen is driven: inside `<Form of>` (pass `form`), or on its own with `onSubmit` and `errors`. */
export interface FlowForm<V> {
  /** The `<Form of={mutation}>` render argument: the screen then renders no <form> of its own. */
  form?: FormLike
  /** Called with the form's values once its own checks pass. */
  onSubmit?: (values: V, e: SubmitEvent) => void
  /** Messages by field name. */
  errors?: Record<string, string>
  /** The failure: anything `mapFlowError` takes (a `FnError`, a typed error, a string). */
  error?: unknown
  /** Options for `mapFlowError`: copy by code, and `online`. */
  errorOptions?: FlowErrorOptions
  pending?: boolean
  /** The Retry on a network failure's toast. */
  onRetry?: () => void
  /** The title's level (default h1: an auth step is the page). */
  heading?: Heading
}

/** One step's form state: errors from all three sources, the mapped failure and its cooldown, its surfaces' side effects. */
export function useStepForm<V>(p: FlowForm<V>, check?: (values: Record<string, string>) => Record<string, string | undefined>) {
  const own = state<Record<string, string>>({})
  const failure = derived(() => {
    const e = p.form ? p.form.message.value : p.error
    return e ? mapFlowError(e, untrack(() => p.errorOptions)) : undefined
  })
  const errors = derived<Record<string, string>>(() => ({ ...own.value, ...failure.value?.fields, ...(p.form ? p.form.errors.value : p.errors) }))
  const pending = derived(() => !!(p.form ? p.form.pending.value : p.pending))
  const cooling = useCooldown(() => failure.value?.retryAfter, () => announce(document, 'You can try again now.'))
  let root: HTMLElement | undefined
  const focusInvalid = (say?: string) => {
    flush()
    root?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    if (say) announce(document, say)
  }
  onMount(() => {
    watch(() => failure.value, (m: FlowError | undefined) => {
      if (!m) return
      if (m.surface === 'field') focusInvalid(m.summary)
      if (m.surface === 'alert') { flush(); root?.querySelector<HTMLElement>('[data-part="formerr"]')?.focus() }
      if (m.surface === 'rate-limit') announce(document, `${m.title} Try again in ${m.retryAfter}s.`)
      if (m.surface === 'toast') toast.show({ title: m.title, description: m.description, tone: 'critical', action: p.onRetry && { label: 'Retry', onClick: () => p.onRetry!() } })
    })
    let sent = 0
    watch(() => Object.keys(p.form ? p.form.errors.value : (p.errors ?? {})).length, n => {
      if (n && n !== sent) focusInvalid()
      sent = n
    })
  })
  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    const f = e.currentTarget as HTMLFormElement
    const values = Object.fromEntries(new FormData(f)) as Record<string, string>
    const bad = Object.fromEntries(Object.entries(check?.(values) ?? {}).filter(([, m]) => m)) as Record<string, string>
    own.value = bad
    const n = Object.keys(bad).length
    if (n) return focusInvalid(n > 1 ? `${n} fields need attention` : undefined)
    p.onSubmit?.(values as V, e)
  }
  return {
    errors, failure, pending, cooling, submit,
    /** Set one field's message from the client (format on blur), or clear it. */
    flag(name: string, message: string | undefined) {
      const { [name]: _, ...rest } = own.value
      own.value = message ? { ...rest, [name]: message } : rest
    },
    bind(n: HTMLElement) { root = n },
  }
}
export type StepForm = ReturnType<typeof useStepForm>

/** The step's frame: a <form> of its own, or a plain stack inside `<Form of>`. */
export function StepFrame({ ctl, embedded, labelledby, children }: { ctl: StepForm; embedded: boolean; labelledby?: string; children?: any }) {
  const plain = derived(() => embedded)
  return (
    <>
      {plain.value
        ? <div ref={(n: any) => ctl.bind(n)} data-scope="stack" role="group" aria-labelledby={labelledby}>{children}</div>
        : <form ref={(n: any) => ctl.bind(n)} data-scope="stack" novalidate aria-labelledby={labelledby} onSubmit={ctl.submit}>{children}</form>}
    </>
  )
}

/** The failure at the top of the step (09 §1.3): the Alert takes focus; a rate limit counts down; offline is a Banner. */
export function FormError({ ctl, actions }: { ctl: StepForm; actions?: any }) {
  const m = derived(() => ctl.failure.value)
  return (
    <div data-part="formerr" tabindex="-1">
      {m.value?.surface === 'alert' && <Alert tone="critical" live title={m.value.title} actions={actions}>{m.value.description}</Alert>}
      {m.value?.surface === 'rate-limit' && <Alert tone="caution" title={m.value.title}>{ctl.cooling.value > 0 ? `Try again in ${ctl.cooling.value}s.` : 'You can try again now.'}</Alert>}
      {m.value?.surface === 'banner' && <Banner tone="caution" live={m.value.live}><b>{m.value.title}</b> {m.value.description}</Banner>}
    </div>
  )
}

/** The one solid: keeps its label while pending; a rate limit disables it and says why. */
export function Submit({ ctl, disabled, children, ...rest }: { ctl: StepForm; disabled?: boolean; children?: any } & ButtonProps) {
  const wait = derived(() => ctl.cooling.value)
  return <Button type="submit" size="lg" full loading={ctl.pending.value} disabled={disabled || wait.value > 0} {...rest}>{wait.value > 0 ? `Try again in ${wait.value}s` : children}</Button>
}

/** A text button in a step's row. */
export const TextLink = ({ children, ...rest }: ButtonProps) => <Button emphasis="link" data-hit="text" {...rest}>{children}</Button>
