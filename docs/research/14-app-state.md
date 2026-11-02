# 14 — App state: shared client state without a store, bound to the backend

Research date: 2026-10-28. Versions come from `npm view` on that date. Library behaviour comes from each project's own
docs or repo, read on that date (sources at the end). Statements marked **(unverified)** could not be confirmed from a
primary source. Numbers marked **(guess)** are starting budgets to replace after the first measurement. Eval numbers
come from `evals/results/` and are re-counted from the snapshot files for this doc. Nothing was benchmarked.

**The ask (from the user):** "make sure we have a redux/zustand like system built in for state management but not
confusing, very simple and talking the same agent design language. It needs to be able to hook into backends very
easy, have caching, updates, all the thing zustand would give you, but again much smarter for agent and this system".

**Constraints from PLAN:**
- §2 rules: one way to do each thing, no context-dependent magic, every failure gets a diagnostic, errors teach.
- §3.1: the whole reactive API is `state`, `state.linked`, `derived`, `resource`, `watch` and `context`. "There's no
  separate `store`."
- §12: "**No `store`.** `state` + `.set(draft)` covers deep updates; two containers broke 'one way'".
- §4 and §4.2: server data lives in the client cache (`query`, `.live`, `stream`, `channel`), keyed by `fnId + args`.
  The cache owns subscriptions, with `keep: '30s'`.
- W030 already makes module-level `state` reachable from the server entry an error.

**The tension.** People reach for zustand because it gives one importable place for shared state, with actions,
selectors, persistence, devtools and SSR recipes. weft has no store container. This doc has to choose between
(a) a convention or helper on top of `state`/`derived`, or (b) a new primitive and an amended decision log.

---

## TL;DR

1. **Decision: (a). No second container.** The feature is one helper, **`defineState(name, setup)`**: a *named setup
   scope*, which is a component without a view. Inside it you write ordinary `state`, `derived` and query calls, and
   you return boxes and plain functions. Nothing new holds a value. The §12 entry stands, and gains one clarifying
   line (§9.1).
2. **Why the helper exists at all:** **lifetime and name**, not storage. A plain exported `state()` can't give:
   - one instance per request on the server (zustand, Jotai and Pinia all needed a provider or factory for this),
   - a fresh instance per test,
   - stable names for devtools and persistence keys,
   - a transaction boundary for undo and time travel.

   `defineState` gives all four, and nothing else.
3. **The evidence is the v3 eval, not taste.** Re-counting the 4 agent sessions and both references:
   - **Every session hoisted all shared state into `App`:** 7–8 boxes, 53–84 lines. Agents already "make a store";
     they need no new container to do it.
   - **Every session, and both references, held server data in client state.** `useState(rawProducts)`,
     `createStore` + `setCatalog(list)`, a `prices` map merged back with `{ ...p, price }`. The task gave no query
     cache, so this was forced. It is still the exact shape of the classic bug, and it produced the only measured
     defect in 52 runs: Sonnet's Solid app rebuilt all 150 rows per price push (300 DOM mutations against 1).
   - Nothing failed for lack of selectors, middleware or a store API. **The failure surface is server data and
     identity**, so that is where the design spends its rules and diagnostics.
4. **Server state stays in the query cache, enforced.** **S001** fires when a server object or array flows into
   `state` (`state(await listTodos())`, `todos.value = q.value`, `watch(q, v => box.set(v))`, a push callback writing
   a box). Its fix is "reference the query and derive". Ids and primitives are fine; copying "the price when it was
   added" is a legitimate snapshot (v3 ticket 2).
5. **Optimistic updates move onto the `mutation` declaration:** `optimistic: ({ input }, cache) => cache.update(q,
   args, draft => …)`. Overlays are **layered per mutation and re-applied on every fresh server value** until their
   mutation settles (Replicache/Zero rebase), rather than snapshot-and-restore. That removes the concurrent-rollback
   race that TanStack Query and RTK Query both document.
6. **The zustand feature list maps onto options of existing things:**
   - **Persistence:** `state(init, { persist: 'local' | 'session' | 'cookie' | 'idb', schema, version, migrate })`.
     A `.weft/state.lock.json` hash makes "schema changed without migration" a build error (**S003**). `'cookie'` is
     the SSR-readable backend, so a cart badge renders right on the first byte.
   - **Cross-tab sync:** `sync: 'tabs'` over `tabs.channel`.
   - **Undo/redo:** `defineState(…, { history })`. Each action call is one named undo step.
   - **Devtools:** compiler names (`cart.total ← cart.lines ← getCart({}) [live]`) in `weft browser state`, the graph
     overlay, time travel and the recorder.
   - **Reset and test isolation:** `$reset()`, and a fresh instance per `render()`.
7. **No selectors and no equality functions.** Readers subscribe to the boxes they read, so typing in `cart.note`
   touches only the textarea. A zustand component re-runs its selector on *every* `set` of the store. There is no
   `useShallow`, `createSelector` or `observer()` to forget (§5).
8. **Size of the change for an agent:** the same cart feature is **24 lines and 7 concepts** in weft, against **91
   lines and 23 concepts** in zustand + TanStack Query, counting client code only (§7.5).
9. **Diagnostics `S001`–`S013`** (new prefix, unused today). Seven have a mechanical autofix. The AGENTS.md block is
   7 lines (§4.1).
10. **Plugins:**
    - **`state.persist@1`, a keyed slot: yes.** `local`/`session`/`cookie`/`memory`/`idb` are built-in defaults.
      `opfs` and native stores (MMKV, Keychain) are providers. It passes 13's two-providers rule, because native
      targets need different backends.
    - **`state.sync@1`: no.** Tab sync is built in. Server sync engines plug into the **query cache** (`cache.sync@1`,
      Later), never into app state, because server data doesn't belong there.
11. **Phasing:**
    - **Phase 1:** `defineState`, persistence, history and most S-codes.
    - **Phase 3:** SSR isolation, `optimistic` and query taint.
    - **Phase 3b:** tab sync and `sharedState`.
    - **Later:** the offline queue.

    Runtime cost is about 1.5 KB br when every feature is used, and 0 KB unused (guess).

---

## 1. Prior art: what each one gets right, and what agents get wrong with it

### 1.1 Comparison

| Library (version) | Shape | SSR story | Persistence / sync | What agents get wrong |
|---|---|---|---|---|
| **zustand** 5.0.16 | `create(set => ({ …state, …actions }))` → a hook taking a selector. Slices are spread into one store. Middleware wraps the creator | The Next.js guide: "the store should not be defined as a global variable". You write a factory, a context provider and a hook that throws outside it | `persist` middleware: `name`, `storage`, `partialize`, `version`, `migrate`, `skipHydration`, `onRehydrateStorage`. Async storage hydrates late | (1) Selectors returning new objects. The v5 migration guide says this "may cause infinite loops" ("Maximum update depth exceeded"), and the fix is `useShallow`. (2) Middleware order: the docs say to use `devtools` "as last as possible", because it mutates `setState`. Slice middleware belongs only on the combined store. (3) Global stores in SSR. (4) Persist hydration mismatches; the docs reach for `skipHydration` + `rehydrate()`. (5) Devtools actions show as anonymous unless every `set` passes a name as the third argument. (6) Copying fetched data into the store |
| **Redux Toolkit** 2.13.0 + **RTK Query** | `createSlice` reducers (immer), `configureStore`, `<Provider>`, `useSelector`. RTKQ: `createApi`, `providesTags` / `invalidatesTags` | Store per request through the provider **(unverified for RTK 2.13 docs)** | Not built in (redux-persist is third-party) | (1) `useSelector(s => s.todos.filter(…))` returns new references and re-renders on every action; the fix is `createSelector`. (2) Optimistic updates via `onQueryStarted` + `updateQueryData` + `patchResult.undo()`. The docs warn that with many concurrent mutations `.undo` "can cause race conditions" and suggest invalidating instead. (3) Copying RTKQ results into slices. The docs say the cache is meant to reflect server state and advise against manual updates outside `onQueryStarted` |
| **Jotai** 3.0.1 | Atoms; derived atoms; an implicit default store | The Next.js guide: the implicit global store is shared across requests, so wrap the root in `Provider`; seed with `useHydrateAtoms` | `atomWithStorage`. v3 moved `atomFamily` to `jotai-family` and removed `loadable` | (1) Atoms created inside components (a new atom each render). (2) `atomFamily` entries never removed (memory). (3) No `Provider` in SSR. (4) Async atoms that suspend during SSR, which the guide says not to do |
| **Valtio** 2.3.2 | Mutable `proxy()`; render from `useSnapshot()` | Module proxies are global **(unverified guidance)** | Manual `subscribe` | The docs say reading the proxy in render "is not reactive". Agents read the proxy instead of the snapshot, or mutate the frozen snapshot. Subscribing late misses early updates |
| **MobX** 7.1.3 | Observables, `computed`, actions; `observer()` on components | Per-request instances by hand | Third-party | The React integration docs call a component without `observer` "the most common mistake". Others: dereferencing a value in a parent so the child doesn't track it, and destructuring props. Async writes after `await` happen outside the action |
| **Pinia** 4.1.0 | `defineStore(id, options \| setup)`. In a setup store, `ref` is state, `computed` is a getter and a function is an action. The id feeds the devtools | Per-app instance; `useStore(pinia)` outside setup; serialize `pinia.state.value`, which must be hydrated "before calling any `useStore()`" | `pinia-plugin-persistedstate` 4.7.1 | (1) Destructuring a store loses reactivity, so `storeToRefs()` is required. (2) A setup store must return every state property, or SSR, devtools and plugins break. (3) `useStore()` before an active pinia, or at module top level on the server. **Closest prior art to this design** |
| **Legend-State** 2.1.15 (v3 is `3.0.0-beta.48`) | Observables with `get()`/`set()`; `use$`/`observer` in React | — | The strongest sync story. `syncObservable` / `synced()` with local storage and IndexedDB plugins, `retrySync` keeps pending changes across restarts, and `changesSince: 'last-sync'` needs `fieldUpdatedAt`. Conflict handling isn't documented on the sync page | `get()` vs `peek()`, a forgotten `observer`, and v3 being beta for a long time. The sync engine mixes server data into the client observable by design, which is the opposite of the line weft draws |
| **TanStack Query** (`query-core` 5.105.0) | A key-based server cache | `dehydrate` / `HydrationBoundary` | `persistQueryClient` (plugin) | (1) Duplicating `useQuery` data into `useState` / a store. (2) The optimistic recipe needs `cancelQueries` + `getQueryData` + `setQueryData` + a rollback context + `invalidateQueries`. (3) The concurrent-mutation flicker. TkDodo's fix is "invalidate only when `isMutating({ mutationKey }) === 1`" |
| **TanStack Store** 0.11.2 | A small framework-agnostic store. The overview says it mostly backs other TanStack libraries | — | — | Rarely used directly by apps; few agent priors **(unverified)** |
| **XState Store** 4.3.0 | `createStore({ context, on })`; `store.trigger.<event>()`; `store.select(fn, equality)`. Extensions via `.with()` add undo/redo, persist and reset | — | Persist extension | Event-reducer indirection: two names per change, so every write path is a transition. Selectors still need equality functions. A good model of **named, undoable transitions**, which weft takes for actions |
| **Solid stores** 1.9.17 (2.0.0-rc.19) | `createStore` with path setters, `produce`, `reconcile`; Solid 2 moves to draft-first setters | Module stores are global | — | Replacing objects instead of reconciling breaks `<For>` identity. **The v3 Sonnet regression is this bug.** The Solid reference used `reconcile` to avoid it. Path-setter syntax is easy to get wrong |
| **Svelte 5** 5.57.3 (`.svelte.ts` modules) | Shared `$state` in a module | Module state is global on the server **(unverified in the `$state` page)** | — | The docs say you can only export state that isn't reassigned: export an object or getter functions. Agents export a reassigned `let` and lose reactivity |
| **Preact signals** (`signals-core` 1.14.5) | Module-level `signal()` / `computed()` | Global module signals are shared across requests **(unverified guidance)** | — | Passing `.value` (a snapshot) instead of the signal; module singletons in SSR |
| **Replicache** 15.3.0 / **Zero** 1.11.3 | Mutators run optimistically on the client, then authoritatively on the server; the client rebases pending mutations on server state | Not a UI store | Client store in IndexedDB; Zero has synced queries | Zero's docs: when a server mutator throws, "the optimistic mutation on the client will be reverted". Pending mutations that the server has applied are rolled back locally once the rows arrive. **The model weft adopts for overlays**, without the client database |

