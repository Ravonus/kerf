// The file-route scanner and the client strip (research 25 §2, §6): plain functions, no server.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanRoutes, routeTypes } from '../src/routes.mjs'
import { stripServerExports } from '../src/vite.mjs'

const fixture = fileURLToPath(new URL('./fixtures/app', import.meta.url))

test('src/routes → routes in match order, layouts, cards, 404 and error', () => {
  const m = scanRoutes(fixture)
  expect(m.problems).toEqual([])
  expect(m.layouts).toEqual([
    { id: 'layout:', file: 'src/routes/_layout.tsx', dir: '', parent: undefined },
    { id: 'layout:users', file: 'src/routes/users/_layout.tsx', dir: 'users', parent: 'layout:' },
  ])
  // Most specific first: static segments before params, longer before shorter, `/` last.
  expect(m.routes.map(r => [r.id, r.kind, r.params, r.layouts, r.card ?? null])).toEqual([
    ['/tags/$tag', 'page', ['tag'], ['layout:'], null],
    ['/users/$id', 'page', ['id'], ['layout:', 'layout:users'], 'src/routes/users/[id].og.tsx'],
    ['/about', 'page', [], ['layout:'], null],
    ['/boom', 'page', [], ['layout:'], null],
    ['/deferred-meta', 'page', [], ['layout:'], null],
    ['/old', 'page', [], ['layout:'], null],
    ['/slow', 'page', [], ['layout:'], null],
    ['/todos', 'page', [], ['layout:'], null],
    ['/users', 'page', [], ['layout:', 'layout:users'], null],
    ['/', 'page', [], ['layout:'], null],
    ['404', '404', [], ['layout:'], null],
    ['error', 'error', [], ['layout:'], null],
  ])
})

test('params, splats and bad names', () => {
  const dir = join(fixture, '..', 'scan')
  const m = scanRoutes(dir, join(dir, 'routes'))
  expect(m.routes.map(r => [r.id, r.params, r.splat ?? null])).toEqual([
    ['/docs/$section/intro', ['section'], null],
    ['/docs/$section', ['section'], null],
    ['/docs/$', ['rest'], 'rest'],
  ])
  expect(m.problems.map(p => p.file)).toEqual(['routes/bad[x].tsx'])
})

test('.weft/routes.d.ts lists every route file path', () => {
  const t = routeTypes(scanRoutes(fixture))
  expect(t).toContain("'/users/[id]': true")
  expect(t).toContain("'/': true")
  expect(t).not.toContain('404')
})

test('the client build of a route has no load, meta or prerender, and no import only they used', () => {
  const file = join(fixture, 'src/routes/users/[id].tsx')
  const out = stripServerExports(readFileSync(file, 'utf8'), file)
  expect(out).not.toMatch(/export const (load|meta|prerender)|db\.user|notFound|from '..\/..\/db'/) // `typeof load` in a type stays: types are erased
  expect(out).toContain('export default function User')
  expect(out).toMatch(/import \{ type RouteProps \} from '@weft\/start'|import type/)
})
