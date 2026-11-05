import type { SchemaIssue } from './types'

/** A diagnostic thrown by @weft-js/start: `code` (Q001…) and a fix in the message, like weft's StateError. */
export class StartError extends Error {
  /** The HTTP status, when `extra` sets one. */
  declare status?: number
  /** Field by field, when `extra` sets them. */
  declare issues?: SchemaIssue[]
  /** What a declared error carries. */
  declare data?: unknown
  /** `raise`: this is a failure the function declares, so its message reaches the client. */
  declare typed?: boolean
  constructor(
    public code: string,
    message: string,
    fix?: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(`${code}: ${message}${fix ? `\n  fix: ${fix}` : ''}`)
    Object.assign(this, extra)
  }
}

/** A failed server function call, as the client sees it. */
export class FnError extends Error {
  code?: string
  status: number
  issues?: SchemaIssue[]
  /** What a declared error (`errors`) carries. */
  data?: unknown
  constructor(
    e: { message?: string; code?: string; issues?: SchemaIssue[] | undefined; data?: unknown },
    status: number,
  ) {
    super(e.message ?? `server function failed (${status})`)
    this.status = status
    Object.assign(this, { code: e.code, issues: e.issues, data: e.data })
  }
}

declare const redirectBrand: unique symbol
/** What `redirect()` throws: a loader or a function's way to send the page elsewhere. */
export interface Redirect {
  readonly isRedirect: true
  readonly href: string
  readonly status: number
  readonly [redirectBrand]?: true
}

/**
 * Send the request elsewhere: in `load` (a page answers 307 with `location`, client navigation follows) or in a
 * `run` (the client router navigates). It throws, so `(await db.get(id)) ?? redirect('/todos')` types as the row.
 */
export function redirect(href: string, status: 301 | 302 | 303 | 307 | 308 = 307): never {
  // oxlint-disable-next-line typescript/only-throw-error -- control flow, not a failure: a stack costs and nothing reads it
  throw { isRedirect: true, href, status } as Redirect
}

/** Whether a thrown value is a `redirect()`. */
export const isRedirect = (v: unknown): v is Redirect =>
  !!v && typeof v === 'object' && (v as Partial<Redirect>).isRedirect === true

/**
 * Fail with an error the function declares in `errors`. The client sees it as `FnError.code` and `.data`, whether `run`
 * or a Rust `impl` raised it.
 */
export function raise(code: string, data?: unknown): never {
  throw new StartError(code, `failed: ${code}`, undefined, { status: 400, data, typed: true })
}

/** Refuse a value the schema can't judge (`email` is taken): `<Form>` shows it next to the field, as a schema issue. */
export function invalid(fields: Record<string, string>): never {
  throw new StartError('Q002', Object.keys(fields).join(', '), undefined, {
    status: 422,
    issues: Object.entries(fields).map(([k, message]) => ({ message, path: k.split('.') })),
  })
}

/** Issues as a form shows them: by field (`a.b`), and the ones that name no field. */
export function fieldsOf(issues: readonly SchemaIssue[] = []) {
  const errors: Record<string, string> = {}
  let message: string | undefined
  for (const i of issues) {
    const key = i.path?.map((p) => (typeof p === 'object' ? p.key : p)).join('.')
    if (key) errors[key] ??= i.message
    else message ??= i.message
  }
  return { errors, message }
}

type Tree = Record<string, unknown>

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype'])

/** A form's fields as a mutation's input, on both sides (research 29 §5): `a.b` nests, `x[]` and repeats are arrays. */
export function decodeForm(data: FormData): Record<string, unknown> {
  const out: Tree = {}
  for (const [name, value] of data) {
    if (name[0] === '$' || (typeof value !== 'string' && !value.size)) continue // `$fn`; a file input left empty
    const list = name.endsWith('[]')
    const path = (list ? name.slice(0, -2) : name).split('.')
    if (path.some((p) => UNSAFE.has(p))) continue
    let at = out
    for (const p of path.slice(0, -1)) {
      const next = at[p]
      at = (next && typeof next === 'object' ? next : (at[p] = {})) as Tree
    }
    const k = path.at(-1)!
    // Own keys only: a field named `toString` is a field, not the method every object inherits.
    const had = Object.hasOwn(at, k)
    if (list) ((had ? at[k] : (at[k] = [])) as unknown[]).push(value)
    else if (had) at[k] = [at[k]].flat().concat(value)
    else at[k] = value
  }
  return out
}

// ---- keys -------------------------------------------------------------------------------------------------------

/** JSON with sorted object keys: the same input gives the same key on both sides (no input: `''`; JSON sends null). */
export function stable(v: unknown): string {
  if (v == null) return ''
  return JSON.stringify(v, (_, x: Record<string, unknown>) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]]),
        )
      : x,
  )
}

/** The cache key of one call: the function's id and its input in a stable order. */
export const keyOf = (id: string, input: unknown) => `${id}:${stable(input)}`
