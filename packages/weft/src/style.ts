// weft/style: named style groups (research 23). A group is data: intent keys and token names (./style/vocab.ts),
// typed here and evaluated at build by the compiler, which also lowers every call site to plain attributes:
//
//   <li {...productRow({ stock: s })}>      →  <li data-g="product-row" data-stock={s}>   (one attribute binding)
//   <span {...productRow.price}>            →  <span data-g="product-row" data-part="price">
//
// The Vite plugin turns definitions plus call sites into readable CSS in `@layer app.groups` (./style/css.ts). The
// function below only runs where a call site wasn't lowered (an argument that isn't an object literal).
import type { Vocab } from './style/vocab'

/** Token-only declarations: each key is an intent from the closed vocabulary, each value one of its token names. */
export type Intent = { [K in keyof Vocab]?: keyof Vocab[K] } & {
  /** The escape: raw CSS properties, counted by `weft check` (D023 in research 23). */
  css?: Record<string, string | number>
}

type Exact<T, Shape> = T & { [K in Exclude<keyof T, keyof Shape>]: never }
type Values = Record<string, Intent>
type AxesOf<A> = { [K in keyof A]: A[K] extends 'inherit' ? 'inherit' : { [V in keyof A[K]]: Exact<A[K][V], Intent> } }
type Plain<A> = { [K in keyof A as A[K] extends 'inherit' ? never : K]: A[K] }
type AxisArgs<A> = { [K in keyof Plain<A>]?: Extract<keyof Plain<A>[K], string> }

export type Compound<A, P> = {
  when: AxisArgs<A>
  /** Style one part when the axes match; the root when omitted. */
  part?: Extract<keyof P, string>
  set: Intent
}

export type GroupDef<A, P, S> = {
  base?: Intent
  axes?: A & AxesOf<A>
  parts?: P & { [K in keyof P]: Exact<P[K], Intent> }
  /** ARIA states (`selected` → `aria-selected`), other `data-*` states, and pseudo states (`hover`, `focus`, `active`, `disabled`). */
  states?: S & { [K in keyof S]: Exact<S[K], Intent> }
  compounds?: Compound<A, P>[]
  defaults?: AxisArgs<A>
}

type Pseudo = 'hover' | 'focus' | 'active' | 'disabled'

/** Attributes a group writes: spread them on the element (`{...card(…)}`). */
export type GroupAttrs = { 'data-g': string } & Record<`data-${string}` | `aria-${string}`, string | boolean | undefined>
export type PartAttrs = { readonly 'data-g': string; readonly 'data-part': string }

export type Group<N extends string, A, P, S> = {
  (axes?: AxisArgs<A> & { [K in Exclude<keyof S, Pseudo>]?: boolean }): GroupAttrs
  readonly group: N
} & { readonly [K in keyof P]: PartAttrs }

const ARIA = new Set(['selected', 'pressed', 'checked', 'expanded', 'current', 'invalid', 'busy'])
const PSEUDO = new Set(['hover', 'focus', 'active', 'disabled'])

/** Define a style group. The definition must be literal data (W060 otherwise); call sites compile to attributes. */
export function group<const N extends string, const A extends Record<string, Values | 'inherit'> = {}, const P extends Record<string, Intent> = {}, const S extends Record<string, Intent> = {}>(
  name: N,
  def: GroupDef<A, P, S>,
): Group<N, A, P, S> {
  const call = (axes: Record<string, unknown> = {}) => {
    const out: Record<string, unknown> = { 'data-g': name, ...Object.fromEntries(Object.entries(def.defaults ?? {}).map(([k, v]) => [`data-${k}`, v])) }
    for (const [k, v] of Object.entries(axes)) {
      if (def.axes && k in def.axes) out[`data-${k}`] = v
      else if (def.states && k in def.states && !PSEUDO.has(k)) out[ARIA.has(k) ? `aria-${k}` : `data-${k}`] = ARIA.has(k) ? String(!!v) : v ? '' : undefined
    }
    return out
  }
  Object.defineProperty(call, 'group', { value: name })
  // Parts are properties of the function; defineProperty also covers parts called `name` or `length`.
  for (const part of Object.keys(def.parts ?? {})) Object.defineProperty(call, part, { value: Object.freeze({ 'data-g': name, 'data-part': part }), enumerable: true })
  return call as unknown as Group<N, A, P, S>
}
