/** Compiler diagnostic entries in catalog order. */
export const compilerDiagnostics = [
  {
    code: 'W000',
    severity: 'error',
    by: 'compiler',
    catches: 'Syntax error; nothing else in the file is checked',
    fix: 'Fix the syntax error first',
  },
  {
    code: 'W080',
    severity: 'error',
    by: 'cli',
    catches:
      'A component with an untyped parameter that nothing renders: its props have nothing to be inferred from',
    fix: 'Render it, delete it, or annotate the parameter',
  },
  {
    code: 'W081',
    severity: 'error',
    by: 'cli',
    catches: 'An exported component with no written prop type',
    fix: '`weft fix` writes the inferred type (`weft dev` does this on save)',
  },
  {
    code: 'W082',
    severity: 'error',
    by: 'cli',
    catches: 'A generated `/*inferred*/` prop type no longer matches the callers',
    fix: '`weft fix` rewrites it, or delete the comment to keep the type you have',
  },
  {
    code: 'W083',
    severity: 'warning',
    by: 'cli',
    catches: 'An `any` weakens an inferred prop; names where the `any` came from',
    fix: 'Give the source a type, or annotate the prop',
  },
  {
    code: 'W084',
    severity: 'error',
    by: 'cli',
    catches: "One caller passes a type the component body can't handle, and the others agree",
    fix: 'Change the caller, or make the component handle both',
  },
  {
    code: 'W085',
    severity: 'warning',
    by: 'cli',
    catches: "An inferred prop names a type the component's scope can't see",
    fix: 'Move the type to module scope or export it, or annotate the parameter',
  },
  {
    code: 'W001',
    severity: 'error',
    by: 'compiler',
    catches:
      'A prop or `.value` used to compute something in the component body outside `derived`/`watch`/JSX/handlers (the body runs once). `const x = props.y` and destructuring only name the prop and stay live',
    fix: 'Wrap in `derived`, move into `watch`, or `untrack()` if a snapshot is intended',
    example: 'export function A({ items }: any) { const n = items.length + 1; return <p>{n}</p> }',
  },
  {
    code: 'W002',
    severity: 'error',
    by: 'compiler',
    catches: 'Writing state inside `derived`',
    fix: 'Move the write to a handler, or make the target `derived`',
    example:
      "import { state, derived } from '@weft-js/core'\nexport function A() { const a = state(0); const b = state(0); const d = derived(() => { b.value = a.value; return a.value }); return <p>{d.value}</p> }",
  },
  {
    code: 'W003',
    severity: 'error',
    by: 'compiler',
    catches: '`watch` writes state that its own source reads (cycle)',
    fix: 'Use `derived`',
    example:
      "import { state, watch } from '@weft-js/core'\nexport function A() { const a = state(0); watch(() => a.value, v => { a.value = v + 1 }); return <p>{a.value}</p> }",
  },
  {
    code: 'W004',
    severity: 'warning',
    by: 'compiler',
    catches: '`watch` that only copies one value into another',
    fix: 'Replace with `derived`',
    example:
      "import { state, watch } from '@weft-js/core'\nexport function A() { const a = state(0); const b = state(0); watch(() => a.value, v => { b.value = v }); return <p>{b.value}</p> }",
  },
  {
    code: 'W005',
    severity: 'error',
    by: 'compiler',
    catches: "`state(prop)`: React's `useState(prop)` bug, the box never follows the prop",
    fix: '`state.linked(() => prop)`, or `untrack` for a one-time copy',
    example:
      "import { state } from '@weft-js/core'\nexport function A({ v }: any) { const s = state(v); return <p>{s.value}</p> }",
  },
  {
    code: 'W006',
    severity: 'error',
    by: 'compiler',
    catches: "Nested prop destructuring (`({ user: { name } })`) can't stay live",
    fix: 'Read at the use site: `user.name`',
    example: 'export function A({ user: { name } }: any) { return <p>{name}</p> }',
  },
  {
    code: 'W007',
    severity: 'error',
    by: 'compiler',
    catches: 'Assigning to a `Derived` (maps TS2540)',
    fix: 'Make it `state` or `state.linked`',
  },
  {
    code: 'W008',
    severity: 'error',
    by: 'cli',
    catches: 'Box/value mismatch at a prop (a `State<T>` where `T` is expected, or the reverse)',
    fix: 'Pass `count.value` / pass `count`',
  },
  {
    code: 'W010',
    severity: 'error',
    by: 'compiler',
    catches: '`.map` over objects without `key`',
    fix: '`key={item.id}` on the row root',
    example:
      'export function A({ xs }: any) { return <ul>{xs.map((x: any) => <li>{x.name}</li>)}</ul> }',
  },
  {
    code: 'W011',
    severity: 'error',
    by: 'compiler',
    catches: 'A number on the left of `&&` (renders `0`)',
    fix: '`cond > 0 &&`',
    example: 'export function A({ xs }: any) { return <div>{xs.length && <p>has</p>}</div> }',
  },
  {
    code: 'W012',
    severity: 'error',
    by: 'compiler',
    catches: '`derived(async …)`, or reads after `await` in `resource` (untracked)',
    fix: 'Use `resource`; read before the `await`',
    example:
      "import { derived } from '@weft-js/core'\nexport function A() { const d = derived(async () => 1); return <p>{d.value}</p> }",
  },
  {
    code: 'W013',
    severity: 'error',
    by: 'compiler',
    catches: 'Early `return` inside a JSX `.map` callback',
    fix: 'Filter first: `xs.filter(…).map(…)`',
    example:
      'export function A({ xs }: any) { return <ul>{xs.map((x: any) => { if (!x.ok) return null; return <li key={x.id}>{x.name}</li> })}</ul> }',
  },
  {
    code: 'W014',
    severity: 'error',
    by: 'compiler',
    catches:
      'Identity-breaking `.map(p => ({ ...p, … }))` feeding a keyed list: every row re-runs on every change (in-file, and across files via props in `weft check`)',
    fix: 'Replace only the changed item (`p.id === id ? { ...p, price } : p`), or read the changing field live',
    example:
      "import { state } from '@weft-js/core'\nexport function A() { const xs = state([{ id: 'a', price: 1 }]); const push = (price: number) => { xs.value = xs.value.map(p => ({ ...p, price })) }; return <ul onClick={() => push(2)}>{xs.value.map(p => <li key={p.id}>{p.price}</li>)}</ul> }",
  },
  {
    code: 'W015',
    severity: 'error',
    by: 'compiler',
    catches: 'A box rendered without `.value` in JSX (a child, or a native attribute)',
    fix: 'Add `.value`',
    example:
      "import { state } from '@weft-js/core'\nexport function A() { const n = state(0); return <p>{n}</p> }",
  },
  {
    code: 'W016',
    severity: 'warning',
    by: 'compiler',
    catches: 'A non-reactive call passed as a component prop runs again whenever the prop is read',
    fix: 'Create the value once before JSX, unless the call must run again',
    example: 'render(() => <App api={createFakeApi()} />, root)',
  },
  {
    code: 'W017',
    severity: 'warning',
    by: 'compiler',
    catches:
      'One entry of a whole object read per row (`cart[p.id]`, `cart.value[p.id]` in a keyed-list row or its props, `box.value[prop]` in a row component): every change re-runs every row',
    fix: 'Read the entry from the box: `cart.get(p.id)`; to a row component pass the box (`State<Cart>`) and read `.get(id)` there',
    example:
      'export function A({ xs, cart }: any) { return <ul>{xs.map((x: any) => <li key={x.id}>{cart[x.id]}</li>)}</ul> }',
  },
  {
    code: 'W018',
    severity: 'warning',
    by: 'compiler',
    catches:
      '`const x = untrack(() => …reactive…)` in a component body that only the JSX reads: it renders the setup-time value and never updates',
    fix: '`derived(() => …)` and render `x.value`; `untrack` only for a value meant to stay fixed',
    example:
      "import { untrack, type State } from '@weft-js/core'\nexport function A({ id, live }: { id: string; live: State<Record<string, number>> }) { const n = untrack(() => live.get(id)); return <p>{n}</p> }",
  },
  {
    code: 'W019',
    severity: 'error',
    by: 'compiler',
    catches: 'Unsupported row pattern',
    fix: 'Read from one item param',
    example:
      'export function L({ xs }) { return <ul>{xs.map(({ id, ...more }) => <li key={id}>{id}</li>)}</ul> }',
  },
  {
    code: 'W020',
    severity: 'error',
    by: 'compiler',
    catches:
      'React hook imports and unbound standard hook names; imported custom `useX()` calls in components and local wrappers with resolved hook calls in their bodies; dependency arrays on core `watch`, `derived`, or `memo`. Local names and parameters alone do not establish a hook',
    fix:
      'Use `state` and `.value`, `watch(source, callback)` with `onCleanup`, `derived` and `.value`, `ref={el}`, or plain functions. Core `memo` returns a callable: read `value()`. Reads track dependencies. Only an empty dependency array on `derived` or `memo` has a safe autofix',
    example:
      "import { useState } from 'react'\nexport function A() { const [n] = useState(0); return <p>{n}</p> }",
  },
  {
    code: 'W030',
    severity: 'error',
    by: 'cli',
    catches: 'Module-level `state` reachable from the server entry graph (leaks across requests)',
    fix: '`context`, or mark `state.global`',
  },
  {
    code: 'W040',
    severity: 'error',
    by: 'compiler',
    catches:
      'Early `return` in a component body that depends on state (runs once, never re-checked)',
    fix: 'Branch in JSX',
    example:
      "import { state } from '@weft-js/core'\nexport function A() { const n = state(0); if (n.value > 1) return null; return <p>{n.value}</p> }",
  },
  {
    code: 'W041',
    severity: 'error',
    by: 'compiler',
    catches: '`let` variable mutated in a handler and read in JSX (never updates)',
    fix: 'Make it `state`',
    example:
      'export function A() { let n = 0; return <button onClick={() => { n++ }}>{n}</button> }',
  },
  {
    code: 'W044',
    severity: 'warning',
    by: 'cli',
    catches:
      'A `key` read from `crypto.randomUUID()`, `Date.now()`, `Math.random()` or `performance.now()`: it differs between server and client, so the row is rebuilt on hydration and on every render. At runtime the same miss logs `a key differs between server and client`',
    fix: 'Key on a stable id from the data',
  },
  {
    code: 'W043',
    severity: 'warning',
    by: 'cli',
    catches:
      '`data-x={true}` or `data-x={false}` on a native element: `data-*` booleans are presence flags, so these write `data-x=""` or nothing, not React\'s `"true"` and `"false"`',
    fix: '`data-x` for a flag (`weft fix`), or `data-x="true"` for the word. CSS matches `[data-x]`',
  },
  {
    code: 'W050',
    severity: 'error',
    by: 'compiler',
    catches:
      'Raw `addEventListener`, `setInterval`, `new WebSocket` or `new EventSource` in a component with no cleanup (it outlives the component)',
    fix: '`on(target, type, fn)` / `interval(ms, fn)` from @weft-js/core/browser, or clean it up in `onCleanup`',
    example: "export function A() { window.addEventListener('keydown', () => {}); return <p /> }",
  },
  {
    code: 'W051',
    severity: 'error',
    by: 'compiler',
    catches:
      'A @weft-js/core/browser value, `on` or `interval` created outside an owner: module scope, a timer or promise callback, an event handler, after `await`',
    fix: "Create it in a component's (or `defineState`'s) setup, or inside `createRoot(dispose => …)`",
    example: "import { online } from '@weft-js/core/browser'\nexport const up = online()",
  },
  {
    code: 'W052',
    severity: 'error',
    by: 'compiler',
    catches: '`watch` folding a stream by hand',
    fix: '`fold` + `initial` where it is read: kept in the cache',
    example:
      "import { state, watch } from '@weft-js/core'\nimport { prices } from './server/prices'\nexport function A() { const tick = prices({}); const list = state([]); watch(() => tick.value, m => { list.value = [...list.value, m] }); return <p>{list.value.length}</p> }",
  },
  {
    code: 'W053',
    severity: 'error',
    by: 'start',
    catches: '`.live()` on a query with no `tags` (dev): no mutation can ever poke it',
    fix: 'Add `tags` to the query, and the same tag to the mutations that change it',
  },
  {
    code: 'W054',
    severity: 'error',
    by: 'compiler',
    catches:
      '`media(query)` without `ssr` in a server-rendered component (hydration mismatch); a warning when `weft check` cannot tell',
    fix: 'Pass the server value: `media(query, { ssr: false })`',
    example:
      "import { media } from '@weft-js/core/browser'\nexport function A() { const dark = media('(prefers-color-scheme: dark)'); return <p>{dark.value ? 'dark' : 'light'}</p> }",
  },
  {
    code: 'W056',
    severity: 'warning',
    by: 'compiler',
    catches:
      '`watch` that copies a live value (a @weft-js/core/browser value, `.live()`) into `state`',
    fix: 'Read `live.value` directly, or `derived(() => live.value)`',
    example:
      "import { state, watch } from '@weft-js/core'\nimport { online } from '@weft-js/core/browser'\nexport function A() { const isOnline = online(); const up = state(true); watch(() => isOnline.value, v => { up.value = v }); return <p>{up.value}</p> }",
  },
  {
    code: 'W060',
    severity: 'error',
    by: 'compiler',
    catches:
      "A `group()` from @weft-js/core/style that can't be evaluated at build: a value that isn't a literal (named with its path), a `group()` outside a top-level `const`, or an accent that isn't literal tokens",
    fix: "Inline the token name or literal; define groups as `export const x = group('x', { … })`; raw CSS goes in `css: { … }`",
    example:
      "import { group } from '@weft-js/core/style'\nconst px = 13\nexport const g = group('g', { base: { pad: px } })",
  },
  {
    code: 'W061',
    severity: 'error',
    by: 'compiler',
    catches:
      "`bind:x` on a native element, or `bind:x`/`bind(box)` with something that isn't a box or that isn't a component prop",
    fix: 'Write `<Card bind:person={name} />`. A form element takes `value` and `onChange`',
    example:
      "import { bind, state } from '@weft-js/core'\nexport function A() { const n = state(1); return <input value={bind(n)} /> }",
  },
]
