import type { AsyncLocalStorage } from 'node:async_hooks'
import { BaseRootRoute, BaseRoute, isNotFound, type AnyRoute } from '@tanstack/router-core'
import { isRedirect, type Redirect } from '../data'
import * as exec from '../exec'
import type { Scope } from '../exec'
import type { Manifest, RouteModule } from './types'

/**
 * What each router-core loader gets as `context`: the request scope, where it leaves tags and redirects (router-core
 * copies the context object, so those go in shared containers), and the matched page's catch-all name.
 */
export interface LoadContext {
  request: Request
  scope: Scope
  tags: Map<string, Set<string>>
  out: { redirect?: Redirect; chain?: Promise<unknown> }
  splat?: string | undefined
}

interface TreeNode {
  route: AnyRoute
  children: AnyRoute[]
  dir: string
}

const makeLoader =
  (modules: Record<string, RouteModule>, als: AsyncLocalStorage<Scope>) =>
  (file: string, splat?: string) =>
  async ({
    params,
    context,
    abortController,
  }: {
    params: Record<string, unknown>
    context: LoadContext
    abortController: AbortController
  }) => {
    const load = modules[file]?.load
    if (!load) return undefined
    // Parent first (router-core starts them together): a layout's `load` is a guard, so a child never runs for a
    // visitor its parent redirects (research 28 §3).
    const out = context.out
    const before = out.chain
    let done!: () => void
    out.chain = new Promise<void>((ok) => {
      done = ok
    })
    await before
    if (out.redirect) return (done(), undefined)
    // Each loader runs in its own frame of the request scope, which records the tags of the queries it read.
    const f = exec.frame(context.scope)
    context.tags.set(file, f.tags!)
    try {
      const ctx = await f.ctx()
      const v = await als.run(f, () =>
        load({
          params: cleanParams(params, splat ?? context.splat),
          request: context.request,
          signal: abortController.signal,
          ctx,
        }),
      )
      // oxlint-disable-next-line typescript/only-throw-error -- router-core's own not-found signal, passed on as it came
      if (isNotFound(v)) throw v
      return v
    } catch (e) {
      if (!isRedirect(e)) throw e
      out.redirect ??= e
      return undefined
    } finally {
      done()
    }
  }

/** The router-core tree for the manifest: layouts are path prefixes, routes hang under their innermost layout. */
export function routeTree(
  manifest: Manifest,
  modules: Record<string, RouteModule>,
  als: AsyncLocalStorage<Scope>,
) {
  const loader = makeLoader(modules, als)
  const rootLayout = manifest.layouts.find((l) => l.dir === '')
  const root = new BaseRootRoute({
    ...(rootLayout && { loader: loader(rootLayout.file), weft: rootLayout }),
  } as never)
  const top: TreeNode = { route: root, children: [], dir: '' }
  const nodes = new Map<string, TreeNode>()
  const at = (id: string | undefined) => (id ? (nodes.get(id) ?? top) : top)
  for (const l of manifest.layouts) {
    if (l.dir === '') {
      nodes.set(l.id, top)
      continue
    }
    const parent = at(l.parent)
    const route = new BaseRoute({
      getParentRoute: () => parent.route,
      path: toPath(l.dir, parent.dir),
      loader: loader(l.file),
      weft: l,
    } as never)
    parent.children.push(route)
    nodes.set(l.id, { route, children: [], dir: l.dir })
  }
  const splats = new Set(manifest.routes.filter((r) => r.splat).map((r) => r.pattern))
  for (const r of manifest.routes) {
    if (r.kind !== 'page') continue
    const parent = at(r.layouts.at(-1))
    const rel = r.pattern
      .slice(1)
      .split('/')
      .slice(parent.dir ? parent.dir.split('/').length : 0)
      .join('/')
    // A splat beside it (`docs/[...slug]` next to `docs/index`) also matches `/docs`, and router-core ranks the
    // splat first unless the page is its index route, written with the slash.
    const index = rel && splats.has(`${r.pattern}/$`) ? `${rel}/` : rel
    parent.children.push(
      new BaseRoute({
        getParentRoute: () => parent.route,
        path: index || '/',
        loader: loader(r.file, r.splat),
        weft: r,
      } as never),
    )
  }
  // Innermost layouts first, so each route's children are attached before its parent takes it.
  for (const n of [...new Set(nodes.values())]
    .filter((x) => x !== top)
    .sort((a, b) => b.dir.length - a.dir.length))
    if (n.children.length) n.route.addChildren(n.children)
  return root.addChildren(top.children)
}

/** A layout dir relative to its parent layout's, as a router-core path: `users/[id]` → `users/$id`. */
function toPath(dir: string, parentDir: string) {
  const rel = dir.split('/').slice(parentDir ? parentDir.split('/').length : 0)
  return rel
    .map((s) => s.replace(/^\[\.\.\.(\w+)\]$/, '$').replace(/^\[(\w+)\]$/, '$$$1'))
    .join('/')
}

/** router-core's params without its splat aliases; a splat is under its file name (`[...rest]` → `rest`). */
export function cleanParams(
  p: Record<string, unknown> = {},
  splat?: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k in p) if (k !== '*' && k !== '_splat') out[k] = String(p[k])
  if (splat && p._splat !== undefined) out[splat] = p._splat as string
  return out
}
