// `<Form of={mutation}>` (research 29 §5). The markup is a real `<form method="post">` with the mutation's id in a
// hidden field, so it works before and without JS: the server runs the mutation and answers 303, or the same page
// with the errors (server.tsx). Once hydrated, a submit calls the mutation in place, with `optimistic` and
// single-flight as in any call. Validation is the server's in both cases: client stubs have no schema.
//
// Reachable only from routes that import it, so an app without forms doesn't pay.

import { derived, flush, state, untrack, type Derived } from '@weft-js/core'
import {
  currentScope,
  decodeForm,
  fieldsOf,
  fnOf,
  StartError,
  SUBMIT,
  type FnError,
  type Mutation,
} from './data'
import type { FormFailure } from './exec'

/** What a failed form's page gives back for a field: what was typed. */
export type FormValue = string | string[] | undefined

/** A mutation input's field names: `title`, and `a.b` one level down. */
type Field<I> = I extends object
  ? {
      [K in keyof I & string]: NonNullable<I[K]> extends object
        ? K | `${K}.${keyof NonNullable<I[K]> & string}`
        : K
    }[keyof I & string]
  : string

/** The state and fields `<Form>` gives its children. */
export interface FormApi<I = unknown, O = unknown> {
  /** This form's submit is in flight (`mutation.pending` is every caller's). */
  readonly pending: Derived<boolean>
  /** Errors by field, from the schema or `invalid()`. */
  readonly errors: Derived<Record<string, string>>
  /** The failure that names no field. */
  readonly message: Derived<string | undefined>
  /** The last successful result. */
  readonly result: Derived<O | undefined>
  /** One field's error (its reader re-runs only when that field's error changes). */
  error(name: Field<I>): string | undefined
  /** What was typed, when a no-JS submit came back with errors. */
  value(name: Field<I>): FormValue
  /** Spread on the input: `name`, the value to restore, and the invalid state. */
  field(name: Field<I>): {
    name: string
    value?: FormValue
    'aria-invalid'?: true
    'aria-describedby'?: string
  }
  /** The field's error text, in a live region that's in the page before it has anything to say. */
  Error(props: { name: Field<I>; class?: string }): unknown
}

/** `<Form>`: the mutation, and what to do with its outcome. */
export interface FormProps<I, O> {
  of: Mutation<I, O>
  /** Tells two forms for one mutation apart on the no-JS path. */
  id?: string
  /** Empty the fields after a success (default true). A no-JS submit always comes back to a fresh page. */
  reset?: boolean
  onSuccess?: (result: O) => void
  onError?: (error: unknown) => void
  children?: ((form: FormApi<I, O>) => unknown) | string | number | boolean | object | null
  [attr: string]: unknown
}

let page: FormFailure | null | undefined

/** The failure this form came back with: the request's on the server, `#weft-form` in the hydrating page. */
function failure(id: string, key?: string): FormFailure | undefined {
  const scope = currentScope()
  let f: FormFailure | undefined | null = scope?.form
  if (!scope && typeof document === 'object') {
    if (page === undefined) {
      const el = document.getElementById('weft-form')
      page = el && JSON.parse(el.textContent)
      el?.remove()
    }
    f = page
  }
  if (f?.id !== id || f.key !== key) return undefined
  if (!scope) page = null // once: a later visit to this page starts clean
  return f
}

const at = (values: Record<string, unknown> | undefined, name: string) =>
  name
    .split('.')
    .reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], values) as FormValue

/** A form that posts to a mutation, and works before any code has loaded. */
export function Form<I, O>({
  of,
  id,
  reset,
  onSuccess,
  onError,
  children,
  ...rest
}: FormProps<I, O>) {
  const m = untrack(() => of) as Mutation<I, O> & {
    [SUBMIT]: (input: unknown, form: true | FormData) => Promise<O>
  }
  const key = untrack(() => id)
  const fnId = fnOf(m)?.$id
  if (fnOf(m)?.kind !== 'mutation')
    throw new StartError(
      'F001',
      '`<Form of>` needs a mutation',
      '`<Form of={addTodo}>`, with `addTodo` a `mutation()` export of a server module',
    )
  const seed = failure(fnId, key)
  const errors = state<Record<string, string>>(seed?.errors ?? {})
  const message = state(seed?.message)
  const result = state<O | undefined>(undefined)
  const calls = state(0)
  const errorId = (name: string) => `${key ?? fnId}-${name}-error`

  const form: FormApi<I, O> = {
    pending: derived(() => calls.value > 0),
    errors,
    message,
    result,
    error: (name) => errors.get(name),
    value: (name) => at(seed?.values, name),
    field(name) {
      const value = at(seed?.values, name)
      const invalid = !!errors.get(name)
      return {
        name,
        ...(value !== undefined && { value }),
        ...(invalid && { 'aria-invalid': true as const, 'aria-describedby': errorId(name) }),
      }
    },
    Error: (props) => (
      <p id={errorId(props.name)} class={props.class} role="alert">
        {errors.get(props.name)}
      </p>
    ),
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (calls.value) return
    const el = e.target as HTMLFormElement
    const data = new FormData(el, e.submitter)
    const files = [...data.values()].some((v) => typeof v !== 'string' && v.size)
    calls.value++
    try {
      const v = await m[SUBMIT](decodeForm(data), files ? data : true)
      errors.value = {}
      message.value = undefined
      result.value = v
      if (untrack(() => reset) !== false) el.reset()
      untrack(() => onSuccess)?.(v)
    } catch (err) {
      const issues = (err as FnError).issues
      const f = fieldsOf(issues)
      errors.value = f.errors
      message.value = issues ? f.message : (err as Error).message
      flush()
      el.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      untrack(() => onError)?.(err)
    } finally {
      calls.value--
    }
  }

  return (
    <form
      method="post"
      {...rest}
      aria-busy={form.pending.value || undefined}
      onSubmit={(e) => void submit(e)}
    >
      <input type="hidden" name="$fn" value={fnId} />
      {key !== undefined && <input type="hidden" name="$form" value={key} />}
      {typeof children === 'function'
        ? (children as (api: FormApi<I, O>) => unknown)(form)
        : children}
    </form>
  )
}