### 1.2 Failure classes, and what removes each one

| Failure class | Where it shows | weft's structural answer |
|---|---|---|
| Selector equality, unstable selector outputs | zustand v5, Redux, XState Store | No selectors. Readers track the boxes they read. A `derived` that only rebuilds or picks is **S006** |
| Forgetting the reactive wrapper (`observer`, `useSnapshot`, `storeToRefs`) | MobX, Valtio, Pinia, Legend | Components run once and boxes are objects. There is nothing to wrap and nothing lost on destructure (PLAN §3.2 rule 1) |
| Provider required for SSR, or a forgotten one | zustand, Jotai, Redux, Pinia | `defineState` is resolved through the render owner's app instance. No provider; reading it outside an owner on the server is **S002** |
| Middleware order and middleware typing | zustand (`devtools` last, slices only on the combined store) | No middleware. Persistence, sync and history are options with fixed semantics, composed by the runtime in one order |
| Server state held in a client store | every store library; all 6 v3 sessions and references | Server data lives only in the query cache. Copying it is **S001** |
| Optimistic rollback races | TanStack Query, RTK Query | Layered overlays, rebased on every server value (§3.3) |
| Persisted schema drift | zustand `version`/`migrate` (silently drops on mismatch), VueUse (infers the serializer from the default) | Schema required, a lockfile, **S003** with a scaffolded migration |
| Anonymous devtools actions | zustand (third `set` argument), Redux (action types by hand) | Names come from code: the scope name plus the returned key |
| Module-state SSR leaks | zustand, Jotai, Svelte, Preact | W030 for raw module `state`; `defineState` is per request by construction |
| Identity loss from spread merges | Solid (v3 eval), Redux immutability habits | Server data isn't copied, so it isn't spread. Overlays edit drafts in place. **S006** covers the spread in a `derived` |

### 1.3 What weft takes

- **Pinia:** setup-function stores with an id, and "a store is a component without a view". Also its lesson that
  the instance must be hydrated before first use.
- **XState Store:** named transitions as the undo and inspection unit.
- **Replicache/Zero:** optimistic work as a layer that rebases on server truth, not as a snapshot to restore.
- **TanStack Query and RTK Query:** the server cache owns server data. Tags (`providesTags` / `invalidatesTags`)
  already match PLAN §4.
- **zustand:** the ergonomics target. One import, functions as actions, no boilerplate.

Left out: providers, selectors, middleware, reducers and event types, mutable proxies, and "sync the store to the
server" engines.

---

## 2. The weft answer: `defineState`

### 2.1 Options considered

| Option | What it is | Verdict |
|---|---|---|
| **A1. Plain exported `state()` in `app/state/*.ts`** | `export const note = state('')` | **No, on its own.** It leaks across requests (W030 already errors). There are no names for persistence keys, no reset point and no test isolation. Making the compiler treat `app/state/` specially would be location-dependent magic (rule 2) |
| **A2. `defineState(name, setup)`: a named setup scope** | A function returning boxes and functions, instantiated per app instance | **Chosen.** It adds no new value holder. It is the smallest thing that gives a lifetime (request, tab, test) and a name |
| **B1. A `store()` primitive (deep object with actions)** | zustand/Pinia options shape as a new box type | **No.** Agents would face two ways to hold an array ("`state([])` or `store({ items: [] })`?"). Its only unique win, "writes only through actions", is cheaper as S005 |
| **B2. A reducer/event store (Redux, XState Store)** | `on: { add: (ctx, e) => … }` | **No.** Two names per change and a dispatch indirection. Named, undoable transitions come free from actions-as-functions (§2.5) |

**Would (b) reduce agent errors?** The eval says no. No session failed for lack of a container. The two failure
modes it measured, server data held in state and identity loss from merges, happen *inside* any container. A new
primitive would add a choice without removing either one. The rules in §3, and S001/S006, remove both.

### 2.2 The definition

```ts
// app/state/cart.ts
import { defineState, state, derived } from '@weft-js/core'
import { getCart, setLine, placeOrder } from '~/server/cart'

export const cart = defineState('cart', () => {
  const open = state(false, { history: false })              // UI only: not persisted, not undoable
  const note = state('', { persist: 'session' })             // draft: survives reloads in this tab
  const server = getCart.live()                              // server state: referenced, never copied
  const lines = derived(() => server.value?.lines ?? [])
  const count = derived(() => lines.value.reduce((n, l) => n + l.qty, 0))
  const total = derived(() => lines.value.reduce((s, l) => s + l.qty * l.price, 0))
  const qtyOf = (id: string) => lines.value.find(l => l.productId === id)?.qty ?? 0

  return {
    open, note, lines, count, total,
    saving: setLine.pending,                                 // Derived<boolean>
    add(id: string) { return setLine({ productId: id, qty: qtyOf(id) + 1 }) },
    setQty(id: string, qty: number) { return setLine({ productId: id, qty }) },
    remove(id: string) { return setLine({ productId: id, qty: 0 }) },
    toggle() { open.value = !open.value },
    async checkout() {
      await placeOrder({ note: note.value })                 // invalidates cart:<user> and orders:<user>
      note.value = ''
      open.value = false
    },
  }
})
```

That is the whole cart: local UI state (`open`), a persisted draft (`note`), a server query (`getCart.live()`), and
an optimistic mutation (`setLine`, whose `optimistic` lives on its declaration, §3.3). It is 24 non-blank lines.

**Semantics, precisely:**

| Aspect | Rule |
|---|---|
| Name | `name` is a literal string, unique per app (S009 covers duplicates). It is the devtools prefix and the persistence key prefix |
| Setup | Runs **once per app instance**, lazily, on first access, like a component body. Same rules as setup: no W001 reads in the body outside `derived`/`watch`/actions |
| Return value | An object of boxes, `derived`s, resources and functions. Functions are **actions** (§2.5). Every returned box gets a dev name `cart.<key>` |
| Private boxes | Allowed. Unlike Pinia, devtools and SSR see a box by its compiler name, not by being returned. Private persisted boxes are named `cart.#<local name>` |
| App instance | One per `mount()` on the client (one per tab), **one per request on the server**, one per `render()` in `@weft-js/core/test` |
| Access | `import { cart } from '~/state/cart'`, then `cart.count.value` and `cart.add(id)` anywhere an owner exists: components, `derived`, `watch`, handlers, other scopes' setup. The export is a typed handle that resolves the current app instance through the owner |
| Outside an owner | Client: resolves the single root instance (a plain `onclick` in a script works). Server: **throws S002**, and `weft check` reports static cases at the line |
| Lifetime | `keep: 'app'` by default (lives as long as the tab or request). `keep: '5m'` disposes the instance that long after its last reader unmounts. Persisted boxes are write-through, so disposal loses nothing. Query references inside are released, so the client cache can drop them after its own `keep` |
| Options | `defineState(name, setup, { keep?, history? })`. Nothing else |
| Meta | `cart.$reset()`, `cart.$snapshot()`, `cart.$history` (when enabled). The `$` names are reserved; returning a `$`-prefixed key is a type error |

**Is resolving through the owner "context-dependent magic"?** No, because the answer never changes meaning. A
handle always means "this app's instance", and there is exactly one per app. Pinia and the zustand Next.js guide
reach the same place with a provider you must remember. weft makes the provider implicit in `mount`/`render`/the
request, and makes the one case where it can't resolve (server, no owner) an error with a code rather than a
silently shared object.

### 2.3 Use in components

```tsx
// app/components/CartButton.tsx
import { cart } from '~/state/cart'

export function CartButton() {
  return <Button onClick={cart.toggle} badge={cart.count.value}>Cart</Button>   // actions are plain bound functions
}

// app/components/CartDrawer.tsx
export function CartDrawer() {
  return (
    <Drawer open={cart.open} title="Cart">                                  {/* box: the drawer may close itself */}
      {cart.lines.value.map(line => <CartLine key={line.productId} line={line} />)}
      <Textarea label="Gift note" value={cart.note} />
      <Text role="title">{format(cart.total.value)}</Text>
      <Button onClick={cart.checkout} pending={cart.saving.value}>Checkout</Button>
    </Drawer>
  )
}

// app/components/CartLine.tsx: per-line controls read the scope, the row doesn't receive callbacks
export function CartLine({ line }: { line: Line }) {
  return (
    <Row gap="related">
      <Text>{line.name}</Text>
      <Button aria-label={`Decrease ${line.name}`} onClick={() => cart.setQty(line.productId, line.qty - 1)}>−</Button>
      <Text data-testid="qty">{line.qty}</Text>
      <Button aria-label={`Increase ${line.name}`} onClick={() => cart.add(line.productId)}>+</Button>
    </Row>
  )
}
```

There is no provider, hook, selector or `useShallow`, and no prop drilling of `onAdd`/`onChange` through
`ProductList` (the v3 Sonnet Solid `App` passed it 9 props).

### 2.4 Rules for what goes in state

| Kind | Where it lives | Example |
|---|---|---|
| Server data (lists, records, prices, entitlements) | The query cache: `query(args)`, `.live`, `stream`, `channel.collect` | `getCart.live()` |
| References to server data | `state`, as **ids and args** | `selectedId = state<string \| null>(null)`; `const todo = getTodo.live(() => ({ id: selectedId.value! }))` |
| Edits of server data before saving | `state.linked(() => q.value, { key })` or `<Form of={mutation}>` | an inline title editor |
| Client-only facts | `state` | drawer open, filters, sort, wizard step, draft text |
| Point-in-time snapshots of a primitive | `state`, written in an action | "price when added" (v3 ticket 2) |
| Real-time shared state (other users see it) | `sharedState` (§3.6) | the presenter's slide number |

