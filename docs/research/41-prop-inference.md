# 41. Prop inference

Goal: an untyped component is fully typed in the editor, `weft check` and CI, with nothing to write. `props.count` is
`number` because the caller passes a number, and misuse is a real error at the real source.

TypeScript has no call-site parameter inference and won't get it, so this needs tooling. It's built, and it adds no
runtime or bundle cost: annotations exist only in what the checker sees. The compiler isn't involved, so it works
with no Rust on the PATH.

## 1. Decision

A **shadow**: the source with an annotation inserted after the parameter, seen only by the checker. The types in that
annotation come from asking the checker about each call site, in rounds, until they stop changing.

```tsx
// src/shop.tsx, as written
function AddButton(props) { return <Button onClick={() => props.count++}>Add</Button> }
// what the checker sees, same file name
function AddButton(props: { count: number }) { return <Button onClick={() => props.count++}>Add</Button> }
```

The checker's view is delivered four ways, all over one engine (`packages/cli/src/infer`):

| Where | How | Status |
|---|---|---|
| `weft check`, `weft tsc`, dev | TypeScript 7's API with an in-memory file overlay | Works on 7.0.2 |
| VS Code today | tsserver plugin (`@weft/cli/ts-plugin`) | Tested over the TS server protocol |
| An editor on TypeScript 7 | `weft lsp`, a proxy in front of `tsc --lsp` | Tested over LSP; no VS Code client written |
| A project on TypeScript 6 | The same engine over a language service | Tested |

## 2. Why this and not the others

