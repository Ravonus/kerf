// The diagnostic catalog the agent layer knows about: PLAN §3.5 (W), §4.2 (W050–W056, T012), §7b (T001–T009,
// P001–P006), research 13 §4.4 (P100–P120), research 20 §6, §10 (H001–H008, H011–H016), PLAN §12 (H009, H010, partial hydration), research 23 §3 (D020–D025, style groups), research 36 (D001–D039, the design language),
// research 11 §8.5 and 15 §7.5 as built in research 26 §7 (Phase 2's X-codes, M001–M013), research 27 §6 (Q001–Q010,
// server functions, and S011), research 28 §7 (Q011–Q015, the database; A001–A004, auth; C001–C002, the contract),
// research 29 §7 (S001, S002, S012, S013, state on the server; F001–F003, forms; M016–M018, the media route), research
// 30 §8 (W052, W053, T013, R001–R023, realtime), research 36 §8 and 37 (R101–R109, Rust), plus the codes proposed in research 17 (marked `proposed`).
//
// W-codes come from the compiler. Each has an `example` that should trigger it; `probe()` runs the installed
// compiler over the examples, so AGENTS.md and `docs` only claim what this weft version actually reports. T-codes
// come from `weft check`'s test pass (tests.mjs); their examples are test files, checked the same way.

/** @typedef {{ code: string, severity: 'error' | 'warning' | 'info', catches: string, fix: string, by: 'compiler' | 'cli' | 'test' | 'gate' | 'start' | 'runtime' | 'plugin' | 'reserved', owner?: string, example?: string, proposed?: boolean }} Entry */

