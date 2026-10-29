// The diagnostic catalog the agent layer knows about: PLAN §3.5 (W), §4.2 (W050–W056, T012), §7b (T001–T009,
// P001–P006), research 13 §4.4 (P100–P120), plus the codes proposed in research 17 (marked `proposed`).
//
// W-codes come from the compiler. Each has an `example` that should trigger it; `probe()` runs the installed
// compiler over the examples, so AGENTS.md and `docs` only claim what this weft version actually reports. T-codes
// come from `weft check`'s test pass (tests.mjs); their examples are test files, checked the same way.

/** @typedef {{ code: string, severity: 'error' | 'warning', catches: string, fix: string, by: 'compiler' | 'cli' | 'test' | 'reserved', example?: string, proposed?: boolean }} Entry */

/** @type {Entry[]} */
export const catalog = [
  { code: 'W000', severity: 'error', by: 'compiler', catches: 'Syntax error; nothing else in the file is checked', fix: 'Fix the syntax error first' },
  {
    code: 'W001', severity: 'error', by: 'compiler',
    catches: 'A prop or `.value` read in the component body outside `derived`/`watch`/JSX/handlers (the body runs once)',
    fix: 'Wrap in `derived`, move into `watch`, or `untrack()` if a snapshot is intended',
    example: 'export function A({ items }: any) { const n = items.length; return <p>{n}</p> }',
  },
  {
    code: 'W002', severity: 'error', by: 'compiler', catches: 'Writing state inside `derived`', fix: 'Move the write to a handler, or make the target `derived`',
    example: "import { state, derived } from 'weft'\nexport function A() { const a = state(0); const b = state(0); const d = derived(() => { b.value = a.value; return a.value }); return <p>{d.value}</p> }",
  },
  {
    code: 'W003', severity: 'error', by: 'compiler', catches: '`watch` writes state that its own source reads (cycle)', fix: 'Use `derived`',
    example: "import { state, watch } from 'weft'\nexport function A() { const a = state(0); watch(() => a.value, v => { a.value = v + 1 }); return <p>{a.value}</p> }",
  },
  {
    code: 'W004', severity: 'warning', by: 'compiler', catches: '`watch` that only copies one value into another', fix: 'Replace with `derived`',
    example: "import { state, watch } from 'weft'\nexport function A() { const a = state(0); const b = state(0); watch(() => a.value, v => { b.value = v }); return <p>{b.value}</p> }",
  },
  {
    code: 'W005', severity: 'error', by: 'compiler', catches: "`state(prop)`: React's `useState(prop)` bug, the box never follows the prop", fix: '`state.linked(() => prop)`, or `untrack` for a one-time copy',
    example: "import { state } from 'weft'\nexport function A({ v }: any) { const s = state(v); return <p>{s.value}</p> }",
  },
  {
    code: 'W006', severity: 'error', by: 'compiler', catches: "Nested prop destructuring (`({ user: { name } })`) can't stay live", fix: 'Read at the use site: `user.name`',
    example: 'export function A({ user: { name } }: any) { return <p>{name}</p> }',
  },
  { code: 'W007', severity: 'error', by: 'compiler', catches: 'Assigning to a `Derived` (maps TS2540)', fix: 'Make it `state` or `state.linked`' },
  { code: 'W008', severity: 'error', by: 'compiler', catches: 'Box/value mismatch at a prop (a `State<T>` where `T` is expected, or the reverse)', fix: 'Pass `count.value` / pass `count`' },
  {
    code: 'W010', severity: 'error', by: 'compiler', catches: '`.map` over objects without `key`', fix: '`key={item.id}` on the row root',
    example: 'export function A({ xs }: any) { return <ul>{xs.map((x: any) => <li>{x.name}</li>)}</ul> }',
  },
  {
    code: 'W011', severity: 'error', by: 'compiler', catches: 'A number on the left of `&&` (renders `0`)', fix: '`cond > 0 &&`',
    example: 'export function A({ xs }: any) { return <div>{xs.length && <p>has</p>}</div> }',
  },
  {
    code: 'W012', severity: 'error', by: 'compiler', catches: '`derived(async …)`, or reads after `await` in `resource` (untracked)', fix: 'Use `resource`; read before the `await`',
    example: "import { derived } from 'weft'\nexport function A() { const d = derived(async () => 1); return <p>{d.value}</p> }",
  },
  {
    code: 'W013', severity: 'error', by: 'compiler', catches: 'Early `return` inside a JSX `.map` callback', fix: 'Filter first: `xs.filter(…).map(…)`',
    example: 'export function A({ xs }: any) { return <ul>{xs.map((x: any) => { if (!x.ok) return null; return <li key={x.id}>{x.name}</li> })}</ul> }',
  },
  {
    code: 'W014', severity: 'error', by: 'compiler',
    catches: 'Identity-breaking `.map(p => ({ ...p, … }))` feeding a keyed list: every row re-runs on every change (error in-file; `weft check` follows props across files)',
    fix: 'Replace only the changed item (`p.id === id ? { ...p, price } : p`), or keep items stable and read the changing field live',
    example: "import { state } from 'weft'\nexport function A() { const xs = state([{ id: 'a', price: 1 }]); const push = (price: number) => { xs.value = xs.value.map(p => ({ ...p, price })) }; return <ul onClick={() => push(2)}>{xs.value.map(p => <li key={p.id}>{p.price}</li>)}</ul> }",
  },
  {
    code: 'W015', severity: 'error', by: 'compiler', catches: 'A box rendered without `.value` in JSX (a child, or a native attribute)', fix: 'Add `.value`',
    example: "import { state } from 'weft'\nexport function A() { const n = state(0); return <p>{n}</p> }",
  },
  {
    code: 'W020', severity: 'error', by: 'compiler', catches: 'React-isms (W020–W029): `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`, custom `useX()` hooks, dependency arrays',
    fix: '`state`, `watch`, `derived`, `ref={el}`, plain functions',
    example: "import { useState } from 'react'\nexport function A() { const [n] = useState(0); return <p>{n}</p> }",
  },
  { code: 'W030', severity: 'error', by: 'compiler', catches: 'Module-level `state` reachable from the server entry graph (leaks across requests)', fix: '`context`, or mark `state.global`' },
  {
    code: 'W040', severity: 'error', by: 'compiler', catches: 'Early `return` in a component body that depends on state (runs once, never re-checked)', fix: 'Branch in JSX',
    example: "import { state } from 'weft'\nexport function A() { const n = state(0); if (n.value > 1) return null; return <p>{n.value}</p> }",
  },
  {
    code: 'W041', severity: 'error', by: 'compiler', catches: '`let` variable mutated in a handler and read in JSX (never updates)', fix: 'Make it `state`',
    example: 'export function A() { let n = 0; return <button onClick={() => { n++ }}>{n}</button> }',
  },
  {
    code: 'W042', severity: 'warning', by: 'compiler', catches: '`onChange` on a text input (the DOM fires it on blur, not per keystroke)', fix: '`onInput`',
    example: 'export function A() { return <input onChange={() => {}} /> }',
  },
  {
    code: 'W050', severity: 'error', by: 'compiler',
    catches: 'Raw `addEventListener`, `setInterval`, `new WebSocket` or `new EventSource` in a component with no cleanup (it outlives the component)',
    fix: '`on(target, type, fn)` / `interval(ms, fn)` from weft/browser (edit offered), or clean it up in `onCleanup`',
    example: "export function A() { window.addEventListener('keydown', () => {}); return <p /> }",
  },
  {
    code: 'W051', severity: 'error', by: 'compiler',
    catches: 'A weft/browser value, `on` or `interval` created outside an owner: module scope, a timer or promise callback, an event handler, after `await`',
    fix: "Create it in a component's (or `defineState`'s) setup, or inside `createRoot(dispose => …)`",
    example: "import { online } from 'weft/browser'\nexport const up = online()",
  },
  {
    code: 'W054', severity: 'error', by: 'compiler',
    catches: '`media(query)` without `ssr` in a server-rendered component (hydration mismatch); a warning when `weft check` cannot tell',
    fix: "Pass the server value: `media(query, { ssr: false })`",
    example: "import { media } from 'weft/browser'\nexport function A() { const dark = media('(prefers-color-scheme: dark)'); return <p>{dark.value ? 'dark' : 'light'}</p> }",
  },
  {
    code: 'W056', severity: 'warning', by: 'compiler', catches: '`watch` that copies a live value (a weft/browser value, `.live()`) into `state`',
    fix: 'Read `live.value` directly, or `derived(() => live.value)`',
    example: "import { state, watch } from 'weft'\nimport { online } from 'weft/browser'\nexport function A() { const isOnline = online(); const up = state(true); watch(() => isOnline.value, v => { up.value = v }); return <p>{up.value}</p> }",
  },

  {
    code: 'T001', severity: 'error', by: 'cli', catches: 'A test with no assertion (or an `expect(x)` with no matcher): it passes as long as nothing throws. `weft/test` also fails such a test at runtime',
    fix: 'Assert what the user sees: `expect(screen.getByRole(…)).toHaveTextContent(…)`',
    example: "import { render } from 'weft/test'\nimport { Cart } from './Cart'\ntest('renders', () => { render(Cart) })",
  },
  {
    code: 'T002', severity: 'error', by: 'cli', catches: 'Tautology: `expect` on a literal, or a value compared with itself', fix: 'Assert on the output of the code under test',
    example: "test('works', () => { expect(true).toBe(true) })",
  },
  {
    code: 'T003', severity: 'error', by: 'cli', catches: 'Asserting a value the test just set (`n.value = 5; expect(n.value).toBe(5)`) without going through the UI or the graph',
    fix: 'Act through the UI (`await user.click(…)`) or assert on what depends on the value',
    example: "import { state } from 'weft'\ntest('count', () => { const n = state(0); n.value = 5; expect(n.value).toBe(5) })",
  },
  {
    code: 'T004', severity: 'error', by: 'cli', catches: 'Sleeps, real timers or `waitFor` polling in a test', fix: '`await flush()`; for time, `clock.install()` and `await clock.advance(ms)` from weft/test',
    example: "test('later', async () => { await new Promise(r => setTimeout(r, 100)); expect(1 + 1).toBe(2) })",
  },
  {
    code: 'T005', severity: 'warning', by: 'cli', catches: 'Implementation query: `container`, CSS selectors, classes, `innerHTML`, test ids, or app state read directly in a component test',
    fix: 'Query by role, label or text (`screen.getByRole`, `getByLabelText`, `getByText`)',
    example: "import { render } from 'weft/test'\nimport { Cart } from './Cart'\ntest('total', () => { const { container } = render(Cart); expect(container.querySelector('.total')!.textContent).toBe('$0') })",
  },
  {
    code: 'T006', severity: 'error', by: 'cli', catches: 'Mocking weft (`vi.mock(\'weft\')`) or the unit under test, so the test checks the mock', fix: 'Fake the edges (network, storage) and render the real component',
    example: "import { render } from 'weft/test'\nimport { Cart } from './Cart'\nvi.mock('./Cart')\ntest('cart', () => { render(Cart); expect(document.body.textContent).toBe('') })",
  },
  {
    code: 'T007', severity: 'error', by: 'cli', catches: 'Snapshot without approval: it records today\'s output and passes against it', fix: 'Assert the behavior with role/label/text queries, or approve it with `// weft-allow T007: <reason>`',
    example: "import { render } from 'weft/test'\nimport { Cart } from './Cart'\ntest('cart', () => { render(Cart); expect(document.body.innerHTML).toMatchSnapshot() })",
  },
  {
    code: 'T008', severity: 'error', by: 'cli', catches: 'Conditional `expect` (`if`, `?:`, `&&`, `catch`), or a test whose only `expect`s are in a loop', fix: 'Make the condition its own assertion, then assert unconditionally; `expect(fn).toThrow()` for errors',
    example: "test('maybe', () => { const xs = [1, 2]; if (xs.length > 5) expect(xs[0]).toBe(1) })",
  },
  {
    code: 'T009', severity: 'error', by: 'cli', catches: '`.only` or `.skip` committed (also `fit`, `xit`, `xdescribe`)', fix: 'Remove `.only`; fix or delete a skipped test (`test.fails` for one meant to fail)',
    example: "test.only('focused', () => { expect(Math.max(1, 2)).toBe(2) })",
  },
  {
    code: 'T012', severity: 'error', by: 'test', catches: 'A test ends with weft/browser listeners, intervals or subscribed values still open (checked by weft/test after each test)',
    fix: 'Unmount what the test created (dispose any `createRoot`), or fix the leak',
  },

  { code: 'P001', severity: 'warning', by: 'reserved', catches: 'Stray top-level script file outside a declared task', fix: 'Declare it in `tasks`, or delete it' },
  { code: 'P002', severity: 'warning', by: 'cli', catches: '`package.json` script that is not a `weft …` alias', fix: 'Move it to `tasks` in weft.config.ts and alias `weft run <name>`' },
  { code: 'P003', severity: 'error', by: 'cli', catches: 'Task duplicates a built-in command or another task (same name or same command)', fix: 'Rename it or remove the duplicate' },
  { code: 'P004', severity: 'error', by: 'cli', catches: 'Task without `description` or `sideEffects`', fix: 'Add both (`sideEffects: []` when it has none)' },
  { code: 'P005', severity: 'error', by: 'reserved', catches: 'Write outside `scope.write`', fix: 'Revert the write, or widen `scope.write` deliberately' },
  { code: 'P006', severity: 'warning', by: 'reserved', catches: 'Unreferenced one-off script', fix: 'Delete it, or declare it as a task' },
  { code: 'P007', severity: 'error', by: 'cli', proposed: true, catches: 'weft.config.ts fails to load or fails the schema (the Zod path is given)', fix: 'Fix the key at the path shown' },
  { code: 'P008', severity: 'error', by: 'cli', proposed: true, catches: '`slots` names a slot id weft does not define', fix: 'Use an id from `weft check --json` `slots`' },
  { code: 'P009', severity: 'error', by: 'cli', proposed: true, catches: '`slots` picks a winner that is not in `plugins` (or does not provide that slot)', fix: 'Add the plugin, or pick one that provides the slot' },

  { code: 'M001', severity: 'error', by: 'cli', proposed: true, catches: 'Relative `og:image` (a relative `site.image`, or `auto`) and no `site.url`: crawlers need absolute URLs', fix: 'Set `site.url` to the absolute origin' },
  { code: 'M002', severity: 'error', by: 'reserved', catches: 'Param route with an `auto` image on a static-only preset and no `prerender`', fix: 'Export `prerender`, or set `og.image`' },
  { code: 'M003', severity: 'warning', by: 'cli', proposed: true, catches: 'No description after merging (config-level until routing: `site.description`)', fix: 'Set `site.description` (or the route\'s `meta.description`)' },
  { code: 'M004', severity: 'warning', by: 'cli', proposed: true, catches: 'Title over 60 characters or description over 160 (search results and cards cut them)', fix: 'Shorten it' },
  { code: 'M005', severity: 'error', by: 'reserved', catches: '`.og.tsx` uses a style or element the card renderer does not support', fix: 'Use flexbox, text, images, borders, radius, gradients, shadows' },
  { code: 'M006', severity: 'error', by: 'reserved', catches: '`meta` reads a box or calls a hook (metadata is plain data)', fix: 'Compute it from `params` and `data`' },
  { code: 'M007', severity: 'error', by: 'reserved', catches: '`meta` reads a deferred (streamed) field of the loader\'s data', fix: 'Await the field in `load`, or leave it out of `meta`' },

  { code: 'P100', severity: 'error', by: 'cli', catches: 'Two providers for a `one` slot (or the same key in a `keyed` slot)', fix: 'Remove one, or name the winner in `slots: {}`' },
  { code: 'P101', severity: 'error', by: 'reserved', catches: 'A slot consumer is used but nothing provides it', fix: 'Add the plugin, or set the option that disables it back' },
  { code: 'P102', severity: 'error', by: 'reserved', catches: 'Provider implements no slot interface version this weft supports (P102w: bound through an adapter)', fix: 'Upgrade the plugin or weft' },
  { code: 'P103', severity: 'error', by: 'reserved', catches: "Plugin's `weft` peer range doesn't include the installed weft", fix: 'Upgrade either side' },
  { code: 'P104', severity: 'error', by: 'reserved', catches: '`requires` names a slot that nothing provides', fix: 'Add a provider' },
  { code: 'P105', severity: 'error', by: 'reserved', catches: 'Cycle in `order.before`/`after`', fix: 'Remove one edge' },
  { code: 'P106', severity: 'error', by: 'reserved', catches: "Two plugins' `transform` filters matched one module with no declared order", fix: 'Add `order.after` to one' },
  { code: 'P107', severity: 'error', by: 'reserved', catches: 'Unfiltered `resolveId`/`load`/`transform`, or a `config` hook', fix: 'Add `filter`; move config to data' },
  { code: 'P108', severity: 'warning', by: 'reserved', catches: 'Plugin over its HMR budget share', fix: 'Narrow filters, cache, or move work to `check`' },
  { code: 'P109', severity: 'error', by: 'reserved', catches: 'Undeclared permission used, or permissions widened since the lock', fix: 'Declare it, then `weft plugins approve`' },
  { code: 'P110', severity: 'error', by: 'reserved', catches: 'Installed plugin integrity differs from `.weft/plugins.lock.json`', fix: 'Reinstall, or approve the update' },
  { code: 'P111', severity: 'error', by: 'reserved', catches: "Diagnostic code outside the plugin's namespace, or a namespace collision", fix: 'Use `<short-name>/<CODE>`' },
  { code: 'P112', severity: 'error', by: 'reserved', catches: 'Plugin AGENTS section over 1 KB', fix: 'Shorten; move detail to the MCP `docs` tool' },
  { code: 'P113', severity: 'error', by: 'reserved', catches: 'Token, catalog, compiler-data or Vite-config key collision', fix: 'Rename in the namespace' },
  { code: 'P114', severity: 'error', by: 'reserved', catches: 'Provider runtime code in an entry chunk (eager import)', fix: "Reach it only through the slot's `load()`" },
  { code: 'P115', severity: 'error', by: 'reserved', catches: 'Invalid plugin options (Zod path given)', fix: 'Fix the option' },
  { code: 'P116', severity: 'error', by: 'cli', catches: 'Same plugin twice, or `name`/`version` does not match `package.json`', fix: 'Remove the duplicate' },
  { code: 'P117', severity: 'error', by: 'reserved', catches: '`contribute()` is not pure', fix: 'Move IO to a build-side provider' },
  { code: 'P118', severity: 'error', by: 'reserved', catches: 'Server code registered outside a server-side slot', fix: 'Provide a slot, or move it into app code' },
  { code: 'P119', severity: 'error', by: 'reserved', catches: "Provider failed its slot's conformance suite", fix: 'Fix the provider; the failing cases are listed' },
  { code: 'P120', severity: 'error', by: 'cli', catches: "A weft plugin's `vite` part registered directly in `vite.config.ts`", fix: 'Move it to `plugins` in weft.config.ts' },
]

const byCode = new Map(catalog.map(e => [e.code, e]))

/** W021–W029 share W020's entry. */
export function entry(code) {
  if (byCode.has(code)) return byCode.get(code)
  if (/^W02\d$/.test(code)) return byCode.get('W020')
  return undefined
}

/**
 * Which compiler codes the installed compiler reports: each example must produce its own code.
 * @param {{ transform: Function }} compiler
 * @returns {Record<string, { implemented: boolean, autofix: boolean, suggestion: boolean }>} autofix: a safe edit; suggestion: an edit to review
 */
export function probe(compiler) {
  const out = {}
  for (const e of catalog) {
    if (e.by !== 'compiler') continue
    if (e.code === 'W000') { out[e.code] = { implemented: true, autofix: false, suggestion: false }; continue }
    if (!e.example) { out[e.code] = { implemented: false, autofix: false, suggestion: false }; continue }
    const { diagnostics } = compiler.transform(e.example, { filename: 'probe.tsx', checkOnly: true })
    const hit = diagnostics.find(d => d.code === e.code)
    out[e.code] = { implemented: Boolean(hit), autofix: hit?.fix?.safe === true, suggestion: Boolean(hit?.fix) && hit.fix.safe !== true }
  }
  return out
}