### 2.5 Actions

- **Any function returned from the setup is an action.** At build time, the compiler wraps it with a dev name
  (`cart.add`), a `batch` and a transaction boundary. Writes made before the first `await` are one transaction.
  Each later synchronous segment is another, named `cart.checkout#2`.
- **No reducers, no `this`.** Actions are closures over setup, so `onClick={cart.toggle}` is correct. That removes
  the Pinia/MobX `this` binding problem and the zustand `set`/`get` pair.
- **Action-owned boxes (S005).** A returned box that some action writes is *owned* by its actions. Writing it
  imperatively from outside the scope (`cart.note.value = ''` in a component) is **S005**, and the fix names the
  actions that write it. **Binding is allowed:** passing the box to a component prop typed `State<T>`
  (`<Textarea value={cart.note}>`) is the declared two-way path (PLAN §3.2 rule 6). Boxes no action writes (a
  search field) are free to write.
- **Actions may call actions** in the same or another scope. A nested call joins the outer transaction, so undo
  steps follow what the user did, not the call graph.
- **Async actions** return their promise, so `pending` on a button can take `cart.saving.value` or the promise.

### 2.6 Derived selectors

`derived` is the selector. It is lazy, cached, and recomputed only when a box it read changes. Selectors with
arguments are plain functions that read boxes (`qtyOf(id)`). Read inside JSX or a `derived`, they track exactly what
they read, so there is no `createSelector` and no `useShallow`. The cost of that is in §5.

### 2.7 Persistence

```ts
const lines = state<Record<string, number>>({}, {
  persist: {
    in: 'local',                                              // 'local' | 'session' | 'cookie' | 'idb' | any state.persist provider
    schema: z.record(z.string(), z.number().int().min(1).max(99)),
    version: 2,
    migrate: { 1: (v: CartLinesV1) => Object.fromEntries(v.map(l => [l.id, l.qty])) },  // v1 was an array
  },
  sync: 'tabs',
})
const dense = state(false, { persist: 'local' })              // short form only for primitive initial values
```

- **Key:** `weft:<app>:<scope>.<box>` (for example `weft:shop:cart.lines`). The app name prefix stops two apps on
  `localhost:5173` from reading each other's data.
- **Envelope:** `{ v, at, data }`. On load:
  1. Read the value.
  2. Run `migrate[v] … migrate[current - 1]` in order.
  3. Parse with `schema`.
  4. On any failure, use `init`, move the bad payload to `<key>:corrupt`, and report it in dev (`weft browser
     errors`, tagged S003).

  No path throws into the UI.
- **Schema is required** for object and array values (**S008**). The short form `persist: 'local'` exists only when
  `init` is a boolean, number or string, where the schema is unambiguous (`z.boolean()` etc.). That avoids VueUse's
  "infer the serializer from the default" bug.
- **The lockfile.** `.weft/state.lock.json` records each persisted key with its version and a JSON Schema hash.
  `weft check` fails with **S003** when the hash changes and `version` doesn't. It also fails when `version` is
  bumped with no `migrate` entry for the previous version.
  - **Autofix:** bump `version`, and scaffold `migrate[n]`. The old schema is in the lock, so the stub's parameter is
    typed from it (`.weft/state/cart.lines.v1.d.ts`).
  - zustand's documented behaviour on a version mismatch with no `migrate` is that "the stored value won't be used":
    data is dropped silently. S003 makes that a build error.
- **Backends:**
  - `local` and `session`: synchronous, so they are read during setup and the first client render is correct.
  - `cookie`: readable on the server, so SSR renders the stored value. Limited to 3 KB for the whole app (S008).
    Use it for things the first paint shows: theme, density, the guest cart count.
  - `idb`: async. The box starts at `init`, and `cart.lines.persist.ready` is a `Derived<boolean>`.
  - `memory`: tests.
- **Writes** are coalesced to one per microtask per key and flushed on `pagehide`.
- **Never persisted:** values whose schema contains a `secret()`-branded field (auth tokens, payment data) are
  **S008**. Server-owned boxes (`sharedState`, query values) can't take `persist`, also S008.
- **`@weft-js/core/browser`'s `storage(key, schema)` is folded in.** PLAN §4.2 lists it as a separate persisted `State`.
  Keeping both would be two ways to persist. `storage()` goes; the `persist` option is the one way (§9.2).

### 2.8 Cross-tab sync

- `sync: 'tabs'` broadcasts each committed transaction's **patches** (from `.set(draft)`, or a whole-value replace
  for `.value =`) on `tabs.channel('weft:state', …)`. The channel is validated with the box's schema, like every
  `tabs.channel`.
- **Conflicts:** patches apply in arrival order. Two tabs writing the same path in the same tick resolve last-writer-
  wins by `(at, tabId)` (guess). This is per path, not per box, so adding two different products in two tabs merges.
- **New tabs** read the persisted value, so `sync: 'tabs'` requires `persist` with `local`, `idb` or `cookie`.
  `session` is per tab, so `sync: 'tabs'` with `session` is **S008**.
- The `storage` event fires only in *other* tabs (07 §6). weft uses BroadcastChannel for live sync and storage only
  for cold start, so there is one path and no double-apply.

### 2.9 SSR hydration and per-request isolation

1. **Server:** the request creates an app instance. A `defineState` instance is created on first read during that
   request's render and is unreachable from any other request.
2. **Serialize:** after render, each instantiated scope's boxes that differ from `init` are written into one escaped
   `<script type="weft/state">` (devalue-style, with schema codecs for `Date`/`Map`). Query values are **not** in
   it: they travel in the client cache's payload (PLAN §4), so nothing is sent twice.
3. **Client:** when an instance is created, it seeds its boxes from the payload **before setup returns**. That makes
   Pinia's "hydrate before `useStore()`" rule impossible to break.
4. **Persisted boxes during SSR:**
   - `cookie`: the server reads the real value.
   - `local`/`session`/`idb`: the server renders `init`, and the stored value applies in the first post-hydration
     flush (the W054 rule for browser values).
   - Rendering such a box in SSR output is **S013**. The fix is `persist: 'cookie'` (if it's small), or an explicit
     `ssr:` value.
5. **Leaks are impossible by construction** for `defineState`. The remaining hole is code that keeps a handle's
   *value* past the request (`setTimeout(() => cart.note.value)` in server code), and that throws S002. Raw module
   `state` remains W030. Its fix gains a mechanical autofix: wrap the file's exported boxes in `defineState(<file
   name>, () => { …; return { … } })`.
6. Non-serializable values (functions, class instances, DOM nodes, `Map` without a codec) in a box that is
   serialized or persisted are **S010**.

### 2.10 Undo/redo, reset, snapshots

```ts
export const board = defineState('board', () => {
  const cards = state<Card[]>([])
  const zoom = state(1, { history: false })                   // view state isn't undoable
  return {
    cards, zoom,
    move(id: string, to: Column) { cards.set(d => { d.find(c => c.id === id)!.column = to }) },
    rename(id: string, title: string) { cards.set(d => { d.find(c => c.id === id)!.title = title }) },
  }
}, { history: { limit: 100 } })

board.$history.undo()            // reverts the last action: one step per action call, named 'board.move'
board.$history.redo()
board.$history.canUndo.value     // Derived<boolean>
board.$history.entries.value     // [{ action: 'board.move', at }, …] for an undo menu
board.$reset()                   // every box back to init; persisted boxes rewritten; history cleared
board.$snapshot()                // plain frozen JSON of all boxes (devtools, bug reports)
```

- **History stores patches**, not copies. `.set(draft)` already produces them. Memory is O(changed paths) per step.
- `history: false` on a box excludes it. Query-backed values are never in history, because undoing a mutation is a
  new mutation, not a local rewind.
- Undo inside an action that later `await`s splits by transaction (§2.5).

### 2.11 Test isolation

- `@weft-js/core/test`'s `render()` creates an app instance, so every scope is fresh per test with no `beforeEach` reset.
- Persistence uses `memory` in the fast lane. `render(<App />, { storage })` shares one fake storage across
  `app.reload()` and `tabs.open()`, so reload and multi-tab tests are deterministic.
- **Seeding is typed:** `render(<App />, { state: { cart: { note: 'hi' } } })` is checked against each scope's
  returned boxes. It seeds through the same path as SSR hydration, so tests exercise hydration for free.
- **Units:** `const c = scope(cart, { state: { … } })` instantiates one scope with no UI.
- Asserting on `cart.lines.value` in a component test is still T005 (implementation detail). It is allowed in
  `scope()` unit tests.

### 2.12 Devtools: names everywhere

The compiler already assigns dev names (PLAN §2 rule 6). For a scope, names are `<scope>.<returned key>`, or
`<scope>.#<local>` for private boxes. They appear in four places:

1. **`weft browser state [--json]`:**
   ```
   cart  (app, 2 readers)
     open    false
     note    "Happy birthday"        persist session v1
     lines   Derived<Line[3]>         ← getCart({}) [live, 2 overlays: setLine#41 setLine#42]
     count   5                        ← cart.lines
     total   42.50                    ← cart.lines
     actions cart.add ×3 · cart.toggle ×1 (last 12s ago)
   ```
   `weft browser set cart.note '"hi"'` extends the existing `set <Component.box>` command.
2. **The graph overlay** labels nodes `cart.total ← cart.lines ← getCart({})`, and marks overlays and persisted boxes.
3. **Time travel (dev only):** an action log in a 500-entry ring buffer holds each transaction's patches.
   `weft browser state goto <n>` replays to a point, `undo`/`redo` step through it, and it works for any scope,
   whether or not `history` is on.
4. **The recorder** (§7b) interleaves action names with the UI steps it records. A recorded test still asserts on the
   UI (T005), but its failure output shows which action diverged.

---

## 3. Backend binding

### 3.1 The rule: server state stays in the query cache

**Never copy server data into a box.** A copy goes stale as soon as a mutation, a `.live` poke or another tab
changes the server. It also forks identity, so merges get written as spreads (the v3 regression), and SSR then
serializes the data twice. The client cache already gives everything the copy was for: sharing by key, `keep`,
refetch, overlays and SSR transfer.

**How agents are steered away from it:**