/** @type {Entry[]} */
export const catalog = [
  { code: 'W000', severity: 'error', by: 'compiler', catches: 'Syntax error; nothing else in the file is checked', fix: 'Fix the syntax error first' },
  {
    code: 'W001', severity: 'error', by: 'compiler',
    catches: 'A prop or `.value` used to compute something in the component body outside `derived`/`watch`/JSX/handlers (the body runs once). `const x = props.y` and destructuring only name the prop and stay live',
    fix: 'Wrap in `derived`, move into `watch`, or `untrack()` if a snapshot is intended',
    example: 'export function A({ items }: any) { const n = items.length + 1; return <p>{n}</p> }',
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
    catches: 'Identity-breaking `.map(p => ({ ...p, … }))` feeding a keyed list: every row re-runs on every change (in-file, and across files via props in `weft check`)',
    fix: 'Replace only the changed item (`p.id === id ? { ...p, price } : p`), or read the changing field live',
    example: "import { state } from 'weft'\nexport function A() { const xs = state([{ id: 'a', price: 1 }]); const push = (price: number) => { xs.value = xs.value.map(p => ({ ...p, price })) }; return <ul onClick={() => push(2)}>{xs.value.map(p => <li key={p.id}>{p.price}</li>)}</ul> }",
  },
  {
    code: 'W015', severity: 'error', by: 'compiler', catches: 'A box rendered without `.value` in JSX (a child, or a native attribute)', fix: 'Add `.value`',
    example: "import { state } from 'weft'\nexport function A() { const n = state(0); return <p>{n}</p> }",
  },
  {
    code: 'W017', severity: 'warning', by: 'compiler',
    catches: 'One entry of a whole object read per row (`cart[p.id]`, `cart.value[p.id]` in a keyed-list row or its props, `box.value[prop]` in a row component): every change re-runs every row',
    fix: 'Read the entry from the box: `cart.get(p.id)`; to a row component pass the box (`State<Cart>`) and read `.get(id)` there',
    example: "export function A({ xs, cart }: any) { return <ul>{xs.map((x: any) => <li key={x.id}>{cart[x.id]}</li>)}</ul> }",
  },
  {
    code: 'W018', severity: 'warning', by: 'compiler',
    catches: '`const x = untrack(() => …reactive…)` in a component body that only the JSX reads: it renders the setup-time value and never updates',
    fix: '`derived(() => …)` and render `x.value`; `untrack` only for a value meant to stay fixed',
    example: "import { untrack, type State } from 'weft'\nexport function A({ id, live }: { id: string; live: State<Record<string, number>> }) { const n = untrack(() => live.get(id)); return <p>{n}</p> }",
  },
  {
    code: 'W019', severity: 'error', by: 'compiler', catches: 'Unsupported row pattern', fix: 'Read from one item param',
    example: "export function L({ xs }) { return <ul>{xs.map(({ id, ...more }) => <li key={id}>{id}</li>)}</ul> }",
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
  { code: 'W044', severity: 'warning', by: 'cli', catches: 'A `key` read from `crypto.randomUUID()`, `Date.now()`, `Math.random()` or `performance.now()`: it differs between server and client, so the row is rebuilt on hydration and on every render. At runtime the same miss logs `a key differs between server and client`', fix: 'Key on a stable id from the data' },
  {
    code: 'W043', severity: 'warning', by: 'cli', catches: '`data-x={true}` or `data-x={false}` on a native element: `data-*` booleans are presence flags, so these write `data-x=""` or nothing, not React\'s `"true"` and `"false"`',
    fix: '`data-x` for a flag (`weft fix`), or `data-x="true"` for the word. CSS matches `[data-x]`',
  },
  {
    code: 'W050', severity: 'error', by: 'compiler',
    catches: 'Raw `addEventListener`, `setInterval`, `new WebSocket` or `new EventSource` in a component with no cleanup (it outlives the component)',
    fix: '`on(target, type, fn)` / `interval(ms, fn)` from weft/browser, or clean it up in `onCleanup`',
    example: "export function A() { window.addEventListener('keydown', () => {}); return <p /> }",
  },
  {
    code: 'W051', severity: 'error', by: 'compiler',
    catches: 'A weft/browser value, `on` or `interval` created outside an owner: module scope, a timer or promise callback, an event handler, after `await`',
    fix: "Create it in a component's (or `defineState`'s) setup, or inside `createRoot(dispose => …)`",
    example: "import { online } from 'weft/browser'\nexport const up = online()",
  },
  {
    code: 'W052', severity: 'error', by: 'compiler',
    catches: '`watch` folding a stream by hand',
    fix: '`fold` + `initial` where it is read: kept in the cache',
    example: "import { state, watch } from 'weft'\nimport { prices } from './server/prices'\nexport function A() { const tick = prices({}); const list = state([]); watch(() => tick.value, m => { list.value = [...list.value, m] }); return <p>{list.value.length}</p> }",
  },
  { code: 'W053', severity: 'error', by: 'start', catches: '`.live()` on a query with no `tags` (dev): no mutation can ever poke it', fix: 'Add `tags` to the query, and the same tag to the mutations that change it' },
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
    code: 'W060', severity: 'error', by: 'compiler', catches: "A `group()` from weft/style that can't be evaluated at build: a value that isn't a literal (named with its path), a `group()` outside a top-level `const`, or an accent that isn't literal tokens",
    fix: 'Inline the token name or literal; define groups as `export const x = group(\'x\', { … })`; raw CSS goes in `css: { … }`',
    example: "import { group } from 'weft/style'\nconst px = 13\nexport const g = group('g', { base: { pad: px } })",
  },
  {
    code: 'W061', severity: 'error', by: 'compiler', catches: '`bind:x` on a native element, or `bind:x`/`bind(box)` with something that isn\'t a box or that isn\'t a component prop',
    fix: 'Write `<Card bind:person={name} />`. A form element takes `value` and `onChange`',
    example: "import { bind, state } from 'weft'\nexport function A() { const n = state(1); return <input value={bind(n)} /> }",
  },

  // The design language (PLAN §6, research 36): tokens and layout where the app has warp's tokens, contrast and accessibility everywhere.
  { code: 'D001', severity: 'error', by: 'cli', catches: 'A raw colour in `style`, app CSS, or a Tailwind arbitrary or palette class, in an app with warp\'s tokens: it won\'t follow the theme, the dials or dark mode', fix: 'Use a colour token or a `tone`. No autofix: a token follows the theme, the raw value didn\'t' },
  { code: 'D002', severity: 'error', by: 'cli', catches: 'Spacing off the scale, or a scale step written by hand (`padding: 16px`, `p-[13px]`, `gap-3`)', fix: 'A step of `hair tight related group section page`; autofix when the value is exactly one' },
  { code: 'D003', severity: 'warning', by: 'cli', catches: 'Raw type, radius or shadow (`font-size`, `text-lg`, `rounded-[7px]`, `box-shadow`)', fix: '`<Heading role>` / `<Text role>`, the radius tokens, `--warp-elevation-*`; autofix for an exact radius' },
  { code: 'D004', severity: 'warning', by: 'cli', catches: 'Layout spelled out on an element (`display: flex`, `flex flex-col gap-4`) where a primitive says it', fix: '`<Stack>` or `<Row>`; a suggested edit when nothing else is on the element' },
  { code: 'D040', severity: 'warning', by: 'cli', catches: 'The style gate (`data-weft="styled"`) on the main content or a page heading: the first paint hides what it should show', fix: 'Mark the secondary part that needs its late styles, or drop the marker' },
  { code: 'D005', severity: 'warning', by: 'cli', catches: 'A native `<button>`, `<select>` or `<textarea>` in a warp app', fix: 'The warp component: focus ring, sweep, tones and touch target come with it' },
  { code: 'D006', severity: 'warning', by: 'cli', catches: 'One heading level at two roles across an app (`h1` as both `title` and `display`), or a bare `<hN>` beside `<Heading>`', fix: 'Drop `role`, or match the rest: `Heading` picks the role from `level`. A suggested edit at each site' },
  { code: 'D007', severity: 'warning', by: 'cli', catches: 'A bare `<a href>` in a warp app', fix: '`<Link>`, or `Shell`\'s `nav` for navigation (suggested edit)' },
  { code: 'D011', severity: 'error', by: 'cli', catches: 'A literal text and background colour pair on one element below 4.5:1', fix: 'Use tokens: they pass at every dial stop' },
  { code: 'D030', severity: 'error', by: 'cli', catches: 'An `<input>`, `<select>` or `<textarea>` with no label', fix: 'A wrapping `<label>`, `<label for>`, `aria-label`, or warp\'s `<Input label>`' },
  { code: 'D031', severity: 'error', by: 'cli', catches: 'A button or link with no accessible name (icon only, or empty)', fix: 'Text, or `aria-label`; warp\'s Button takes `label`' },
  { code: 'D032', severity: 'error', by: 'cli', catches: '`<img>` with no `alt`', fix: 'Describe the image; `alt=""` when it is decoration' },
  { code: 'D033', severity: 'error', by: 'cli', catches: '`onClick` on a non-interactive element with no role: mouse only', fix: 'A real `<button type="button">` (suggested edit)' },
  { code: 'D034', severity: 'error', by: 'cli', catches: 'A control inside a control (`<a><button>`)', fix: 'One control: move the other beside it' },
  { code: 'D035', severity: 'warning', by: 'cli', catches: 'A heading level that jumps (h1 to h3)', fix: 'Use the next level; `<Heading level role>` keeps the look apart from the outline' },
  { code: 'D036', severity: 'error', by: 'cli', catches: 'The focus ring removed with nothing in its place (`outline: none`, `outline-none`)', fix: 'Remove it: warp\'s `:focus-visible` is the ring. Or add a `focus-visible:` style' },
  { code: 'D037', severity: 'error', by: 'cli', catches: 'A positive `tabindex`', fix: '`0`, and the order follows the DOM (autofix)' },
  { code: 'D038', severity: 'warning', by: 'cli', catches: 'Two solid Buttons side by side', fix: 'One primary action per region: make the others `soft` or `ghost`' },
  { code: 'D039', severity: 'warning', by: 'cli', catches: '`<html>` with no `lang`', fix: 'Set `lang`' },

  // Style groups (research 23 §3). D010 is warp's contrast gate (its own plugin); D040 and D081 are reserved by warp's docs.
  {
    code: 'D020', severity: 'warning', by: 'cli', catches: 'Class soup: a static `class`/`className` with more than 8 classes, or the same class list (4+ classes) in two or more places',
    fix: "Extract a style group (`group('order-card', …)`, name suggested from the component) and spread it; `weft style find` first, one may already fit",
  },
  { code: 'D021', severity: 'warning', by: 'cli', catches: 'Two style groups resolve to 90% or more of the same CSS (`similar` in .weft/styles.json)', fix: 'Merge them into one group with an axis for what differs' },
  { code: 'D022', severity: 'info', by: 'cli', catches: 'The same accent (`accent: { … }` at a call site) on one group at 3 or more sites', fix: 'Promote it to an axis value and pass that value at those sites' },
  { code: 'D023', severity: 'warning', by: 'cli', catches: 'A `css: { … }` escape (raw CSS) in a style group', fix: 'Use the token the fix names; keep the escape only where no intent sets the property' },
  {
    code: 'D024', severity: 'error', by: 'compiler',
    catches: 'Styles that fight with no order: two group roots spread on one element; two compounds that can match at once and set one property differently, or an accent that sets what the site\'s own axis value sets (`weft check`)',
    fix: 'One group per element (nest an element, or make it an axis); exclusive compound `when`s; drop the accent or make it an axis value',
    example: "import { group } from 'weft/style'\nconst a = group('a', { base: { pad: 'group' } })\nconst b = group('b', { base: { gap: 'related' } })\nexport function X() { return <li {...a()} {...b()} /> }",
  },
  {
    code: 'D025', severity: 'error', by: 'compiler',
    catches: "Unknown name in a style group: an axis value, axis, state or part a call site uses that the group doesn't have, or an intent or token that isn't in the vocabulary (also a type error)",
    fix: 'Use one of the names listed (the closest come first); `weft style explain <group>` shows them all',
    example: "import { group } from 'weft/style'\nconst card = group('card', { axes: { status: { open: {}, late: {} } } })\nexport function X() { return <article {...card({ status: 'lost' })} /> }",
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
    code: 'T010', severity: 'error', by: 'gate', catches: 'A new or changed test passes on the code before the change (fail-before), so it does not test the change',
    fix: 'Assert what the change makes different; a test for existing behavior goes in its own change with no source edits',
  },
  {
    code: 'T011', severity: 'error', by: 'gate', catches: 'A new test kills none of the mutants of the changed lines: it would still pass if that code were wrong (a warning when the mutants were sampled)',
    fix: "Assert what the changed code computes; the gate's surviving mutants say what to check",
  },
  {
    code: 'T012', severity: 'error', by: 'test', catches: 'A test ends with weft/browser listeners, intervals or subscribed values still open (checked by weft/test after each test)',
    fix: 'Unmount what the test created (dispose any `createRoot`), or fix the leak',
  },

  {
    code: 'T013', severity: 'error', by: 'cli', catches: 'A real `WebSocket` or `EventSource` in a fast test',
    fix: 'Use the fake transport: `net.push`, `net.poke`, `net.drop`',
    example: "test('feed', () => { const socket = new WebSocket('ws://localhost/feed'); expect(socket).toBeTruthy() })",
  },
  {
    code: 'T020', severity: 'error', by: 'gate', catches: 'An existing test deleted, skipped, marked `.fails`, or with an assertion removed or loosened (`toBe(3)` → `toBeTruthy()`)',
    fix: 'Restore it, or keep the change with `// weft-allow T020: <reason>` on that test',
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

  // Metadata and share cards (research 20 §6; H for head, M is media). `start`: reported by @weft/start at request or
  // render time, and by `weft routes --meta` for every route.
  { code: 'H009', severity: 'error', by: 'runtime', catches: 'A prop of an island is something JSON can\'t carry (a function, a Date, a class instance), found as the server renders', fix: 'Pass plain data, or put `/* @weft client */` on the component that renders it' },
  { code: 'H010', severity: 'info', by: 'cli', catches: 'An island has to load with the page for a reason its code could avoid: work that reaches past it, a module that runs as it loads, a box at module level, code the compiler can\'t see into. `.weft/hydration.json` says why for every island', fix: '`/* @weft visible */` above the component when its work only matters on screen; otherwise the fix the diagnostic names' },
  { code: 'H001', severity: 'warning', by: 'cli', catches: 'No `site.url`: a build has no absolute canonical, og:url or og:image, and a server takes them from the request\'s Host header', fix: 'Set `site.url`, or `WEFT_SITE_URL` in the deploy environment' },
  { code: 'H002', severity: 'error', by: 'cli', catches: 'Param route with an `auto` image on a static-only preset and no `prerender` (`weft routes --meta --preset static`)', fix: 'Export `prerender`, or set `og.image`' },
  { code: 'H003', severity: 'warning', by: 'cli', catches: 'No description after merging the config, layouts and route (`weft check`, per route and on `site`)', fix: 'Set `site.description` (or the route\'s `meta.description`)' },
  { code: 'H004', severity: 'warning', by: 'cli', catches: 'Title over 60 characters or description over 160 (search results and cards cut them)', fix: 'Shorten it' },
  { code: 'H011', severity: 'warning', by: 'cli', catches: 'A page sets no `meta`, or leaves out its title or description: they come from what it renders (its `h1`, its first paragraph) or the site default', fix: 'Add `meta` when you build the page, in words written for it; the diagnostic carries a starting point' },
  { code: 'H012', severity: 'warning', by: 'cli', catches: 'Two routes have the same title', fix: 'Give each page a title from what is on it' },
  { code: 'H013', severity: 'warning', by: 'cli', catches: 'Two routes have the same description, usually the site default', fix: 'Give each page a description from what is on it' },
  { code: 'H014', severity: 'warning', by: 'cli', catches: 'A param route whose `meta` ignores `data` and `params`, or whose real pages all have the same title or description', fix: 'Build `meta` from `data` and `params`: `({ data }) => ({ title: data.name, description: data.summary })`' },
  { code: 'H015', severity: 'warning', by: 'cli', catches: 'A written description that reads like code, a markdown fragment or a cut-off sentence', fix: 'Write one plain sentence. Never slice raw markdown or code into `description`' },
  { code: 'H016', severity: 'info', by: 'cli', catches: 'A route `weft check` couldn\'t fully check: it failed here, or a param route with no page to sample', fix: 'Export `prerender`, or link to a page of it; `check: { routes: false }` turns the route pass off' },
  { code: 'H005', severity: 'error', by: 'start', catches: '`.og.tsx` uses a style or element the card renderer does not support (an error in dev; production drops the declaration)', fix: 'Use flexbox, text, images, borders, radius, gradients, shadows' },
  { code: 'H006', severity: 'error', by: 'cli', catches: '`meta` reads a box or calls a hook (metadata is plain data); found statically by `weft check`', fix: 'Compute it from `params` and `data`' },
  { code: 'H007', severity: 'error', by: 'start', catches: '`meta` (or a card) reads a deferred (streamed) field of the loader\'s data: the request fails with 500 instead of a page with missing tags', fix: 'Await the field in `load`, or leave it out of `meta`' },
  { code: 'H008', severity: 'warning', by: 'start', catches: 'A card\'s `<img>` didn\'t load (timeout, HTTP error, not an image, too large, host not allowed); the card renders without it', fix: 'Fix the URL, or embed the image with an import' },

  // Server functions and the query cache (research 27 §6; Q for query). `start`: reported by @weft/start while serving
  // (the server log, and the error the call rejects with); `runtime`: thrown or warned by the client runtime.
  { code: 'Q001', severity: 'error', by: 'runtime', catches: '`q()` (a live query, a Resource) called with no owner: in `load`, a handler, a timer or module scope', fix: '`await q.fetch(input)` there; `q()` in components and defineState scopes' },
  { code: 'Q002', severity: 'error', by: 'start', catches: 'A query\'s or mutation\'s input failed its schema (400, with the issues and their paths)', fix: 'Pass what the schema accepts' },
  { code: 'Q003', severity: 'error', by: 'start', catches: '`query`/`mutation` defined outside a server module: its `run` and imports would ship to the client (the build fails)', fix: 'Move it to `src/server/**` or a `*.server.ts` file' },
  { code: 'Q004', severity: 'error', by: 'start', catches: 'A mutation called while the server handles a GET (`load`, a page render, a query\'s `run`)', fix: 'Call it from a handler or another mutation; reads go in queries' },
  { code: 'Q005', severity: 'warning', by: 'start', catches: 'A server function\'s result doesn\'t survive JSON (`Date`, `Map`, `Set`, a class, `undefined` in an array, a function, `NaN`): the client sees another value', fix: 'Send plain data (ISO strings, arrays, objects)' },
  { code: 'Q006', severity: 'error', by: 'start', catches: 'A cached (`cache: { life }`) query reads `ctx.request`, `ctx.response` or `ctx.user`: its value is shared by every user', fix: 'Drop `cache`, or pass the value as input' },
  { code: 'Q007', severity: 'error', by: 'start', catches: '`redirect()` after the page started streaming (a component\'s query): the status is already sent', fix: 'Call the query in the route\'s `load`, which runs before the first byte' },
  { code: 'Q008', severity: 'warning', by: 'start', catches: 'A mutation `invalidates` a tag no query declares (`todo:*` covers `todo:${id}`): nothing refreshes', fix: 'Fix the tag name, or add it to the query\'s `tags`' },
  { code: 'Q009', severity: 'error', by: 'start', catches: '`/_weft/fn/<id>` names no function: the page is older than the server, or the module isn\'t a server module', fix: 'Reload; keep `query`/`mutation` exports in server modules' },
  { code: 'Q010', severity: 'error', by: 'start', catches: 'A mutation request without the CSRF proof (POST, JSON, `x-weft: 1`, same origin): 403', fix: 'Call mutations through their stub, not a hand-made `fetch` or form' },
  { code: 'S011', severity: 'warning', by: 'runtime', catches: '`mutation({ optimistic })` updated a query its invalidated tags didn\'t cover: the prediction has no fresh value to land on (held until a refetch)', fix: 'Add one of the query\'s tags to `invalidates`' },
  { code: 'S001', severity: 'error', by: 'cli', catches: 'A server object or array (`q().value`, `await q.fetch()`, or a map, filter or spread of one) copied into `state`: it goes stale and its rows lose their identity', fix: 'Reference the query and `derived` from it; store ids; `state.linked` for edits, `untrack` for a deliberate snapshot' },
  { code: 'S002', severity: 'error', by: 'runtime', catches: 'A `defineState` scope reached on the server outside a render (module scope, `load`, a server function, a timer): it would be shared by every request', fix: 'Read it in a component, a handler or a `derived`; pass values into server code as arguments' },
  { code: 'S012', severity: 'warning', by: 'cli', catches: '`state.linked` over a query value with no `key`: a refetch resets what someone is typing', fix: 'Add `{ key: () => source.value?.id }`' },
  { code: 'S013', severity: 'warning', by: 'runtime', catches: 'A `local` or `session` persisted box read in a server render: the page shows `init`, then flashes to the stored value', fix: '`persist: { in: \'cookie\' }` if it\'s small, or render it client-only' },
  { code: 'F001', severity: 'error', by: 'runtime', catches: '`<Form of>` was given something that isn\'t a mutation', fix: '`<Form of={addTodo}>`, with `addTodo` a `mutation()` export of a server module' },
  { code: 'F002', severity: 'error', by: 'start', catches: 'A form POST without the same-origin proof (`Origin`, or `Sec-Fetch-Site: same-origin`): 403', fix: 'Submit through a `<Form>` on the same origin; behind a proxy, forward the host so the origins match' },
  { code: 'F003', severity: 'error', by: 'start', catches: 'A form POST naming no known mutation: the page is older than the server', fix: 'Reload; keep `mutation` exports in server modules' },
  { code: 'Q011', severity: 'warning', by: 'start', catches: 'A function read or wrote a table its `tags`/`invalidates` don\'t name (dev): a mutation of that table won\'t refresh it', fix: 'Add the table\'s name (or `table:…`) to `tags`/`invalidates`' },
  { code: 'Q012', severity: 'error', by: 'start', catches: '`@weft/start/db*` or `@weft/start/auth` reached the client graph', fix: 'Import it from a server module (`src/server/**`, `*.server.ts`) or a route\'s `load`' },
  { code: 'Q013', severity: 'error', by: 'start', catches: 'A database URL the driver can\'t open (a `postgres://` URL given to the SQLite entry, or the reverse)', fix: 'Use the matching `createDb`: `@weft/start/db/sqlite` or `@weft/start/db/postgres`' },
  { code: 'Q014', severity: 'error', by: 'start', catches: 'The database doesn\'t match the schema: a table or column is missing', fix: 'Run `weft db generate`, then reload (new migrations apply on the next request)' },
  { code: 'I001', severity: 'error', by: 'cli', catches: '`<Icon name="as">`, or `Icons.As`, where no such icon exists', fix: 'Use the name it suggests. `weft docs icons` has the set; an editor completes it from the type.' },
  { code: 'I002', severity: 'info', by: 'cli', catches: 'An icon name only known at runtime, so that use loads the pack', fix: 'Nothing to do if the name comes from data. To fetch single icons instead, set `icons({ source })`. A list of literals, or a map over one, ships only those.' },
  { code: 'I003', severity: 'info', by: 'cli', catches: 'The icon pack used as a value, so all of it ships with the page', fix: 'Use `Icons.X`, or `Icons[name]`, which loads lazily.' },
  { code: 'Q015', severity: 'warning', by: 'cli', catches: '`src/db/schema.ts` changed since the last `weft db generate`', fix: 'Run `weft db generate`' },
  { code: 'Q016', severity: 'error', by: 'start', catches: 'A request used the database while it was down, or a migration it needs failed (503; the server log has the driver\'s error). Pages that run no statements still serve', fix: 'Start the database and check `DATABASE_URL`, or fix the migration: the next statement tries again' },
  { code: 'A001', severity: 'error', by: 'start', catches: 'The auth secret is missing or under 32 characters on a production server', fix: 'Set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) in the server\'s environment' },
  { code: 'A002', severity: 'error', by: 'start', catches: 'A function with `auth: \'user\'` was called with no session (401)', fix: 'Sign in first, or guard the route with `redirect()` in its `load`' },
  { code: 'A003', severity: 'error', by: 'start', catches: '`auth: \'user\'`, but `ctx` has no `user`: the context file never asked for the session', fix: 'Spread `session(auth, request)` into what `src/context.server.ts` returns' },
  { code: 'A004', severity: 'warning', by: 'start', catches: 'A mutation changed the session cookie without a redirect: the tab keeps what the last session cached', fix: '`redirect()` after it: that\'s a full load, which drops the client cache' },
  { code: 'A005', severity: 'error', by: 'start', catches: 'The database provider has no Better Auth adapter', fix: 'Pass `options.database` to `createAuth`, or use a provider that has one' },
  { code: 'C001', severity: 'warning', by: 'cli', catches: 'A function\'s `input` or `output` schema can\'t become JSON Schema: the contract says `{}`', fix: 'Use a schema with JSON Schema support (Zod 4 has it), or drop what can\'t be represented' },
  { code: 'C002', severity: 'error', by: 'start', catches: 'A function\'s value failed its `output` schema (dev and tests)', fix: 'Fix `run`, or the schema' },

  // Realtime (research 30 §8, research 32 §8; R for realtime).
  { code: 'R001', severity: 'error', by: 'start', catches: '`channel` or `sharedState` without `authorize` (`weft check`, `weft build`, and thrown at definition)', fix: 'Add it (`() => true` must be written explicitly)' },
  { code: 'R002', severity: 'error', by: 'cli', catches: 'The memory bus on a multi-instance preset, or `durableObjectBus` outside `cloudflare_durable` (`weft build` fails): a message reaches one instance\'s clients', fix: "`weft add redis` or `weft add nats`, or `realtime({ bus: postgresBus({ url }) })` in `src/realtime.server.ts`" },
  { code: 'R003', severity: 'warning', by: 'start', catches: 'A mutation wrote a table a live query reads, and their tags don\'t intersect (dev): open pages won\'t update', fix: 'Add one of the query\'s tags to `invalidates`' },
  { code: 'R004', severity: 'error', by: 'start', catches: 'A wildcard in `realtime({ origins })`, or a hand-written WebSocket handler (`crossws`, `defineWebSocketHandler`) that skips the Origin check: any site could join with a visitor\'s cookies', fix: 'List the origins, scheme and port included; use `channel`' },
  { code: 'R005', severity: 'warning', by: 'cli', catches: 'A stream\'s `input`, a channel\'s `params` or client messages, or a shared key or value has an unbounded string or array (`weft build`): a client decides how much the server holds', fix: 'Add `.max()`' },
  { code: 'R006', severity: 'warning', by: 'start', catches: 'A stream\'s `run` read the database before it subscribed to a topic (dev): what\'s published in between is lost', fix: 'Call `topic.subscribe()` first, or pass `after`' },
  { code: 'R007', severity: 'warning', by: 'cli', catches: '`ws`, `socket.io-client`, `reconnecting-websocket` or `@microsoft/fetch-event-source` in dependencies: weft owns the connection', fix: 'Use `stream`, `.live()` or `channel`' },
  { code: 'R008', severity: 'error', by: 'start', catches: 'A message over 1 MiB, a request or socket frame over 64 KiB, or a client over the channel rate limit (20 messages a second)', fix: 'Send less, or an id the client fetches; `limits` raises it' },
  { code: 'R009', severity: 'error', by: 'start', catches: 'Over 100 subscriptions or joins on a connection, or 10 connections or sockets for a user', fix: 'Read fewer keys; `limits` raises it' },
  { code: 'R010', severity: 'error', by: 'start', catches: 'An origin that isn\'t the app\'s own or in `realtime({ origins })` tried to open a connection', fix: 'List it, scheme and port included' },
  { code: 'R011', severity: 'error', by: 'start', catches: 'A channel\'s `authorize` refused a join or a write (the status is `unauthorized`), at the join or a session re-check', fix: 'Sign in, or check `authorize`' },
  { code: 'R012', severity: 'warning', by: 'start', catches: 'A live query reads a table `changes` reports and no tag names it, or a table `changes` doesn\'t list (dev): writes from outside the app won\'t refresh it', fix: 'Add the table\'s name to `tags`, or the table to `dbChanges`' },
  { code: 'R013', severity: 'error', by: 'cli', catches: 'A query marked `live: { required: true }` on a target that can\'t deliver a change feed: a functions preset with no external listener, or no `changes` at all (`weft check`, `weft build`, `weft doctor`)', fix: 'Run `weft db listen` on an always-on host and set `listener: \'external\'`, deploy to a server preset, add `changes: dbChanges(db, [tables])`, or drop `required`' },
  { code: 'R014', severity: 'warning', by: 'cli', catches: '`changes` on a preset with no long-running process: writes from outside the app won\'t reach `.live()`, which shows `degraded`', fix: 'Run `weft db listen` on an always-on host and set `listener: \'external\'`, or deploy to a server preset' },
  { code: 'R015', severity: 'error', by: 'start', catches: 'A required live query, and the server\'s startup probe found no real change feed (a pooler, no trigger, no trigger permission, a Mongo without a replica set): the server stops rather than serve stale data, and dev answers 503', fix: 'What the error names: `dbChanges(db, tables, { listenUrl })` for a direct connection, `weft db live` for triggers' },
  { code: 'R016', severity: 'warning', by: 'start', catches: 'The server settled on a degraded live mode (`poll` or `off`), or a working feed went down: `.live()` shows `degraded` or `reconnecting`', fix: 'What the log line names; `weft doctor` lists the options' },
  { code: 'R017', severity: 'error', by: 'start', catches: '`dbChanges` on a client it can\'t watch or something that isn\'t a table, or `weft db listen` on the memory bus, which stops at that process', fix: 'Use a client from `@weft/start/db/*` or `mongoChanges`; set `bus` in `src/realtime.server.ts`' },
  { code: 'R019', severity: 'error', by: 'cli', catches: 'A query\'s `live: { verify }` round trip failed against its target (`weft check`, `weft build`): the message names the link that broke, from `trigger` to `cleanup`', fix: 'What the link says: `weft db live` for a trigger, the app\'s log for a poke, `verify.row` for a row the query can\'t see' },
  { code: 'R020', severity: 'error', by: 'cli', catches: 'A connection string with a password in source, in a `verify` or a target: it would be committed', fix: 'Read it from the environment: `verify: { db: process.env.STAGING_DATABASE_URL }`' },
  { code: 'R021', severity: 'error', by: 'cli', catches: 'A `verify` target isn\'t available here: fails `weft build`, and `weft check` warns and skips', fix: 'Set `WEFT_STAGING_URL`, `STAGING_DATABASE_URL`, or the variable its target names' },
  { code: 'R022', severity: 'error', by: 'cli', catches: 'A `verify` target that looks like production, or that nothing marks as not: a round trip writes rows', fix: 'Name it in `live.targets` with `production: false`; a name or host that says production is always refused' },
  { code: 'R023', severity: 'warning', by: 'cli', catches: 'A `verify` passed with only one kind of target, so some links went untested', fix: 'Give it both a URL and a database' },
  { code: 'R018', severity: 'warning', by: 'cli', catches: 'A table in `changes` that no migration gives a change trigger (`weft check`, `weft build`): the server would fall back to polling', fix: 'Run `weft db live`' },
  { code: 'R101', severity: 'error', by: 'cli', catches: 'A function with `impl` has no `output`, a type JSON can\'t carry (`z.date()`, `z.bigint()`, `z.void()`, `z.custom()`), or a one-way `.transform()` on its input (`weft build`, `weft check`, `weft dev`)', fix: 'Use a codec: `z.codec(z.iso.datetime(), z.date(), { decode, encode })`. `z.null()` says a function returns nothing' },
  { code: 'R102', severity: 'error', by: 'cli', catches: 'A plain `z.union` of objects in a function with `impl`: it has no tag, so Rust can\'t tell its arms apart reliably. Scalar unions and `.nullable()` are fine', fix: "Use `z.discriminatedUnion`, or set `rust: { unions: 'allow' }`" },
  { code: 'R103', severity: 'error', by: 'cli', catches: 'A sidecar doesn\'t match the contract: cargo stops where a generated type or method no longer fits (with the function\'s id), a binary built from another contract, an output the `output` schema rejects, or input serde refuses', fix: 'Fix the Rust to fit the TS declaration, which is the source of truth; `.weft/rust/<service>.rs` shows what\'s generated' },
  { code: 'R104', severity: 'error', by: 'cli', catches: '`native()` on a preset that can\'t run it (no file system for an addon or a `.wasm`), on a preset with no WASM when `wasm: false` is set, or a `.wasm` that won\'t build (a warning on a preset the addon runs on). At run time, a build with neither for this platform (503)', fix: 'Use `remote(\'rust://<name>\')`, the same crate behind `weft::router`. `rustup target add wasm32-unknown-unknown`, or `rust.services.<name>.wasm: false` if nothing needs a fallback' },
  { code: 'R105', severity: 'warning', by: 'cli', catches: 'A cached Rust query with `tags` that reports no table (`weft check` reads the method; `weft dev` sees the call): Q011 can\'t see into Rust, so nothing checks that the tags cover what it reads', fix: 'Call `ctx.touch("table")` in the Rust, or drop `tags` from a query that reads no table' },
  { code: 'R106', severity: 'error', by: 'start', catches: 'A `remote()` call can\'t be made: no address, no `WEFT_RUST_SECRET`, or the sidecar refused the signature (503)', fix: 'Set `WEFT_RUST_<NAME>_URL` and the same `WEFT_RUST_SECRET` on both sides. `weft dev` and `weft start` do it for what they supervise' },
  { code: 'R107', severity: 'error', by: 'start', catches: 'A sidecar didn\'t answer, or ran past the deadline (503, 504). Only that function fails', fix: 'Check that it\'s running, or raise `timeout` on `remote()`' },
  { code: 'R108', severity: 'error', by: 'start', catches: 'A sidecar function panicked or returned an undeclared error (500). The detail stays in the sidecar\'s log, under the request id', fix: 'Find the request id in the sidecar\'s log, or declare the failure in `errors`' },
  { code: 'R109', severity: 'error', by: 'cli', catches: 'A sidecar doesn\'t build for a reason no contract function explains: a compile error, no crate, or no `cargo`', fix: 'Fix the crate, point `rust.services.<name>.crate` at it, or set `external: true` for one built elsewhere' },

  // Text, type and skeletons (research 11 §8.5; research 26 §7; research 31 §7). `cli`: weft check (text-checks.mjs).
  { code: 'X001', severity: 'warning', by: 'runtime', catches: '`s.text()` predicted one height and its DOM mirror renders another: `font`, `lineHeight` or `width` differs from the CSS', fix: 'Drop `font` and `lineHeight` so they come from CSS, or make them match; the message names the values' },
  { code: 'X002', severity: 'warning', by: 'cli', catches: '`system-ui`, `-apple-system` or a generic-only family on a measured `s.text()`: canvas and CSS can resolve it differently (also checked in dev, for fonts that come from CSS)', fix: 'Name a family' },
  { code: 'X003', severity: 'warning', by: 'runtime', catches: '`s.text()` prepared while its font isn\'t loaded and no `"<Family> Fallback"` face exists: it\'s measured on another font until the swap', fix: 'Declare the font in `text({ fonts })`, which generates the fallback' },
  { code: 'X004', severity: 'warning', by: 'runtime', catches: 'A surface text mirror uses a style line breaking can\'t predict: `text-wrap: balance|pretty`, `hyphens: auto`, `word-spacing`, `letter-spacing`, `font-feature-settings`, `font-variant-numeric`, `font-variation-settings`', fix: 'Drop the style, or pass `exact: false`' },
  { code: 'X005', severity: 'error', by: 'cli', catches: '`font-size` in `vw`/`vi`/`cqi`/`cqw` with no `rem` term: zoom and the user\'s font size don\'t change it (WCAG 1.4.4)', fix: '`clamp(rem, rem + cqi, rem)`; the suggestion keeps the same sizes at 375 and 1280 px' },
  { code: 'X006', severity: 'error', by: 'cli', catches: 'A fluid `clamp()` font size whose max/min is over 2.5: 200% zoom no longer doubles it', fix: 'Narrow the range (raise the minimum or lower the maximum)' },
  { code: 'X008', severity: 'error', by: 'cli', catches: 'Viewport meta with `user-scalable=no` or `maximum-scale` under 2: blocks pinch zoom', fix: 'Remove them (autofix)' },
  { code: 'X009', severity: 'error', by: 'cli', catches: '`<Surface>` with neither `label` nor `decorative`: a screen reader finds an unnamed image', fix: 'Add `label`, or `decorative` if it shows nothing a reader needs' },
  { code: 'X010', severity: 'error', by: 'cli', catches: '`fillText` or `strokeText` in a surface: text only the canvas knows, with no selection, find, translation or screen reader', fix: 'Use `s.text()`, or wrap it in `s.decorative()` if it is truly decoration' },
  { code: 'X011', severity: 'error', by: 'cli', catches: 'A surface text mirror hidden from assistive tech: `aria-hidden` on `<Surface>` or `s.el`, or `display: none`/`visibility: hidden` on `[data-surface-text]` (also checked in dev)', fix: 'Leave the mirror to weft; use `decorative` for a surface with nothing to read' },
  { code: 'X012', severity: 'error', by: 'cli', catches: 'CSS that defeats a surface\'s text fallback: `forced-color-adjust: none`, or a print rule hiding `[data-surface-text]`', fix: 'Remove it: the mirror is what forced-colours mode and print show' },
  { code: 'X020', severity: 'warning', by: 'cli', catches: 'A hand-written `@font-face` for a local file with no `"<Family> Fallback"` face: the font swap shifts layout', fix: 'Declare the font in `text({ fonts })` (@weft/plugin-text), which generates a metric-matched fallback' },
  { code: 'X021', severity: 'error', by: 'cli', catches: '`font-display: block` or `auto`: text is invisible while the font loads', fix: '`swap` (autofix), or `optional` for faces that may skip' },
  { code: 'X022', severity: 'warning', by: 'cli', catches: 'A local `@font-face` without `unicode-range` (not subset), or the font build\'s preloads over the 100 KB budget', fix: '`text({ fonts })` subsets every face; preload fewer faces' },
  { code: 'X023', severity: 'warning', by: 'cli', catches: 'A `<link rel="preload" as="font">` whose file no `@font-face` uses', fix: 'Remove the preload' },
  { code: 'X030', severity: 'error', by: 'cli', catches: '`<img>`, `<video>` or `<iframe>` without `width`/`height` or `aspect-ratio` inside a `<Boundary>`: it lands at 0 px and pushes content down', fix: '`<Media src={x}>` with a `?media` import (it always has dimensions), or set `width` and `height`' },
  { code: 'X031', severity: 'warning', by: 'runtime', catches: 'A `pending` fallback whose box differs from the content\'s by more than 1 px at the swap (measured by `<Boundary>` in dev)', fix: 'Size the fallback like the content: warp\'s `<Shape>` with the content\'s counts' },
  { code: 'X032', severity: 'warning', by: 'runtime', catches: 'A skeleton repeats a list with no count hint: no `limit` input, no `.max()` on the array, nothing seen yet. It shows 5 rows, so the swap can shift', fix: 'Add a `limit` input or `.max()` to the array in `output`' },
  { code: 'X033', severity: 'warning', by: 'cli', catches: '`x.pending` renders a skeleton or spinner with no check that `x` has no value: every refetch flashes it', fix: 'Let `<Boundary>` show first loads, and test `x.value === undefined` here. A refetch keeps the old value in place' },
  { code: 'X034', severity: 'error', by: 'cli', catches: 'A `pending` fallback with its own `setTimeout`/`setInterval`: `<Boundary>` already owns the 150 ms / 400 ms timing', fix: 'Remove the timers from the fallback' },
  { code: 'X040', severity: 'warning', by: 'cli', catches: 'Per-grapheme DOM spans over a string known to exceed 200 graphemes', fix: 'Use word-level motion or a Surface' },
  { code: 'X041', severity: 'warning', by: 'cli', catches: 'Per-character spans without `aria-hidden`, or a parent with no accessible name: a screen reader spells the word out', fix: '`aria-hidden` on each span and `aria-label` with the whole text on the parent' },

  // Media (research 15 §7.5, static rules in research 26 §2.5): reported by @weft/plugin-media's check hook.
  { code: 'X035', severity: 'warning', by: 'cli', catches: 'Streamed text written straight into a scroll container: a reflowing tail moves the lines above it', fix: 'Render it with `<Text stream>` from weft/text: the height only grows' },
  { code: 'X036', severity: 'warning', by: 'runtime', catches: 'A skeleton shows a string from `output` with no length hint, so its bar is a guess', fix: 'Add `.max()`, `.length()` or `.meta({ example })` to the schema, or an example in the query\'s `shape`' },

  { code: 'M001', severity: 'error', by: 'plugin', owner: '@weft/plugin-media', catches: 'Raw `<img>`/`<video>` without `width`/`height` or `aspect-ratio`, outside a `<Boundary>` (inside it is X030)', fix: 'Insert the intrinsic `width`/`height` (autofix for an imported file), or use `<Media>`' },
  { code: 'M002', severity: 'error', by: 'plugin', owner: '@weft/plugin-media', catches: 'An image rendered through a `?url` import or a string path, bypassing the optimizer', fix: '`import x from \'./x.jpg?media\'` and `<Media src={x} alt="…" />`' },
  { code: 'M003', severity: 'warning', by: 'plugin', owner: '@weft/plugin-media', catches: 'A raw `<img>` whose file is wider than its `width` × 2 (DPR) × 1.25: bytes nobody sees', fix: '`<Media>`, which resizes' },
  { code: 'M004', severity: 'warning', by: 'plugin', owner: '@weft/plugin-media', catches: 'A GIF over 256 KB rendered raw', fix: '`<Media>` with `mediaFfmpeg()` in `plugins`, which turns GIFs into video when that saves 15%' },
  { code: 'M005', severity: 'error', by: 'plugin', owner: '@weft/plugin-media', catches: '`<video autoplay>` without `muted`: browsers block it, and sound before a gesture is hostile', fix: 'Add `muted` (autofix)' },
  { code: 'M006', severity: 'warning', by: 'plugin', owner: '@weft/plugin-media', catches: '`<video>` without `poster`: a blank box until the first frame decodes', fix: 'Add a `poster` image' },
  { code: 'M007', severity: 'error', by: 'plugin', owner: '@weft/plugin-media', catches: 'Missing `alt` on `<Media>`/`<img>`, `<Media alt="">` without `decorative`, or `alt` equal to the file name', fix: 'Describe what the image shows; `alt="" decorative` for purely visual media' },
  { code: 'M008', severity: 'warning', by: 'plugin', owner: '@weft/plugin-media', catches: 'A route\'s first media is `loading="lazy"`, or `priority` media is lazy: the likely LCP image loads late', fix: 'Mark the hero `priority` and drop `loading="lazy"`' },
  { code: 'M009', severity: 'warning', by: 'plugin', owner: '@weft/plugin-media', catches: '`priority` on more than 2 media in one route: they compete for the first bytes', fix: 'Keep `priority` on the one hero image' },
  { code: 'M010', severity: 'warning', by: 'plugin', owner: '@weft/plugin-media', catches: 'A `priority` `<Media>` without `width` or `sizes`: eager images can\'t use `sizes="auto"`, so the browser assumes 100vw', fix: 'Pass `width="1/2"` (a viewport fraction or CSS length) or `sizes`' },
  { code: 'M011', severity: 'warning', by: 'plugin', owner: '@weft/plugin-media', catches: '`<video autoplay loop>` without `controls`, or a GIF in a raw `<img>`: endless motion with no pause (WCAG 2.2.2)', fix: '`<Media>` (pause control, poster under reduced motion), or add `controls`' },
  { code: 'M012', severity: 'error', by: 'plugin', owner: '@weft/plugin-media', catches: 'An SVG with `<script>`, `foreignObject`, `on*=` handlers or external references, used as an image', fix: 'Sanitise the file; the build refuses to optimise it' },
  { code: 'M013', severity: 'warning', by: 'plugin', owner: '@weft/plugin-media', catches: 'A file in `public/` referenced by string: untracked, unoptimised, no dimensions', fix: 'Move it next to the code and `import x from \'./x.jpg?media\'`' },
  { code: 'M014', severity: 'info', by: 'plugin', owner: '@weft/plugin-media', catches: "What `encoder: 'compatible'` adds to the build for compatible copies", fix: 'Nothing: it says what the toggle costs' },
  { code: 'M015', severity: 'warning', by: 'plugin', owner: '@weft/plugin-media', catches: 'An HDR or over-8-bit video that comes out 8-bit SDR', fix: 'Convert the source on purpose, or accept the flattening' },
  { code: 'M016', severity: 'warning', by: 'plugin', owner: '@weft/plugin-media', catches: '`<Media src>` given a string: nothing knows its size before it loads, so the page shifts', fix: 'Import it with `?media`, or store what `ctx.media.ingest` returns and type the field `z.media()`' },
  { code: 'M017', severity: 'error', by: 'start', catches: '`ctx.media` or a `/_weft/m/` URL used with no `media.server` provider', fix: 'Add `media()` from `@weft/plugin-media` to `plugins` in weft.config.ts' },
  { code: 'M019', severity: 'error', by: 'plugin', owner: '@weft/plugin-media-ffmpeg', catches: 'ffmpeg did not run, is not the pinned binary, or has no encoder for a codec', fix: 'Install ffmpeg, or give `mediaFfmpeg({ binary })` its path' },
  { code: 'M018', severity: 'error', by: 'start', catches: 'An upload refused: it isn\'t an image weft can read, or it\'s over the size limit (422)', fix: 'Raise `media({ server: { maxBytes } })`, or check the file on the client first' },

  { code: 'P010', severity: 'error', by: 'cli', catches: 'More than one weft.config file', fix: 'Keep one: `.ts`, `.json` or `.yaml`' },
  { code: 'P100', severity: 'error', by: 'cli', catches: 'Two providers for a `one` slot (or the same key in a `keyed` slot)', fix: 'Remove one, or name the winner in `slots: {}`' },
  { code: 'P101', severity: 'error', by: 'cli', catches: 'A slot consumer is used but nothing provides it', fix: 'Add the plugin, or set the option that disables it back' },
  { code: 'P102', severity: 'error', by: 'reserved', catches: 'Provider implements no slot interface version this weft supports (P102w: bound through an adapter)', fix: 'Upgrade the plugin or weft' },
  { code: 'P103', severity: 'error', by: 'reserved', catches: "Plugin's `weft` peer range doesn't include the installed weft", fix: 'Upgrade either side' },
  { code: 'P104', severity: 'error', by: 'reserved', catches: '`requires` names a slot that nothing provides', fix: 'Add a provider' },
  { code: 'P105', severity: 'error', by: 'reserved', catches: 'Cycle in `order.before`/`after`', fix: 'Remove one edge' },
  { code: 'P106', severity: 'error', by: 'reserved', catches: "Two plugins' `transform` filters matched one module with no declared order", fix: 'Add `order.after` to one' },
  { code: 'P107', severity: 'error', by: 'reserved', catches: 'Unfiltered `resolveId`/`load`/`transform`, or a `config` hook', fix: 'Add `filter`; move config to data' },
  { code: 'P108', severity: 'warning', by: 'reserved', catches: 'Plugin over its HMR budget share', fix: 'Narrow filters, cache, or move work to `check`' },
  { code: 'P109', severity: 'error', by: 'cli', catches: 'Undeclared permission used, or permissions widened since the lock', fix: 'Declare it, then `weft plugins approve`' },
  { code: 'P110', severity: 'error', by: 'cli', catches: 'Installed plugin integrity differs from `.weft/plugins.lock.json`', fix: 'Reinstall, or approve the update' },
  { code: 'P111', severity: 'error', by: 'cli', catches: "Diagnostic code outside the plugin's namespace, or a namespace collision", fix: 'Use `<short-name>/<CODE>`' },
  { code: 'P112', severity: 'error', by: 'cli', catches: 'Plugin AGENTS section over 1 KB', fix: 'Shorten; move detail to the MCP `docs` tool' },
  { code: 'P113', severity: 'error', by: 'cli', catches: 'Token, catalog, compiler-data or Vite-config key collision', fix: 'Rename in the namespace' },
  { code: 'P114', severity: 'error', by: 'reserved', catches: 'Provider runtime code in an entry chunk (eager import)', fix: "Reach it only through the slot's `load()`" },
  { code: 'P115', severity: 'error', by: 'cli', catches: 'Invalid plugin options (Zod path given)', fix: 'Fix the option' },
  { code: 'P116', severity: 'error', by: 'cli', catches: 'Same plugin twice, or `name`/`version` does not match `package.json`', fix: 'Remove the duplicate' },
  { code: 'P117', severity: 'error', by: 'cli', catches: '`contribute()` is not pure', fix: 'Move IO to a build-side provider' },
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
