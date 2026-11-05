import { fns, StartError, type Fn, type SchemaIssue } from '../data'
import type { Scope } from './scope'

type Obj = Record<PropertyKey, unknown>

// ---- validation and checks ------------------------------------------------------------------------------------

export async function validate(fn: Fn, input: unknown): Promise<unknown> {
  const schema = fn.def.input
  if (!schema) return input
  const r = await schema['~standard'].validate(input)
  if (!r.issues) return r.value
  throw rejected(fn, r.issues)
}

const plainPath = (i: SchemaIssue) => (i.path ?? []).map((p) => (typeof p === 'object' ? p.key : p))

function rejected(fn: Fn, list: readonly SchemaIssue[]) {
  const issues = list.map((i) => ({
    message: i.message,
    path: i.path && plainPath(i),
  })) as (SchemaIssue & { path?: PropertyKey[] })[]
  const where = issues
    .map((i) => `${i.path?.length ? i.path.map(String).join('.') + ': ' : ''}${i.message}`)
    .join('; ')
  return new StartError(
    'Q002',
    `\`${fn.$id}\` rejected its input: ${where}`,
    'pass what the schema accepts',
    { status: 400, issues },
  )
}
/** A form's string as the type it may stand for (research 29 §5): the schema says whether it was wrong. */
function reading(s: string): unknown {
  if (s === '') return undefined
  if (s === 'on' || s === 'true') return true
  if (s === 'false') return false
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s
}
/**
 * A form sends strings and a schema may want numbers or booleans, and Standard Schema can't say which: each issue
 * on a string tries its obvious reading, then the input is validated again. Fields a reading fixed report nothing; the
 * rest report what the schema says of what was typed (an empty field: its "required", not "expected a string").
 */
export async function formInput(fn: Fn, input: unknown): Promise<unknown> {
  const schema = fn.def.input
  if (!schema || !input || typeof input !== 'object') return validate(fn, input)
  const value: Obj = { ...input }
  let left: readonly SchemaIssue[] = []
  for (let i = 0; i < 3; i++) {
    const r = await schema['~standard'].validate(value)
    if (!r.issues) return r.value
    left = r.issues
    let changed = false
    for (const issue of r.issues) {
      const path = plainPath(issue)
      if (!path.length) continue
      let at: Obj | undefined = value
      for (const p of path.slice(0, -1)) {
        const inner: unknown = at?.[p]
        if (!inner || typeof inner !== 'object') {
          at = undefined
          break
        }
        at = at[p] = (Array.isArray(inner) ? [...inner] : { ...inner }) as Obj
      }
      const k = path.at(-1)!
      const typed = at?.[k]
      if (typeof typed !== 'string') continue
      const next = reading(typed)
      if (next === typed) continue
      if (next === undefined) delete at![k]
      else at![k] = next
      changed = true
    }
    if (!changed) break
  }
  const first = await schema['~standard'].validate(input)
  const where = (i: SchemaIssue) => JSON.stringify(plainPath(i))
  throw rejected(
    fn,
    left.map((i) => first.issues?.find((o) => where(o) === where(i)) ?? i),
  )
}
/** Dev and tests: the value against `output` (C002), and what JSON would change (Q005). */
export async function checked(v: unknown, fn: Fn, scope: Scope) {
  serializable(v, fn, scope)
  const schema = fn.def.output
  if (!schema || fn.def.impl) return // `impl`: rust.ts checked what came back, on every call
  const r = await schema['~standard'].validate(v)
  if (r.issues)
    throw new StartError(
      'C002',
      `\`${fn.$id}\` returned a value its \`output\` schema rejects: ${r.issues.map((i) => `${i.path?.map((p) => (typeof p === 'object' ? p.key : p)).join('.') ?? ''}: ${i.message}`).join('; ')}`,
      'fix `run`, or the schema',
      { status: 500 },
    )
}
/** Q005 (dev): what JSON would change on the way to the client. */
function serializable(v: unknown, fn: Fn, scope: Scope) {
  const bad = (x: unknown, path: string): string | undefined => {
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return undefined
    if (typeof x === 'number') return Number.isFinite(x) ? undefined : `${path} is ${x}`
    if (x === undefined) return undefined
    if (typeof x !== 'object') return `${path} is a ${typeof x}`
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length; i++) {
        if (x[i] === undefined) return `${path}[${i}] is undefined (JSON sends null)`
        const b = bad(x[i], `${path}[${i}]`)
        if (b) return b
      }
      return undefined
    }
    const proto: unknown = Object.getPrototypeOf(x)
    if (proto !== Object.prototype && proto !== null)
      return `${path} is a ${(x as { constructor?: { name?: string } }).constructor?.name ?? 'class instance'}`
    for (const k of Object.keys(x)) {
      const b = bad((x as Obj)[k], `${path}.${k}`)
      if (b) return b
    }
    return undefined
  }
  const b = bad(v, 'result')
  if (b)
    scope.options.onDiagnostic?.({
      code: 'Q005',
      severity: 'warning',
      message: `\`${fn.$id}\`'s ${b}: the client gets a different value than the server rendered with. Send plain data (ISO strings, arrays, objects)`,
    })
}
/**
 * Q008 (dev, once): each mutation's static `invalidates` against the tags queries declare. A tags function is called
 * with an input whose every field reads `*`, so `todo:${id}` declares `todo:*`.
 */
export function checkTags(
  report: (d: { code: string; severity: string; message: string }) => void,
) {
  const star: unknown = new Proxy(
    {},
    { get: (_, k) => (k === Symbol.toPrimitive ? () => '*' : '*') },
  )
  const declared: string[] = []
  for (const f of fns.values()) {
    if (f.kind !== 'query') continue
    try {
      declared.push(...(typeof f.def.tags === 'function' ? f.def.tags(star) : (f.def.tags ?? [])))
    } catch {}
  }
  const matches = (tag: string) =>
    declared.some(
      (d) =>
        d === tag ||
        (d.includes('*') &&
          new RegExp(`^${d.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^]*')}$`).test(
            tag,
          )) ||
        (tag.includes('*') && d.startsWith(tag.slice(0, tag.indexOf('*')))),
    )
  for (const f of fns.values()) {
    if (f.kind !== 'mutation' || !f.def.invalidates) continue
    let tags: readonly string[]
    try {
      tags =
        typeof f.def.invalidates === 'function' ? f.def.invalidates(star, star) : f.def.invalidates
    } catch {
      continue
    }
    for (const t of tags)
      if (!matches(t))
        report({
          code: 'Q008',
          severity: 'warning',
          message: `\`${f.$id}\` invalidates \`${t}\`, a tag no query declares: nothing refreshes. Fix the tag, or add it to the query's \`tags\``,
        })
  }
}