1. **The AGENTS.md rule** (§4.1, line 2) states it in one line, next to the alternative.
2. **S001 is an error, at the line, with the fix.** The compiler knows which bindings are server functions (the
   server-function transform already resolves them), so values read from their `Resource`/`Stream`/`Channel` boxes
   are *server values*. S001 fires when a server value that is an **object or array**, or a `map`/`filter`/spread of
   one, reaches a write into a `state` box:

   | Pattern | Fix (autofix when the box has no other writer) |
   |---|---|
   | `const todos = state(await listTodos())` | `const todos = listTodos()` |
   | `const todos = state(listTodos().value ?? [])` | `const todos = listTodos()` and derive `?? []` |
   | `watch(() => q.value, v => todos.value = v)` | `derived(() => q.value)` (this is also W004/W056) |
   | `listTodos().then(v => todos.set(() => v))` | reference the query |
   | `api.subscribePrices(u => prices.set(d => { d[u.id] = u.price }))` | a `stream` with `fold` (07 §9.1) |
   | `selected.value = todo` (a whole server object) | `selected.value = todo.id`, then `getTodo(() => ({ id: selected.value }))` |

   Not S001:
   - **primitives** picked from a server value: an id, or "the price when added";
   - writes inside `state.linked`, `optimistic` or `<Form>`, which are the declared editing paths;
   - an explicit `untrack(() => structuredClone(q.value))`, which documents an intended snapshot.
3. **The type of `query()` on the client is `Resource<T>`, not `Promise<T>`.** `state(await q())` only type-checks in
   server code, where module `state` is already W030.

### 3.2 Client state references queries

```ts
export const inbox = defineState('inbox', () => {
  const folder = state<'inbox' | 'archive'>('inbox', { persist: 'session' })
  const selectedId = state<string | null>(null)
  const threads = listThreads.live(() => ({ folder: folder.value }))           // args tracked: refetch on change
  const selected = getThread.live(() => selectedId.value ? { id: selectedId.value } : skip)
  const unread = derived(() => threads.value?.filter(t => !t.read).length ?? 0)
  return {
    folder, selectedId, threads, selected, unread,
    open(id: string) { selectedId.value = id; return markRead({ id }) },        // optimistic on markRead's declaration
  }
})
```

- Queries created in a scope's setup are owned by the scope instance. With `keep: 'app'` they stay subscribed for
  the tab's life. With `keep: '5m'`, the scope releases them when it is disposed, and the cache's own `keep: '30s'`
  then applies.
- `skip` (from `weft/server`) is the typed "no query" sentinel for conditional args. It replaces `enabled: false`.

### 3.3 Optimistic updates: on the mutation, layered, rebased

```ts
// server/cart.ts
export const getCart = query({
  cache: { scope: 'user', tags: (_, ctx) => [`cart:${ctx.user!.id}`] },
  run: ({ ctx }) => loadCart(ctx.db, ctx.user!.id),             // { lines: { productId, name, price, qty }[] }
})

export const setLine = mutation({
  input: z.object({ productId: z.string(), qty: z.number().int().min(0).max(99) }),
  invalidates: (_, ctx) => [`cart:${ctx.user!.id}`],
  optimistic: ({ input }, cache) =>                             // client-only; stripped from the server bundle
    cache.update(getCart, {}, cart => {
      const line = cart.lines.find(l => l.productId === input.productId)
      if (!line) return                                         // unknown product: wait for the server
      if (input.qty === 0) cart.lines.splice(cart.lines.indexOf(line), 1)
      else line.qty = input.qty
    }),
  run: ({ input, ctx }) => upsertLine(ctx.db, ctx.user!.id, input),
})
```

**Mechanics:**
- **One declaration.** `optimistic` sits next to `invalidates`, so the prediction and the refresh contract are
  reviewed together. The server-function transform keeps it in the client stub and drops it from the server bundle.
- **Overlay layers.** Calling `setLine(x)` pushes a layer `{ mutationId, apply }` onto every cache entry the
  `optimistic` function touched. Readers see `apply₁(apply₂(…(server value)))`, computed with drafts, so untouched
  rows keep their identity and keyed lists update in place.
- **Rebase.** Whenever a fresh server value lands (a single-flight refresh, a `.live` refetch, another mutation's
  response), the cache recomputes the base and re-applies the layers still pending. A refetch that started before
  the mutation can't clobber it. That is the overlapping-query problem TanStack solves with `cancelQueries`.
- **Settle.**
  - **Success:** the response carries the refreshed entries for `invalidates` (single-flight, PLAN §4). They become
    the base, and the layer is dropped in the same flush, so there is no flicker.
  - **Failure:** the layer is dropped, and the base re-renders without it. Only *that* mutation's effect disappears;
    a concurrent mutation's layer survives. This is the race that RTK's `.undo()` and TanStack's snapshot restore
    both document.
- **Status:** `setLine.pending` (`Derived<boolean>`, any call in flight), `setLine.error` (the last failure), and
  the returned promise. Overlay rows can read `cache.isOptimistic(row)` to render dimmed.
- **S011:** an `optimistic` that updates a query its `invalidates` tags don't cover. Its layer would drop at settle
  with no fresh base, so the old value would flash back. The autofix adds the tag.
- **Rapid clicks are correct.** `cart.add` reads `qtyOf(id)` from the overlaid value, so three quick clicks send 3,
  4, 5. With snapshot-based recipes they often send 3, 3, 3.

### 3.4 `.live` updates and local edits

`.live` pokes refetch through the cache, and the new value becomes the base under any pending overlays (§3.3). So
live data "just flows" into every `derived` in every scope.

The one conflict is a **local edit of server data**. `state.linked(() => todo.value?.title ?? '')` resets whenever
its source changes, so a poke while someone is typing clobbers the edit. That is the v2 profile-form trap, now driven
by the network. The proposal:

```ts
const title = state.linked(() => todo.value?.title ?? '', { key: () => todo.value?.id })
// key changed (another todo)                    → reset, as today
// same key, upstream changed, no local edit yet → reset (follow the server)
// same key, upstream changed after a local edit → keep the edit; title.conflict.value = { theirs, base }
```

- `state.linked` without `key` over a `.live` or query source is **S012**. The autofix adds `key` from the source's
  `id` field when the schema has one.
- `<Form of={mutation}>` gets the same behaviour internally.

### 3.5 Offline queueing and conflicts (Later; v0 keeps `OfflineError`)

PLAN §10 and 07 §4 keep v0 failing fast with a typed `OfflineError`. The design is fixed now so the v0 pieces don't
block it:

```ts
export const addTodo = mutation({
  input: …, invalidates: …, optimistic: …,
  offline: 'queue',                    // opt-in per mutation
  run: …,
})
```

- **Queue:** each queued call gets a client `mutationId`. Calls are persisted in order through `state.persist`
  (`idb`), and their overlays persist with them, so a reload still shows the pending row.
- **Replay** runs in order on `online` + transport-up (not `navigator.onLine` alone, 07 §6), with the same backoff as
  the transport.
- **Idempotency:** the server dedupes by `mutationId` in a `weft_mutations` table that holds the result for 24 h
  (guess). A replay after a lost response returns the stored result.
- **Conflicts:** the server stays authoritative. A replayed call that fails validation or authorization drops its
  layer and lands in `mutations.failed` (`Derived<FailedMutation[]>`, each with `retry()`/`discard()`), so the UI can
  say "2 changes couldn't be saved". Nothing is merged silently.
- **Diagnostics:** `offline: 'queue'` on a mutation without `optimistic` (the user sees nothing happen) and on a
  non-idempotent external side effect (payments: PAY-coded) are reserved S-codes.

### 3.6 Real-time shared state: `sharedState` as a box

agorix 03 §7 defines `sharedState(key, { key, value, authorize })` on the server: LWW compacted, one value per key.
On the client it is **a box like any other**. It is server-owned, so it's neither S001 nor persistable.

```ts
// server/meet.ts
export const deckSlide = sharedState('deck-slide', {
  key: z.string().uuid(), value: z.number().int().min(0).max(999),
  authorize: { read: isParticipant, write: isPresenter },
})

// app/state/meeting.ts
export const meeting = defineState('meeting', () => {
  const deckId = state<string | null>(null)
  const slide = deckSlide.connect(() => deckId.value ? { key: deckId.value } : skip)  // State<number> & { status }
  return {
    deckId, slide,
    next() { slide.value += 1 },          // optimistic locally, sent, LWW on the server, echo reconciles
  }
})
```

- **A write** is an optimistic local value plus a send. The server's echo (or a newer value) replaces it. A rejected
  write (`authorize.write` fails) reverts the box and sets `slide.error`.
- **Lifetime** follows the scope, so a presenter's slide subscription survives tab switches inside the app (the v3
  lesson).

---

## 4. The agent design language

### 4.1 AGENTS.md: the rule block (7 lines)

```md
## App state
1. Shared client state: `app/state/<feature>.ts` → `export const cart = defineState('cart', () => { …; return { boxes, actions } })`. Inside, plain `state`/`derived`. Use it anywhere as `cart.count.value`, `cart.add(id)`. No provider, no selectors; a list row reads one entry with `lines.get(id)`.
2. Server data is never state. Read the query (`getCart.live()`), derive from it, change it with a `mutation` (`optimistic:` on its declaration for instant UI). State holds only what the server doesn't know: UI, drafts, filters, ids.
3. Persist: `state(init, { persist: { in: 'local' | 'session' | 'cookie' | 'idb', schema, version } })`. Changed the schema? `weft fix S003` bumps the version and adds the migration.
4. If a scope has actions that write a box, change that box only through them (binding it to an input is fine).
5. One feature per scope. Undo: `{ history: { limit } }` → `cart.$history.undo()`. Reset: `cart.$reset()`.
6. Tests get fresh state per `render()`; seed with `render(<App />, { state: { cart: { note: 'hi' } } })`.
7. Codes S001–S013 (`weft check --json`) explain every state mistake and fix most.
```

This is about 1.1 KB, inside the 8 KB AGENTS.md budget (PLAN §7).

### 4.2 Diagnostics: `S001`–`S013`

`S` is unused in the catalog today. The prefixes in use are W, T, P, R, X, D, N and PAY; agorix uses C/H/M/L only as
review severities. S-codes come from the compiler (static), `weft check` (lockfile and cross-file) and the dev
runtime (the same codes on throws).