The first question was tsgo. TypeScript 7 [loads no tsserver plugins](https://jovidecroock.com/blog/typescript-7-content-mappers/):
a `plugins` entry is parsed and ignored without a warning. That's why Volar, and so `vue-tsc` and Astro, are still on
6.0 ([Astro's tracking thread](https://github.com/withastro/roadmap/discussions/1321), [Vue's](https://github.com/vuejs/language-tools/issues/5381)).
7.1's beta adds content mappers, but those can't claim `.ts` or `.tsx`, and weft's sources are `.tsx`. So anything
built only as a plugin or a mapper dies on tsgo.

What 7.0.2 does ship, under `typescript/unstable/*`, is a checker API with a virtual file system. It's the same
checker as `tsc`, it reads our text under the real file name, and it's fast (§8). That's the bet, and it has a cost:
it's named unstable. `hosts.cjs` is the only file that touches it, and the scaffold pins `typescript`.

| Rejected | Why |
|---|---|
| Volar virtual code (the svelte2tsx, `vue-tsc` model) | Plugin API, so 6.0 only. It also solves a harder problem: those tools map a foreign language, and we map a few insertions. `shadow.cjs` is 46 lines |
| Generated `.d.ts` augmentation | Nothing can type a function declaration's parameter from outside; there's no contextual type for it |
| Shadow tree on disk and a generated tsconfig | Worked in principle, but paths, JSON imports and duplicate modules all need care, and the overlay needs none of it |
| Type-level inference (a twin function returning the site's values) | Elegant, needs no checker pass, and can't reach a site inside `.map(x => …)`: a closure's locals can't leave through JSX, which types as `any` |
| Turning off `noImplicitAny` | Silences the error and gives `any`, the opposite of the goal |
| Writing every annotation into source | The owner's goal is that nobody sees them. Done only for exports (§4) |

## 3. How it infers

Facts are syntax only (`facts.cjs`): components with an untyped single parameter, what the body does with each prop,
JSX sites, what variables hold components. Cached by content hash. Then, in rounds:

1. Shadow every candidate as `any`, ask the checker for each attribute's type at each site.
2. Build the annotation, publish the shadow, repeat, because a prop forwarded to another inferred component only has a
   type on the next round. It stops when no type changes (at most 5; real code took 2–3).
3. If the body has errors on a prop with several types, try narrower readings (§5).

The checker's own printed text goes straight in, inline at the parameter, so local types and an enclosing `T` resolve.
If a name can't be seen there, the component falls back to `any` with **W085**.

## 4. Scope

**Private components** are inferred from all their sites. No site is **W080**, with the fix in the message.

**Exports are written down.** A caller's edit must not silently change a public API, so `export function Card(props)`
is **W081** until it has a written type. `weft dev` writes it into the source once the file has been quiet for 400 ms
and is unchanged since it was analysed, so nobody has to; `weft fix` and a code action do the same. Same-repo callers
across files are found through the checker.

```tsx
export function Card(props: /*inferred*/ { title: string }) { ... }
```

The comment means generated: when callers change, dev rewrites it, which shows as a diff, and in CI `weft check` fails
with **W082** instead of rewriting. Deleting the comment makes the type yours, and a caller that disagrees is then an
ordinary error. An export with no caller in the repository can't be inferred: W081 has no autofix, on purpose.

**Explicit annotations always win:** any typed parameter, a typed variable, or type parameters and the engine leaves
it alone. `src/routes` default exports get `RouteProps<typeof load>`, because the framework is their caller.
`check: { props: false }` turns all of this off; `'manual'` leaves writing to `weft fix`.

## 5. Edge cases, attacked

Tests are in `packages/cli/test/infer.test.mjs`, on tsgo and TypeScript 6; the fixture is `test/fixtures/infer`.

| Case | Result | Evidence |
|---|---|---|
| `const C = pick(A, B); <C />` | Solved: both get the site | `A`, `B`: `{ x: number }` |
| `const views = { a: A }; const V = views[k]; <V />` | Solved. `<views[k] />` itself isn't JSX syntax | Same |
| A component as a prop, `<Host icon={Star} />`, `<props.icon size={2} />`, `const I = props.icon` | Solved: the prop is `typeof Star` and the site reaches `Star` | `Star`: `{ size: number }` |
| Render-function `children` | Solved, from the body's call | `children: (arg0: number) => any`, and the caller's `i` is typed |
| HOC, `const W = hoc(Inner)` | Solved in the same file, where `W` takes `Inner`'s props. **Not tested:** a HOC that adds or removes props, which would be read as `Inner`'s | `Plain`: `{ t: string }` |
| `<Button {...props} />`, `{ title, ...rest }` | Solved: `Button`'s props, minus what's named, what's set optional | `Omit<Parameters<typeof Button>[0], "title"> & { title: string }` |
| Callers disagree, body handles both | Union | `Show`: `{ v: number \| string }` |
| Callers disagree, body doesn't | Solved: each type is tried alone, and the odd caller gets **W084** in plain words, at the attribute | `n here is string, but Inc uses it as number` |
| The only caller is wrong | Solved the same way: `props.n++` adds `number` as a candidate | Same |
| Conditional props, narrowing on `kind` | Solved when a string prop separates callers: a union of shapes | `{ kind: "text"; value: string } \| { kind: "num"; value: number; digits: number }` |
| Some callers omit a prop | Solved: optional. A default value also types it | `{ a: number; b?: string; size?: number }` |
| `any` at a site | Solved: **W083** names the origin by following the file (`JSON.parse('{}')`, line 45), and the body's use stands in where it says something | `g: any[]` |
| Handlers | Solved: `<button onClick={props.onPick}>` takes the element's event type, so the caller's lambda is typed | `(event: PointerEvent & { currentTarget: HTMLButtonElement; … }) => void` |
| Inner components | Solved, including ones using an enclosing type parameter | `In`: `{ v: T }` |
| Recursive, typed data | Solved; a component's own sites add nothing | `Tree`: `{ node: TreeNode }` |
| Recursive, inline literal data | **Partly.** The literal's shape is taken for the type, so the inner call fails with TS2741 | Give the data a type |
| Generics: two props must agree | **Partly, needs an annotation.** Unions lose the link: `items: number[] \| string[]`, and the body fails | Write `function List<T>(props: { ... })` |
| Async components | Solved: nothing special | `Slow`: `{ ms: number }` |
| Lazy islands | Not tested on their own. To the engine an island is a component with sites, so it should behave the same | |
| Several parameters | Not inferred; `TS7006` stays | Components take one |
| `.jsx` | Not inferred: there's no annotation to insert | |

`any` in the middle of a value is not chased: `{ a: any }` at a site stays as it is, with no warning. `W083` covers an
attribute whose whole type is `any`, and only follows names inside one file.

## 6. Limits

- **Plain `tsc` reports TS7006** on an inferred parameter, and nothing can change that. CI runs `weft tsc`, which the
  scaffold has as `typecheck`. Exports are written, so a library's consumers see ordinary types.
- **`tsconfig`'s `plugins` entry does nothing on tsgo.** An editor there needs `weft lsp`. The proxy is tested with
  hover and diagnostics; completion and go-to-definition go through the same mapping but aren't tested, and no VS Code
  extension launches it yet.
- **VS Code needs telling where the plugin is**, because TypeScript 7 has no tsserver to select as the workspace
  version. The scaffold writes `typescript.tsserver.pluginPaths`. An existing app has to add that and the plugin entry.
  It hasn't been run in VS Code itself: the test drives tsserver with the flag that setting passes.
- **The API is `unstable`.** A 7.1 change could break `hosts.cjs`, and the plugin depends on TypeScript 6's internals
  (`markAsDirty`, tsserver's sync) in the same way.
- **Dev writes to source files.** An editor with unsaved changes to that file gets a conflict prompt when it next
  saves. `check: { props: 'manual' }` avoids it.
- Prop names that callers pass and the body never reads stay in the type, so an unused prop isn't an error.

## 7. Live in `weft dev`

A listener of its own, hooked at file-change (`props-listener.mjs`). The main thread posts the changed name to a worker
and returns; TypeScript runs in its own process, so neither HMR nor a request waits on it. The worker waits out a burst
for 25 ms, re-parses the saved file, and asks only about the files affected: site results are cached per file until
the file, or a shadow it reads, moves. Errors go to the terminal, the Vite overlay and `.weft/props.json`, and only when
they changed. A project with nothing to infer never starts a checker, and an idle checker is closed after 2 minutes.

**Merge point with the hot-reload work on `claude/weft-no-rust`:** one line in `devCommand`, after the server starts.
It needs only `server.watcher`, `server.ws` and `server.close`. If that branch replaces the dev server, those three
are the contract.

## 8. Cost

The machine was busy throughout: 1-minute load 20–50 on 14 cores. Treat these as upper bounds. Copies of the apps
without env files, with 6 (Lemonstand) and 11 (site) real components' annotations removed.

| | Lemonstand | Site |
|---|---|---|
| Added to `weft check`, nothing to infer | 10 ms | 12 ms |
| Added to `weft check`, with inference (starts a checker) | 196 ms | 146 ms |
| Worker's work on a save, median | 42–56 ms, 24 ms on a plainer file | 13 ms |
| The same, nothing to infer | 0.7 ms | not measured |
| Of that, inference alone (the rest is type-checking the saved file) | 13 ms | 3 ms |
| Save to report, median, includes Vite's watcher (12–40 ms) and the 25 ms debounce | 101 ms | 56 ms |
| HMR, median of 3 runs each, 20 saves per run | 36 ms off, 38 ms on | not compared |
| Burst of 10 saves in 50 ms | 1–2 runs | 2 runs |
| Idle memory, nothing to infer | +36 MB | not measured |
| Idle memory, inferring, checker running | +90 MB, and tsgo at 280 MB | tsgo at 216 MB |
| tsserver, edit and diagnostics, median | 122–137 ms before, 123–125 ms after | 49 ms before, 75 ms after |
| tsserver, first file | +1 s (2.1–2.4 s to 3.1–3.6 s) | +1.2 s |

**Targets.** HMR: no measurable cost; the difference is inside the spread between runs. Under 50 ms on a typical save:
met for the update of inferred types and for the worker on the site and on most Lemonstand files. Missed in two ways: a
heavy file on Lemonstand reached 56 ms median and over 100 ms at p90 under load, and save-to-report, which includes the
watcher and the debounce, is 56–101 ms, so up to 51 ms over. The type check of the saved file is what takes the time,
22–54 ms, and it's the only part that's more than 15 ms.

## 9. Also considered

Inferring exports without writing them (a caller's edit could change a public API). Project-wide inference of a
private component (it's private). Discriminating on booleans and numbers (rarely what's meant; only strings do).
Typing `class` and `style` on components from DOM usage (`<div {...props} />` is typed from its callers). A persisted
fact cache (a whole project's facts took 10–12 ms). Generating type parameters for correlated props: it needs to see that two
unions move together, and getting that wrong is worse than asking.

## 10. `bind`

`bind:x={box}` is typed as the box's value, but the compiler doesn't lower it: research 40 chose `x={bind(box)}`,
because TypeScript would otherwise report `x` missing. Left alone, the child would silently get a prop named `bind:x`.
So it's **W086**, and `weft fix` rewrites it. `bind(box)` needs nothing here: it types as the value. If the spelling
is ever compiled, delete `spelling()` in the engine; the shadow already handles it.
