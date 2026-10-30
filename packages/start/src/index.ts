// @weft/start: what route files import (research 25). A route module exports its component (`default`) and, when it
// needs them, `load` (plain async data for now, `query` later), `meta` (research 20 §3: static, awaited before the
// first byte, never reactive) and `prerender` (the params whose share cards `weft build` renders).
//
//   // src/routes/users/[id].tsx
//   export const load = async ({ params }: LoadArgs<'/users/[id]'>) => (await db.user(params.id)) ?? notFound()
//   export const meta: Meta<typeof load> = ({ data }) => ({ title: data.name, description: data.bio })
//   export default function User(props: RouteProps<typeof load, '/users/[id]'>) { return <h1>{props.data.name}</h1> }

import type { Merged, Meta as MetaObject, Site } from 'weft/ssr'

export { Link } from './view'
export { navigate, type NavigateOptions } from './router'
export type { Merged, Site } from 'weft/ssr'

/** Filled by the generated `.weft/routes.d.ts` with every route file's path (`'/users/[id]': true`). */
export interface RouteFiles {}

/** Route paths as files name them (`/users/[id]`); any string until `.weft/routes.d.ts` is generated. */
export type RoutePath = keyof RouteFiles extends never ? string : keyof RouteFiles & string

/** `'/users/[id]/posts/[...rest]'` → `{ id: string; rest: string }`. */
export type ParamsOf<P extends string> = string extends P
  ? Record<string, string>
  : { [K in ParamNames<P>]: string }
type ParamNames<P extends string> = P extends `${string}[${infer N}]${infer Rest}`
  ? (N extends `...${infer S}` ? S : N) | ParamNames<Rest>
  : never

/** What `load` gets. `request` is the incoming request (headers, cookies); `signal` aborts with it. */
export interface LoadArgs<P extends string = string> {
  params: ParamsOf<P>
  request: Request
  signal: AbortSignal
}

declare const notFoundBrand: unique symbol
/** Return (or throw) it from `load`: the page renders the 404 route with status 404, and `meta` isn't called. */
export interface NotFound {
  readonly isNotFound: true
  readonly [notFoundBrand]?: true
}

/** The not-found result, in the shape router-core's loaders recognise (`isNotFound`). */
export function notFound(): NotFound {
  return { isNotFound: true } as NotFound
}

type AnyLoad = (args: LoadArgs<any>) => unknown

/** A loader's data: what it resolves to, without `notFound()`. Top-level promise fields are deferred (streamed). */
export type DataOf<L> = L extends AnyLoad ? Exclude<Awaited<ReturnType<L>>, NotFound> : undefined

/** The data `meta` and cards see: deferred (promise) fields left out, since they're still streaming (H007). */
export type Settled<D> = D extends object ? { [K in keyof D as D[K] extends PromiseLike<any> ? never : K]: D[K] } : D

/** A route or layout component's props. `children` is the next level (layouts render it where the page goes). */
export interface RouteProps<L = undefined, P extends string = string> {
  params: ParamsOf<P>
  data: DataOf<L>
  children?: unknown
}

export type { MetaObject }

/**
 * `export const meta: Meta<typeof load> = ({ params, data }) => ({ title: data.name })`. Plain data, computed once
 * per request after the loaders and before the first byte; it can't read boxes (H006) or deferred fields (H007).
 */
export type Meta<L = undefined, P extends string = string> =
  | MetaObject
  | ((args: { params: ParamsOf<P>; data: Settled<DataOf<L>> }) => MetaObject | Promise<MetaObject>)

/** A card's props (`*.og.tsx`, research 20 §4): the route's params and settled data, the merged metadata, the site. */
export interface OgProps<L = undefined, P extends string = string> {
  params: ParamsOf<P>
  data: Settled<DataOf<L>>
  meta: Merged
  site: Site
}

/** The params of a param route whose cards `weft build` renders (static routes always are). */
export type Prerender<P extends string = string> = ParamsOf<P>[] | (() => ParamsOf<P>[] | Promise<ParamsOf<P>[]>)