| Code | Catches | Fix | Autofix |
|---|---|---|---|
| **S001** | A server object or array (from a `query`/`.live`/`stream`/`channel`/`sharedState` value), or a map, filter or spread of one, written into `state` (§3.1 table) | Reference the query and `derived` from it; store ids; `fold` for streams; `state.linked` for edits | **Yes** when the box has no other writer: replace it with the query reference or a `derived` |
| **S002** | A `defineState` handle read on the server outside a request owner: module scope of a server-reachable file, inside a cached `query.run` (shared scope), in timers after the response | Read it in a component, handler or `derived`; pass values as arguments into server code | No |
| **S003** | A persisted box's schema hash changed with no `version` bump, or a bump with no `migrate` for the previous version (`.weft/state.lock.json`) | Bump the version and write the migration | **Yes**: bumps `version` and scaffolds a typed `migrate[n]` stub from the locked schema |
| **S004** | A god scope: > 12 writable boxes or > 15 actions (guess), **or** a scope whose boxes and actions form ≥ 2 clusters that never touch each other (computed from the setup's read/write graph) | Split by feature; the message lists the clusters | **Assisted**: `weft fix S004 --preview` moves each cluster to `app/state/<name>.ts` and rewrites imports, as a diff to approve |
| **S005** | An imperative write (`.value =`, `.set`) outside the scope to a box that one of the scope's actions writes | Call the action (named in the message) or add one | **Yes** only when exactly one action performs that same write |
| **S006** | A `derived` that only rebuilds what it reads: a pick (`derived(() => ({ a: s.value.a, b: s.value.b }))`, the zustand-selector habit), `.map(x => ({ ...x, … }))` over a box or server value feeding a keyed list, or `$snapshot()` read reactively | Read the fields directly; keep items stable and read the changing field live (v3 Haiku vs Sonnet) | **Yes** for pure picks (inline the reads). The spread case suggests the per-field read |
| **S007** | Store-library idioms: imports of `zustand`, `redux`/`@reduxjs/toolkit`, `jotai`, `valtio`, `mobx`, `pinia`; `create(set => …)`; `useXStore(selector)`, `useShallow` | `defineState`; queries for server data | **Yes** for plain `create()` stores (state + actions, no middleware). `weft migrate zustand` handles the rest |
| **S008** | Persistence misconfigured: `persist` outside a `defineState`; an object or array without `schema`; `sync: 'tabs'` with `session`; cookie total > 3 KB; a `secret()` field; `persist` on a server-owned box | The message names the one fix | **Yes** for moving `persist` into the file's scope and for `session` → `local` |
| **S009** | Two scopes with the same name, or a setup cycle (A's setup reads B, whose setup reads A) | Rename; move the shared part into a third scope or into a `derived` read lazily | No |
| **S010** | A non-serializable value (function, class instance, DOM node, `Map`/`Set`/`Date` without a schema codec) in a box that is persisted or SSR-serialized | Add a codec to the schema, or mark the box `ssr: false` and leave it unpersisted | **Yes** for `Date`/`Map`/`Set` (adds the codec) |
| **S011** | `mutation({ optimistic })` updates a query whose tags its `invalidates` doesn't cover, so the overlay drops with no fresh base (flash-back) | Add the tag | **Yes** |
| **S012** | `state.linked` over a query, `.live` or `sharedState` value without `key`, so a refetch or poke clobbers in-progress edits | Add `{ key: () => src.value?.id }` | **Yes** when the source schema has `id` |
| **S013** | A `local`/`session`/`idb` persisted box read in SSR-rendered output (a flash of `init`, then the stored value) | `persist: { in: 'cookie' }` if small, an explicit `ssr:` value, or render it client-only | **Yes**: switches to `cookie` when the schema's max size fits the budget |

**Relation to existing codes:**
- **W030:** unchanged in meaning. Its fix text becomes "wrap in `defineState`", with an autofix.
- **W004 and W056** (watch copies) overlap S001 for server sources. Precedence: **S001 wins** for server values,
  because its fix (reference the query) is the better one.
- **W052** (hand-rolled folds) stays for streams.

### 4.3 Why the language stays the same

- **No new nouns in components.** A component sees `cart.count.value` and `cart.add()`: a box and a function, the
  same two things it sees in its own setup.
- **The same diagnostic contract:** stable code, one line of why, an autofix where it can't change meaning, served
  by `weft check --json` and MCP.
- **The same inspection surface:** `weft browser state` is `weft browser snapshot` filtered to scopes.

---

## 5. Scaling: no selectors, slices by feature, lazy scopes, memory

### 5.1 The selector-free claim, with numbers

Take the v3 shop at 150 products: each `ProductRow` shows "In cart: N" and the header shows the count. Then three
interactions:

| Interaction | weft (`cart.qtyOf(p.id)` in each row's JSX) | zustand (`useCart(s => s.lines[p.id] ?? 0)` per row) |
|---|---|---|
| Type 3 chars in the cart note | **0 row bindings re-evaluated**; 3 text writes in the textarea. Rows read `lines`, not `note` | Every subscribed component's selector runs on each `set`: 150 rows + header + drawer = **~152 selector calls per keystroke**. The re-renders are skipped because the selector returns the same primitive |
| Add one product | 150 row bindings re-evaluate (each reads `lines`); **1 DOM write** (the changed row) + 1 (header count) | ~152 selector calls; 2 component re-renders |
| A price push (`.live`) | Only bindings reading the changed row's price: **1 DOM write** (the §3.7 budget) | Server data is in TanStack Query, so rows using `useQuery` with `select` run their selectors; correct with `select`, a full list re-render without it |

- weft's cost model is "work ∝ readers of the box that changed". zustand's is "work ∝ subscribers of the store,
  for every change to any field". The usual answer, splitting into many small stores, is the slicing agents don't do
  unprompted (v3: one `App` held everything).
- When 150 cheap re-evaluations matter (10k rows), `derived.map(lines, id)` hands out per-key `Derived`s that fire
  only when that key's value changes. That is an optimisation API, not a correctness one, and a `toTouchAtMost` gate
  is how you'd find you need it.
- **Equality:** a binding that re-evaluates to the same primitive writes nothing to the DOM, so no equality function
  is ever user code.

### 5.2 Splitting by feature

- One scope per feature file: `cart`, `filters`, `session`, `editor`. A scope may read another, which is just a box
  read.
- **S004** catches the v3 `App` shape before it grows. On the v3 Sonnet Solid `App`, the cluster analysis would find
  three clusters that never touch: {tab}, {search, category, sort}, and {cart, addedPrices, the server-copied
  prices}. The third is also S001.
- There's no "root store". `weft browser state` lists scopes, so the overview a root store gave you is a CLI command.

### 5.3 Lazy scopes per route

- A scope is code-split with whoever imports it. `app/state/editor.ts` imported only by `routes/editor.tsx` lands in
  that route's chunk.
- Setup runs on first read, so a scope costs nothing until a route touches it.
- `keep: '5m'` for heavy route-scoped state (an editor's undo history) disposes the instance after the last reader
  leaves. Persisted boxes reload on return; history doesn't (by design).

### 5.4 Memory

| Holder | Bound |
|---|---|
| Scope instance | `keep`; refcounted readers |
| History | `limit` entries of patches (default 100 when enabled) |
| Dev action log | 500-entry ring; stripped in prod |
| Query references | Released with the scope; then the cache's `keep` |
| Persisted writes | One pending write per key |
| Server | Per-request instances die with the request; S002 stops handles escaping it |

---

## 6. Plugins

| Candidate slot | Verdict | Reason |
|---|---|---|
| **`state.persist@1`** (keyed by backend name; sides `client`, `native`) | **Yes** | It passes 13 §5's "two real providers" rule. Web needs `local`/`session`/`cookie`/`idb`/`opfs`, and native needs MMKV/UserDefaults and Keychain-backed secure storage (5b). Built-in defaults are `local`, `session`, `cookie`, `memory` and `idb` (a lazy chunk). Providers: `@weft/plugin-persist-opfs` and `@weft/plugin-device-storage` (native). Conformance: round-trip, quota errors, corrupt payloads, the async-ready contract and `pagehide` flush |
| **`state.sync@1`** | **No** | Tab sync is ~0.4 KB over `tabs.channel` with one semantics, and alternatives would only add conflict models. Server sync is `query`/`mutation`/`sharedState` on weft's protocol |
| **`cache.sync@1`** (Later) | **Reserve the id** | Sync engines (Zero, Electric, TanStack DB, Legend sync) answer "server data on the client", which is the **query cache's** job. A provider would feed cache entries and accept mutations, so app state never learns a sync engine exists. This keeps §3.1's line intact when local-first arrives (PLAN §10 keeps it out of v0) |
| **`state.devtools@1`** | **No** | Devtools are weft's own CLI and overlay. A Redux DevTools bridge, if wanted, is a dev-only package reading the action log, not a slot |

Using `persist: { in: 'opfs' }` with no provider is **P101** at the user's line, with the "add the plugin" autofix,
exactly as 13 §2.6 specifies.

---

## 7. API reference (weft style) and the comparison

### 7.1 Types

```ts
// weft
export function defineState<Name extends string, T extends ScopeShape>(
  name: Name,
  setup: () => T,
  options?: { keep?: 'app' | Duration; history?: { limit: number } },
): ScopeHandle<Name, T>

type ScopeShape = Record<string, State<any> | Derived<any> | Resource<any> | ((...a: any[]) => any)>
type ScopeHandle<N, T> = T & {
  readonly $name: N
  $reset(): void
  $snapshot(): Readonly<Snapshot<T>>
  $history: History                                   // typed `never` unless options.history is set
}

interface StateOptions<T> {
  persist?: 'local' | 'session' | 'cookie'            // primitives only
    | { in: PersistBackend; schema: StandardSchema<T>; version?: number; migrate?: Record<number, (old: any) => unknown> }
  sync?: 'tabs'
  history?: false
  ssr?: false                                          // never serialized into the SSR payload
}
export function state<T>(init: T, options?: StateOptions<T>): State<T> & { persist?: { ready: Derived<boolean> } }

// weft/server, client side of a mutation declaration
interface MutationDef<I, O> {
  optimistic?: (call: { input: I }, cache: OptimisticCache) => void
  offline?: 'queue'                                    // Later
}
interface OptimisticCache {
  update<A, R>(q: Query<A, R>, args: A, recipe: (draft: Draft<R>) => void): void
  isOptimistic(row: object): boolean
}
```

### 7.2 A guest cart (local-first, persisted, multi-tab)

```ts
// app/state/guest-cart.ts: no account, nothing on the server until checkout
export const guestCart = defineState('guestCart', () => {
  const lines = state<Record<string, number>>({}, {
    persist: { in: 'cookie', schema: z.record(z.string().max(36), z.number().int().min(1).max(99)), version: 1 },
    sync: 'tabs',
  })
  const products = listProducts.live({})                                  // prices and stock from the server
  const items = derived(() =>
    (products.value ?? []).filter(p => lines.value[p.id]).map(p => ({ product: p, qty: lines.value[p.id] })))
  const count = derived(() => Object.values(lines.value).reduce((n, q) => n + q, 0))
  const stockOf = (id: string) => products.value?.find(p => p.id === id)?.stock ?? 0
  return {
    lines, items, count,
    add(id: string) { lines.set(d => { d[id] = Math.min((d[id] ?? 0) + 1, stockOf(id)) }) },
    remove(id: string) { lines.set(d => { delete d[id] }) },
  }
})
```

- **S006?** No. `items` builds `{ product, qty }` pairs, which is computation rather than a pick, and `product`
  keeps the cache's identity, so the keyed list updates rows in place. The rule targets `{ ...p }` spreads of the
  item that is keyed.
- **S001?** No. `lines` holds ids and quantities. Products stay in the cache.

### 7.3 Tests

```ts
import { render, user, clock, server, storage, tabs, scope } from '@weft-js/core/test'

test('optimistic add rolls back only the failed call', async () => {
  server.use(getCart, () => cartWith({ apple: 2 }))
  server.use(setLine, ({ input }) => input.qty === 4 ? fail('conflict') : ok(), { latency: '200ms' })
  const app = render(<App />)
  const inc = app.getByRole('button', { name: 'Increase apple' })
  await user.click(inc); await user.click(inc)                  // sends 3, then 4
  expect(app.getByTestId('qty')).toHaveText('4')                // both overlays applied
  await clock.advance('200ms')
  expect(app.getByTestId('qty')).toHaveText('3')                // only the failed layer dropped
  expect(app.getByRole('alert')).toHaveText(/couldn't update/i)
})

test('guest cart survives reload and syncs across tabs', async () => {
  const shared = storage.memory()
  const a = render(<App />, { storage: shared })
  await user.click(a.getByRole('button', { name: 'Add apple' }))
  const b = tabs.open(<App />)                                  // second app instance, same storage and channel
  expect(b.getByTestId('cart-count')).toHaveText('1')
  await user.click(b.getByRole('button', { name: 'Add pear' }))
  expect(a.getByTestId('cart-count')).toHaveText('2')
  a.reload()
  expect(a.getByTestId('cart-count')).toHaveText('2')
})

test('migration keeps v1 carts', () => {
  const s = storage.memory({ 'weft:shop:guestCart.lines': { v: 0, data: [{ id: 'apple', qty: 2 }] } })
  expect(scope(guestCart, { storage: s }).count.value).toBe(2)
})
```

### 7.4 The same feature in zustand + TanStack Query

The same cart: drawer state, a session-persisted note, a server cart, an optimistic `setLine` with correct
concurrent rollback, checkout, and SSR-safe instances. Client code only. The API routes for `getCart`/`setLine` are
needed in both stacks and are not counted. This is the idiomatic code an agent would have to produce, following each
library's own docs.

```tsx
// store/cart-ui.ts
import { createStore } from 'zustand/vanilla'
import { devtools, persist, createJSONStorage } from 'zustand/middleware'

type CartUi = { open: boolean; note: string; toggle(): void; setNote(n: string): void; reset(): void }

export const createCartUi = () =>
  createStore<CartUi>()(
    devtools(                                                    // must wrap persist, not the reverse
      persist(
        set => ({
          open: false,
          note: '',
          toggle: () => set(s => ({ open: !s.open }), undefined, 'cart/toggle'),
          setNote: note => set({ note }, undefined, 'cart/setNote'),
          reset: () => set({ open: false, note: '' }, undefined, 'cart/reset'),
        }),
        {
          name: 'cart-ui',
          storage: createJSONStorage(() => sessionStorage),
          partialize: s => ({ note: s.note }),                    // don't persist `open`
          version: 1,
          skipHydration: true,                                   // avoid the SSR hydration mismatch
        },
      ),
      { name: 'cart' },
    ),
  )

// store/cart-ui-provider.tsx
const CartUiContext = createContext<ReturnType<typeof createCartUi> | null>(null)

export function CartUiProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createCartUi)                        // one store per request / per app
  useEffect(() => { store.persist.rehydrate() }, [store])
  return <CartUiContext.Provider value={store}>{children}</CartUiContext.Provider>
}

export function useCartUi<T>(selector: (s: CartUi) => T): T {
  const store = useContext(CartUiContext)
  if (!store) throw new Error('useCartUi must be used inside CartUiProvider')
  return useStore(store, selector)
}

// queries/cart.ts
const cartKey = ['cart'] as const

export function useCart() {
  return useQuery({ queryKey: cartKey, queryFn: () => api.getCart(), staleTime: 30_000 })
}

export function useSetLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['cart', 'setLine'],
    mutationFn: (v: { productId: string; qty: number }) => api.setLine(v),
    onMutate: async v => {
      await qc.cancelQueries({ queryKey: cartKey })
      const prev = qc.getQueryData<Cart>(cartKey)
      qc.setQueryData<Cart>(cartKey, old => old && {
        lines: v.qty === 0
          ? old.lines.filter(l => l.productId !== v.productId)
          : old.lines.map(l => (l.productId === v.productId ? { ...l, qty: v.qty } : l)),
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(cartKey, ctx.prev) },   // still restores a stale snapshot
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ['cart', 'setLine'] }) === 1) qc.invalidateQueries({ queryKey: cartKey })
    },
  })
}

export function useCheckout() {
  const qc = useQueryClient()
  const store = useContext(CartUiContext)!
  return useMutation({
    mutationFn: (note: string) => api.placeOrder({ note }),
    onSuccess: () => {
      store.getState().reset()
      qc.invalidateQueries({ queryKey: cartKey })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

// hooks/use-cart-totals.ts
export function useCartTotals() {
  const { data } = useCart()
  return useMemo(() => {
    const lines = data?.lines ?? []
    return {
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      total: lines.reduce((s, l) => s + l.qty * l.price, 0),
      qtyOf: (id: string) => lines.find(l => l.productId === id)?.qty ?? 0,
    }
  }, [data])
}
```

It is also still subtly wrong. A failed first mutation restores `prev`, a snapshot taken before a second, still
pending mutation, so the second's optimistic change vanishes until the refetch. Fixing that properly means dropping
the snapshot and leaning on invalidation. The `{ ...l, qty }` spread also gives the changed line a new identity,
which is harmless in React and is the v3 regression in Solid. Not shown: `QueryClientProvider`, `CartUiProvider` in
the root, and SSR `dehydrate`/`HydrationBoundary`.

### 7.5 Count

Lines are non-blank, non-comment lines of the client code above. Concepts are the distinct APIs or rules an agent
must know to write it correctly.

| | weft | zustand + TanStack Query |
|---|---|---|
| Client lines | **24** (`app/state/cart.ts`) + 9 in the `optimistic` field | **91** in 4 files with imports and types (85 shown above, which omits them), plus root providers |
| Files | 1 (+ the mutation declaration it already had) | 4 (+ root) |
| Concepts | **7**: `defineState`, `state`, `derived`, `persist`, `query.live`, `mutation.optimistic`, `cache.update` | **23**: `createStore`, `set`, `getState`, selectors, `useStore`, `devtools`, its action-name argument, middleware order, `persist`, `createJSONStorage`, `partialize`, `version`, `skipHydration`/`rehydrate`, context provider, `QueryClient`/provider, `useQuery`/`queryKey`/`staleTime`, `useMutation`, `onMutate`, `cancelQueries`, `getQueryData`/`setQueryData`, rollback context, `onSettled`, `isMutating`, `invalidateQueries`, `useMemo` |
| Ways to get it subtly wrong that no test sees | `optimistic` that disagrees with the server (shown as a flash on settle; S011 for the tag case) | middleware order, missing `useShallow`, a stale snapshot in rollback, invalidation flicker without `isMutating`, a global store in SSR, a hydration mismatch without `skipHydration`, spread identity |

---

## 8. Evaluation plan: three new tasks

These go in `evals/tasks-v4/`, in the v3 format: a multi-file starter, sequential tickets, visible tests, cumulative
hidden tests and a probe. They target **shared-state** failure modes that v1–v3 couldn't see:
- v3's API had no cache, so server data *had* to be copied;
- nothing persisted;
- nothing ran on a server.

Baselines: React 19 + the agent's choice of library (prompt: "use whatever state library you'd normally use"), and
Solid 1.9. weft joins in Phase 1 (task 1), and in Phase 3 (tasks 2 and 3). Metrics: hidden pass/fail per ticket,
tools/turns/time, lines, concepts (distinct imports), and probe counts.

### 8.1 `v4-cart-persist` (persistence, migration, multi-tab)

**Starter:** the v3 shop with a guest cart in memory. The fake API has `listProducts()` and a
`checkout(lines)`.

**Tickets:**
1. The cart survives a reload.
2. The cart stays in step across open tabs.
3. "We renamed `qty` to `quantity` in the cart format. Existing shoppers must keep their carts."

**Traps:**
- Persisting product objects, so prices go stale. That is server data in storage.
- The `storage` event, which fires only in other tabs, giving double or missing updates.
- Dropping old data on a format change (zustand's default).
- A hydration flash.

**Hidden-test sketch:**
```ts
test('t1 reload keeps lines and uses current prices', async () => {
  const s = fakeStorage()
  const a = mount(App, { api: fakeApi({ apple: 1.0 }), storage: s }); await addTwice(a, 'apple')
  const b = mount(App, { api: fakeApi({ apple: 1.5 }), storage: s })        // reload with a new price
  expect(b.qty('apple')).toBe(2); expect(b.total()).toBe('$3.00')            // trap: persisted product objects → $2.00
})
test('t2 two tabs converge, no double-apply', async () => {
  const net = fakeTabs()                                                     // shared BroadcastChannel + storage events
  const [a, b] = [mount(App, { tabs: net }), mount(App, { tabs: net })]
  await a.add('apple'); await b.add('apple'); await net.settle()
  expect(a.qty('apple')).toBe(2); expect(b.qty('apple')).toBe(2)            // trap: storage-event echo → 3, or LWW → 1
})
test('t3 old-format carts survive', () => {
  const s = fakeStorage(legacyPayloadFromStarter({ apple: 2 }))              // whatever key/shape the starter wrote
  expect(mount(App, { storage: s }).qty('apple')).toBe(2)
})
test('t3 corrupt payload does not crash', () => { … expect(app.count()).toBe(0) })
```
**Probe:** first-render cart badge value with SSR off/on. The flash counts as a defect for task 3 parity.

### 8.2 `v4-optimistic` (server cache, optimistic updates, concurrent rollback, live pokes)

**Starter:** a todo app with a fake server offering `listTodos`, `toggleTodo`, `renameTodo` and `subscribe(tags)`
(pokes). Latency and failures are controllable from tests. TanStack Query (React) and `createResource`/actions
(Solid) are preinstalled, so the cache exists this time.

**Tickets:**
1. Toggling and renaming feel instant.
2. If the server rejects a change, undo just that change and say so.
3. Other users' changes appear live, without disturbing what you're typing.

**Traps:**
- Copying `listTodos` into a store "to make optimistic easy" (S001).
- Snapshot rollback clobbering a concurrent mutation.
- A poke refetch overwriting a pending optimistic value, or the rename field being edited.
- A spread identity that rebuilds rows.

**Hidden-test sketch:**
```ts
test('t1 instant', async () => {
  srv.latency('500ms'); await user.click(toggle('Buy milk'))
  expect(checked('Buy milk')).toBe(true)                                     // before the server answers
})
test('t2 concurrent: only the failed change rolls back', async () => {
  srv.failNext('toggleTodo', { id: 'a' }); srv.latency('300ms')
  await user.click(toggle('a')); await user.click(toggle('b'))
  await clock.advance('300ms')
  expect(checked('a')).toBe(false); expect(checked('b')).toBe(true)          // trap: snapshot restore → b false
  expect(alert()).toMatch(/couldn't/i)
})
test('t3 poke during pending mutation does not flicker', async () => {
  srv.latency('300ms'); await user.click(toggle('a'))
  srv.poke('todos'); await clock.advance('50ms')                             // refetch returns the pre-mutation row
  expect(checked('a')).toBe(true)                                            // trap: refetch clobbers the overlay
})
test('t3 typing survives a remote rename', async () => {
  await user.type(renameField('a'), ' today'); srv.remote.rename('b', 'X'); srv.poke('todos')
  expect(renameField('a')).toHaveValue('Buy milk today')
})
```
**Probe:** DOM mutations for one toggle (≤ 2), and for a rollback (≤ 2). The probe also reports whether server rows
were copied into client state, by searching for store writes of `listTodos` results.

### 8.3 `v4-ssr-isolation` (per-request state, hydration)

**Starter:** the shop with a server entry (`renderToString`-style for React; Solid's `renderToStringAsync`), a fake
session per request, and a "Signed in as …" header plus a per-user "recently viewed" list kept in shared state.

**Tickets:**
1. Server-render the page so the header and recently-viewed list appear in the first HTML.
2. The client takes over without a flash or a second fetch.

**Traps:**
- A module-level store (zustand `create`, a Solid module signal) shared by concurrent requests.
- Hydration mismatch.
- Refetching on the client what the server already sent.

**Hidden-test sketch:**
```ts
test('t1 concurrent requests never see each other', async () => {
  const slow = fakeDb({ latency: { alice: '50ms', bob: '10ms' } })
  const [ha, hb] = await Promise.all([render(req('alice'), slow), render(req('bob'), slow)])   // interleaved awaits
  expect(ha).toContain('Signed in as alice'); expect(ha).not.toContain('bob')
  expect(hb).toContain('Signed in as bob');   expect(hb).not.toContain('alice')
})
test('t1 a third request after both starts clean', async () => {
  await render(req('alice')); const h = await render(req('anon'))
  expect(h).not.toMatch(/alice|Recently viewed: \w/)                         // trap: module store persists across requests
})
test('t2 hydrate without mismatch or refetch', async () => {
  const html = await render(req('alice')); const net = spyFetch()
  const errors = await hydrate(html)
  expect(errors.hydrationMismatches).toBe(0); expect(net.calls('/recent')).toBe(0)
})
```
**Probe:** server memory after 1,000 sequential anonymous requests. Growth points to a module-level store
accumulating state.

**Expected signal.** On v1–v3, correctness didn't separate frameworks. These tasks are chosen where the *library
choice* decides correctness: zustand's default `create` is the SSR bug, snapshot rollback is the concurrency bug,
and the default persist version handling is the migration bug. If agents pass all three in React too, the case for
§3–§4 falls back to lines, concepts and the probe (§7.5). That is still the v3 conclusion's shape.

---

## 9. PLAN integration

### 9.1 Decision log (amend §12; don't replace)

> - **No `store`, and `defineState` is not one** (2026-10-28). Shared client state is `defineState(name, setup)`: a
>   named setup scope that returns ordinary `state`/`derived` boxes and functions. It adds a lifetime (per tab, per
>   request, per test) and a name (devtools, persistence keys, undo), never a second way to hold a value. Server data
>   stays in the query cache. Copying it into state is S001. Optimistic updates are overlay layers on the cache,
>   declared on the `mutation` ([14](14-app-state.md)).

### 9.2 Section-by-section changes

| PLAN § | Change |
|---|---|
| §3.1 | Add the `defineState(name, setup, { keep, history })` row. Add `state(init, { persist, sync, history, ssr })` to the `state` row. Extend `state.linked` with `{ key }` and `.conflict` |
| §3.2 | Add the §4.1 block as AGENTS rule 8 (or the App state section) |
| §3.5 | Add S001–S013. Change W030's fix to "wrap in `defineState`" (autofix) |
| §4 | `mutation({ optimistic })` and `cache.update`; `skip` for conditional args; `mutation.pending`/`.error` |
| §4.2 | Remove `storage(key, schema)` from `@weft-js/core/browser` (replaced by `persist`). `tabs.channel` gains the internal `weft:state` channel |
| §4.2 / 07 | `sharedState(…).connect()` returns a `State<T>` box |
| §7b | `weft browser state [--json]`, `state goto/undo/redo`, `set <scope.box>`; the recorder logs actions |
| §7c / 13 slot table | Add `state.persist@1` (keyed; client, native). Reserve `cache.sync@1` (Later) |
| §8 | No new package. `defineState`, `persist` core and history go in `weft`; `optimistic`, the overlay cache and SSR state transfer go in `start`; `@weft/plugin-persist-opfs` and `@weft/plugin-device-storage` are plugins |
| §10 | The offline mutation queue stays out of v0 (design fixed in §3.5). Sync engines are reserved as `cache.sync@1` |
| §10b | Add the v3 observation: every session held server data in client state and hoisted 7–8 boxes into `App` |

### 9.3 Phase placement

| Phase | Ships |
|---|---|
| **1. Core** | `defineState` (client instance, `keep`, names, `$reset`, `$snapshot`), actions as transactions, `history`, `persist` with `local`/`session`/`memory`, the lockfile, `@weft-js/core/test` `render({ state, storage })`, `scope()`, `app.reload()`. S003–S010 (S001 static patterns that don't need server types: `state(await …)`, `watch` copies). `weft browser state` (read-only) |
| **1b. Verify loop** | Time travel over the action log, the graph overlay labels, the recorder's action lane. Eval task `v4-cart-persist` (client half) |
| **2. UI** | The `state.persist@1` slot formalised with the plugin API. `idb` built in; `@weft/plugin-persist-opfs` |
| **3. Start** | Per-request instances, the SSR state payload, the `cookie` backend, S002, S013, `mutation({ optimistic })` overlays + rebase, S011, S001 with server-value taint, `state.linked({ key })` + S012. Eval tasks `v4-optimistic` and `v4-ssr-isolation` on weft |
| **3b. Channels** | `sync: 'tabs'` (with `tabs.channel`), `sharedState.connect()` as a box, multi-tab tests (`tabs.open`) |
| **6b. Native** | `@weft/plugin-device-storage` (MMKV/UserDefaults, Keychain/Keystore for `secret()` fields) |
| **Later** | `offline: 'queue'`, the `weft_mutations` dedupe table, `mutations.failed`; `cache.sync@1` providers |

### 9.4 Budgets (add to §3.7; all guesses until measured)

| Piece | Budget (brotli) |
|---|---|
| `defineState` + action wrapper + `$reset`/`$snapshot` | ≤ 0.5 KB |
| `history` (patch log) | ≤ 0.4 KB, only when a scope enables it |
| `persist` core (envelope, migrate chain, `local`/`session`/`cookie`) | ≤ 0.6 KB |
| `idb` backend | ≤ 0.8 KB, lazy chunk |
| `sync: 'tabs'` | ≤ 0.4 KB |
| Optimistic overlays (in the `start` client cache) | ≤ 0.5 KB |
| Devtools names, action log, time travel | 0 KB in prod (dev-only, stripped; the §3.7 byte-identical check covers it) |
| Unused | 0 KB: everything above is tree-shaken when not imported or not enabled |

The DOM-work budget is unchanged. `v4-optimistic` adds `toTouchAtMost(2)` for a toggle and for a rollback.

### 9.5 Risks

- **"The handle resolves per request" reads as magic.** *Mitigation:* the rule fits in one sentence ("one instance
  per app: tab, request or test"), it never changes meaning, and the one ambiguous case throws S002. If evals show
  confusion, fall back to an explicit `cart()` call returning the instance. That is a one-character API change.
- **S001 false positives** (a legitimate snapshot of a server object). *Mitigation:* primitives are exempt, and
  `untrack(() => structuredClone(x))` documents intent. Measure the S001 fire rate against human review on eval
  output before making it an error by default; ship it as a warning in Phase 1 if it's noisy.
- **S005's binding exception** is a loophole (a component can write an action-owned box through a `State` prop).
  *Mitigation:* it is the documented two-way path. The devtools action log shows such writes as `bind:<Component>`,
  so they stay visible.
- **Optimistic predictions diverge from the server** (computed fields, server ordering). *Mitigation:* the
  single-flight refresh lands in the same flush as the layer drop, so the correction is one frame. Dev mode logs
  "overlay mismatch on settle" with a diff.
- **The `$` names collide with user habits** (Pinia's `$patch`, `$subscribe`). *Mitigation:* only three are
  reserved, and anything else `$`-prefixed is a type error with "did you mean". `$patch` maps to "write an action".
- **Persisted data outlives its code.** Renaming a scope or box changes the key. *Mitigation:* the lockfile notices
  a key disappearing and a new one appearing with the same schema hash, and S003 offers `renamedFrom` instead of
  silently orphaning user data.
- **Cookie persistence bloats every request.** *Mitigation:* a 3 KB app-wide cap (S008), and `cookie` only for
  values the first paint shows.
- **Cross-tab LWW loses a concurrent same-path edit.** That's accepted for client-only state. Anything that must
  merge belongs on the server (`mutation`, `sharedState`).
- **The eval may show no gap,** as v1–v3 did. *Mitigation:* §8 is designed so that the gap, if any, is visible.
  Without one, the case rests on §7.5's 24 vs 91 lines and 7 vs 23 concepts, and the probe.

---

## 10. Is it worth it?

| Piece | Verdict |
|---|---|
| `defineState` as a named setup scope (no new container) | **Yes.** It is the smallest thing that fixes SSR leaks, test isolation and naming, and it keeps §12 |
| Actions as plain returned functions, wrapped as transactions | **Yes.** Undo, devtools and the recorder come free; there are no reducers |
| S001 + "server data never in state" | **Yes, the most important piece.** It is the one failure every v3 session shared |
| `optimistic` on the mutation with layered, rebased overlays | **Yes.** It is shorter than every library compared and removes a documented race |
| `persist` with schema, versions and the lockfile (S003) | **Yes.** It replaces `storage()`, and silent data loss becomes a build error |
| `cookie` backend | **Yes, small.** It is the only way to render persisted state correctly on the first byte |
| `history` per scope | **Yes, opt-in.** Patches make it cheap |
| `sync: 'tabs'` | **Yes, in 3b** with `tabs.channel` |
| `state.linked({ key })` + `.conflict` | **Yes.** `.live` makes the clobber bug a network event otherwise |
| `state.persist@1` slot | **Yes.** Native targets make the second provider real |
| `state.sync@1` slot | **No.** Sync engines feed the cache (`cache.sync@1`, Later) |
| A `store()` primitive or reducer store | **No.** It adds a choice and fixes nothing the eval measured |
| Offline queue | **Later**, designed now (§3.5) |

**Overall:** build it in Phase 1 (client half) and Phase 3 (server half). The user's zustand-level ergonomics come
from one helper and options on `state`. The "much smarter" part is the line between client and server state, held
by S001, the query cache and overlays, which no store library draws for you.

---

## 11. Phase 1 implementation (2026-10-29)

Built in `packages/weft` on branch `phase1-define-state`: `src/scope.ts` (`defineState`, app instances, `$reset`,
`$snapshot`), `src/history.ts` (`@weft-js/core/history`), `src/persist.ts` (`@weft-js/core/persist`), `src/memory.ts`, keyed reads and
state options in `src/index.ts`, and per-render apps in `@weft-js/core/test`. Tests: `test/state.test.tsx` (21),
`test/features.test.ts` (2), two new v3 budget tests, one `context` regression test. **(measured)** below means run for
this section on an M4 Max.

### 11.1 Keyed reads: `box.get(key)`

The open question from [16 §4](16-compiler-spike.md) (`cart[p.id]` re-runs every row) is settled with one method on
every box. `box.get(key)` reads one entry of an object box, and its reader re-runs only when `Object.is` says that
entry changed. Writes diff the entries that have readers, so the cost is O(watched entries) per write, and an
entry's source is dropped once nothing reads it.

| v3 app, 150 rows **(measured)** | add one | price push | hidden tests |
|---|---|---|---|
| reference (`cart[p.id]` from props) | 1 DOM · 452 re-runs | 1 DOM · ≤ 10 re-runs | 23/23 |
| cart in a scope, rows read `cart.line(id)` → `lines.get(id)` (`test/fixtures/v3-scope`) | **1 DOM · 5 re-runs** | 1 DOM · ≤ 10 re-runs | **23/23** |

Rejected: a box per key (two ways to hold a record), `select(box, key)` (a new noun that is `get` with an extra
argument), and deep tracking (proxies change identity, which breaks `===` and keyed lists). The agent rule is one
clause in AGENTS.md rule 1 (§4.1). A compiler hint that suggests `get` when a keyed list's row reads
`box.value[expr]` is proposed for the compiler track; it needs no types, since the list and the read are in one file.

### 11.2 Size, against §9.4's budgets

Measured **(measured)** as the brotli difference on top of a small rendered app (`render`, a `context`, one box),
production build:

| Piece | Budget (§9.4, guessed) | Measured |
|---|---|---|
| `defineState` + `$reset`/`$snapshot` + per-app instances | ≤ 0.5 KB | **0.77 KB** |
| `history` (with action transactions) | ≤ 0.4 KB | **+0.47 KB** |
| `persist` (local, session, memory; envelope, migrations, schema) | ≤ 0.6 KB | **+0.67 KB** |
| unused | 0 KB | 0 KB |
| Diagnostic text, dev names, S004/S009/S010 checks | 0 KB in prod | 0 KB in prod |

- **How 0 KB unused works:** `persist` and `history` are separate modules that register with the core. The `weft()`
  Vite plugin adds `import '@weft-js/core/persist'` / `import '@weft-js/core/history'` to app files that use the option, with a
  filtered transform hook on id and code (`persist:`, `history: {`). The package marks only those two modules as
  side-effectful. Without the plugin, using the option throws S008/S009 in dev with the one-line import as its fix.
- **Dev-only text:** every message is behind `DEV` (`import.meta.env?.DEV !== false`), which Vite folds to `false`, so
  production throws and reports carry no strings and `StateError` is dropped.
- The overshoot is 0.07–0.27 KB per piece. The v3 shop app with a `defineState` cart is 4.38 KB br in total against
  the 10 KB budget (`scripts/size.mjs`), so I'd raise §9.4's lines to the measured numbers rather than spend more on
  them now.

### 11.3 Where the implementation differs from §2

- **Scopes resolve through the owner's app.** A handle read inside a binding uses the app its owner was rendered in
  (a `context` set by `@weft-js/core/test`'s `render()`); outside any owner it uses the current app. Two apps rendered in one
  test therefore stay separate, but an event handler (which runs with no owner) uses the most recent app. On the
  client there is one app per tab, so this only matters in tests.
- **History stores each changed box's before and after values**, not patches. `.set(draft)` copies shallowly, so the
  values share structure and memory stays O(changed boxes) per step. Patches come with `sync: 'tabs'` (Phase 3b).
- **Async actions:** the transaction is the synchronous part. Writes after an `await` aren't named `cart.checkout#2`
  yet: they group per microtask as `<scope>.write`, like any write outside an action. Naming the later segments
  needs the compiler's async boundaries.
- **Actions are plain functions unless `@weft-js/core/history` is loaded.** The transaction wrapper only matters for undo
  steps, so it lives in that module.
- **Private persisted boxes need `name`** (`state(0, { persist: 'local', name: 'draft' })`) until the compiler hands
  the runtime dev names. Returned boxes are named by their key.
- **`@weft-js/core/test`'s `render(Comp, props, { state, storage, name })`** takes the component and props separately (the
  spike's signature), not JSX as §2.11 and §4.1 write it.
- **Not in Phase 1:** `cookie`/`idb` persistence and the S013/S002 server paths (with SSR, Phase 3); `sync: 'tabs'`
  (3b); `keep: '5m'`; the dev action log and `weft browser state`.

### 11.4 Diagnostics: what the runtime covers

| Code | Phase 1 runtime | Left for the compiler or `weft check` |
|---|---|---|
| S003 | stored payload fails its migrations or schema → `init`, payload kept at `<key>:corrupt`, reported; migrations without `version` throw | the lockfile (`.weft/state.lock.json`) and the autofix |
| S004 | > 12 writable boxes or > 15 actions, reported at instance creation | cluster analysis and `weft fix S004` |
| S005, S006, S007 | — | all static |
| S008 | object/array without a schema, a private persisted box with no `name`, an unknown backend, storage write failures | `persist` outside a scope (static), cookie budget, `secret()` |
| S009 | duplicate names, setup cycles, `$`-keys, `$history` without the option | — |
| S010 | a value JSON would change (Date, Map, class instance, function, NaN) is reported and not written | autofix (add the codec) |

### 11.5 Other fixes made on the way

- `@weft-js/core/dom` gained `addEvent`, which Solid's back end emits for a handler that isn't an inline function
  (`onClick={onAdd}`). The spike's app never used that form, so this is the first case of the helper-contract gap
  [16 §6](16-compiler-spike.md) item 3 predicted.
- `context().provide()` now disposes its subtree with its parent. Before, a provided subtree outlived an unmount, so
  its `watch` cleanups never ran (the v3 hidden test "none after unmount" caught it).

## Sources

- zustand 5.0.16 docs (repo `pmndrs/zustand`, `docs/`, read 2026-10-28):
  - Next.js guide ("should not be defined as a global variable", per-request store, provider):
    https://zustand.docs.pmnd.rs/learn/guides/nextjs.html
  - Slices (middleware only on the combined store): https://zustand.docs.pmnd.rs/learn/guides/slices-pattern.html
  - `useShallow`: https://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow.html
  - v5 migration (unstable selector outputs "may cause infinite loops", "Maximum update depth exceeded"):
    https://github.com/pmndrs/zustand/blob/main/docs/reference/migrations/migrating-to-v5.md
  - persist (`version` mismatch drops the stored value, `migrate`, `skipHydration`, async hydration, Next.js
    mismatch): https://github.com/pmndrs/zustand/blob/main/docs/reference/integrations/persisting-store-data.md
  - Advanced TypeScript (use `devtools` "as last as possible"):
    https://github.com/pmndrs/zustand/blob/main/docs/learn/guides/advanced-typescript.md
  - devtools (action names via the third `set` argument):
    https://github.com/pmndrs/zustand/blob/main/docs/reference/middlewares/devtools.md
- Redux Toolkit 2.13.0 / RTK Query, manual cache updates (`onQueryStarted`, `updateQueryData`, `patchResult.undo()`,
  the concurrent-undo race, cache as a reflection of server state):
  https://redux.js.org/toolkit/rtk-query/usage/manual-cache-updates
- Redux, deriving data with selectors ("always returns new references … force the component to re-render"):
  https://redux.js.org/usage/deriving-data-selectors
- TanStack Query, optimistic updates: https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
- TkDodo, concurrent optimistic updates (`isMutating({ mutationKey }) === 1`):
  https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query
- TanStack Store overview: https://tanstack.com/store/latest/docs/overview
- Jotai 3.0.1, Next.js guide (implicit global store, `Provider`, `useHydrateAtoms`): https://jotai.org/docs/guides/nextjs
  · migrating to v3 (`atomFamily` → `jotai-family`, `loadable` removed): https://jotai.org/docs/guides/migrating-to-v3
- Valtio 2.3.2 (reading the proxy in render "is not reactive"):
  https://valtio.dev/docs/how-tos/how-to-avoid-rerenders-manually
- MobX 7.1.3, React integration (`observer`, "the most common mistake", dereferencing):
  https://mobx.js.org/react-integration.html
- Pinia (docs for v3.x; npm `latest` is 4.1.0): core concepts (`defineStore` id, setup stores, `storeToRefs`, "must
  return all state properties"): https://pinia.vuejs.org/core-concepts/ · SSR (hydrate before `useStore()`, escape the
  serialized state): https://pinia.vuejs.org/ssr/
- Legend-State v3 beta, persist and sync (`syncObservable`, `synced`, `retrySync`, `changesSince`):
  https://legendapp.com/open-source/state/v3/sync/persist-sync/
- XState Store 4.x (`createStore`, `trigger`, `select` with equality, undo/redo, persist and reset extensions):
  https://stately.ai/docs/xstate-store
- Svelte 5 `$state` (exporting shared state from `.svelte.ts`): https://svelte.dev/docs/svelte/$state
- Zero custom mutators (optimistic client run, authoritative server run, "will be reverted"):
  https://zero.rocicorp.dev/docs/mutators · Replicache: https://doc.replicache.dev/
- Versions: `npm view` on 2026-10-28 (zustand 5.0.16, @reduxjs/toolkit 2.13.0, jotai 3.0.1, valtio 2.3.2, mobx 7.1.3,
  pinia 4.1.0, pinia-plugin-persistedstate 4.7.1, @legendapp/state 2.1.15 / 3.0.0-beta.48, @tanstack/store 0.11.2,
  @tanstack/query-core 5.105.0, @tanstack/db 0.15.2, @xstate/store 4.3.0, solid-js 1.9.17 / 2.0.0-rc.19, svelte
  5.57.3, @preact/signals-core 1.14.5, @rocicorp/zero 1.11.3, replicache 15.3.0, immer 11.2.9)
- weft: PLAN §2, §3.1–§3.5, §3.7, §4, §4.2, §7, §7b, §7c, §9, §10, §10b, §12 · research
  [01 §6](01-reactivity-landscape.md), [02 §3–§4](02-fullstack-and-t3.md), [07 §4, §6, §9](07-realtime-and-events.md),
  [13 §2.2, §2.6, §5](13-plugins.md), [agorix 03 §5, §7](agorix/03-server-realtime-data.md) · evals:
  [`v3-FINDINGS.md`](../../evals/results/v3-FINDINGS.md), [`v2-FINDINGS.md`](../../evals/results/v2-FINDINGS.md),
  `evals/results/v3-{haiku,sonnet,ref}/snapshots/*/t3/src/App.tsx` (box counts and server-data copies re-counted for
  this doc)
