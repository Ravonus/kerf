# 40. Shared UI state: `interaction()`, `ui`, `share`, one socket per client

Status: **spec plus a prototype, 2026-11-01.** Inputs: [32](32-channels.md), [35](35-multiplayer-and-packs.md),
[30](30-realtime.md), [14](14-app-state.md) §2.8, the merged warp redesign. §12 says what the prototype proves and what is
only written here. This note reverses two earlier refusals, on purpose: research 32 §1 and §10 ("cross-tab socket sharing")
and research 35 §1 ("a Web Locks leader tab"). They were v0 scope calls, and the leak they would now cost is real: a user
with eight tabs is eight sockets against `limits.connections: 10`.

The rule for everything below: **UI state is just state.** Three boxes, one option, one prop. If a feature needs a new
noun to explain it, it is out.

## 1. The API

```tsx
import { interaction } from 'weft/interaction'
import { Button, Checkbox } from '@weft/warp'

function TodoRow({ todo }) {
  const row = interaction({ share: `todo:${todo.id}` })   // drop `share` and nothing else changes
  const label = derived(() => (row.remote.value.hover ? 'someone is here' : ''))
  watch(() => row.hover.value, on => on && prefetch(todo.id))   // only ever this page's hover
  return (
    <li>
      <Checkbox ui={row}>{todo.title}</Checkbox>
      <Button ui={row} emphasis="soft">Open</Button>
      <small>{label.value}</small>
    </li>
  )
}
```

```ts
// src/realtime.server.ts: needed only to cross clients. Without it, panes and tabs work and the socket join is refused.
export default realtime({ share: ({ ctx, key }) => canSee(ctx.user, key) })
```

`Interaction` is `{ hover, focus, pressed, remote, attach }`.

| Field | Is | Written by |
|---|---|---|
| `hover`, `focus`, `pressed` | `State<boolean>` | real events, or any code. **This page only.** |
| `remote` | `Derived<{ hover, focus, pressed }>`, counts | the network only: other tabs plus other clients. Never who. |
| `attach` | an action, `(el) => { update, destroy }` | called by a component on its host. App code never calls it. |

**Concepts added, four:** `interaction()`, its `share` option, the `ui` prop, `realtime({ share })`.
A person who only wants hover state learns one. Removals are in §2.

### Deviation from the sketch, for the owner to confirm

The agreed sketch had `row.hover.value` true for a remote hover, "marked remote". This spec keeps remote out of that box
altogether and gives it a field of its own. The reason is the requirement beside it: remote hover "can't trigger local hover
logic or echo loops". With one box, every `watch(row.hover)` is a bug waiting for a second client, and every author has to
remember a flag. With two, it can't be written wrong: the outgoing effect reads only the local boxes and the network writes
only `remote`, so an echo has no path. The cost is that hand-drawn UI reads two things
(`row.hover.value || row.remote.value.hover`). warp does this for you, and same-page panes still share `hover` directly,
so "hovering either lights both" needs nothing.

## 2. What exists, and what happens to it

| Feature | Today | Decision |
|---|---|---|
| `sync: 'tabs'` | persisted box, LWW per key, own `BroadcastChannel` | **Keep the API.** It is durable data with conflict rules, not UI state. Move its channel onto the shared line once that exists; `weft/sync` must still work with no `@weft/start`. |
| `tabs.channel` (`tab()` in the brief) | typed `BroadcastChannel`, `weft/browser` | **Keep.** App messages between tabs, no server. Not on any route below. |
| `channel` | one socket per tab | **Keep the API, replace the transport**: its `SocketLink` becomes the leader link (§5.7). Same frames. |
| `sharedState` | a `channel` with `$set`, `$v`, `$?` | **Keep.** Gets the leader link for free. Stays the only home of shared *data*. Never mixed with UI state. |
| `topic` | server-side fan-out for streams | **Untouched.** No client half; the browser reaches it through a `stream`. |
| `@weft/multiplayer` presence, `Cursors` | a `channel` fragment, own throttle, peers by TTL | **Keep; its shape became the template.** `share` copies its answers: no server roster, ask and answer, TTL, volatile. Who-is-this and pointers stay there. `share` is anonymous on purpose. |
| `/_weft/rt` (SSE, `live`, `stream`) | one connection per tab | **Not touched by this spec, and it is the honest gap in "one client, one socket"** (§13, Q4). |

Removed:

- The per-tab socket path in `channel.ts`, replaced by one link with a fallback. `browser()`, `park`, `onVisibility`,
  `run` and `backoff` move into the link, so channels and `share` have one connection lifecycle rather than two.
- "Hover the panes myself": every `onPointerEnter` plus a box in app code.
- A separate way to light a warp component: `data-hold` already meant "active with no pointer", so `ui` adds no state to the kit.
- The `newest` option if §13 Q1 goes my way.

No public API is removed by this work: the removals are internal paths. I looked for a public one and each candidate has a
real job. Say so plainly rather than count a rename.

## 3. Layers

| Layer | Knows | Does not know |
|---|---|---|
| `@weft/ui-core` `interact(el, flags)` | DOM events; writes to anything with `.value` | weft, boxes, keys, networks |
| `@weft/warp` every component's `ui`, `@weft/warp/ui` | how to draw from any source (`data-hold`, `data-remote`) | where the state came from |
| `weft/interaction` | boxes, one row per key on a page | tabs, sockets |
| `@weft/start/share` | tabs, locks, the socket, routing | elements |
| `realtime({ share })`, `share` room | authorisation, stamping senders | hover; it carries three bits |

`weft` can't import `ui-core`, and a warp component must not import `interact`, or every Button pays. So they meet at seams,
the pattern `features.sync` set: a component calls `ui.attach`, a method on an object only an `interaction()` user has, and
`weft/interaction` delegates to `seams.attach` (set by `@weft/warp/ui`) and `seams.line` (set by `@weft/start/share`). The
`weft()` plugin injects those imports where `ui=` and `share:` appear, as it does `weft/sync`. Forgetting them in a non-plugin
build throws in dev with the fix.

Touch: `interact` ignores `pointerType === 'touch'` for hover, so `hover` stays false. `pressed` still works, and a phone
can still *show* a remote hover. Focus is `:focus-visible`, because that is what gets drawn. An element removed under the
pointer gets no `pointerleave`, so `destroy` releases; a hidden tab or `pagehide` releases; each flag counts its holders, so
one row bound to two elements falls only when the last lets go.

## 4. Routing

The route is not a choice, and not an option.

| Where | Route | Cost per change |
|---|---|---|
| Same page | the same object: one key, one row, refcounted | a box write. No events. |
| Same browser | one `BroadcastChannel`; every tab keeps every sibling's bits | one post per frame, per key |
| Other clients | the leader's socket, the OR of its tabs | one frame per 60 ms at most |

No relay exists between tabs: followers post on the channel the leader already hears, and the leader posts what it hears from
the socket. A tab is a pure function of `tabs` and `clients`, and the leader's socket is a pure diff against the same data
(`reconcile`), so a new leader runs the code an old one ran.

A "client" is what shares Web Locks: a browser profile on an origin. Two windows of one profile are one client. A private
window is another.

## 5. The leader protocol

Lock names and channel carry the build: `weft:ui:leader:<build>`, `weft:ui:tab:<build>:<id>`, `weft:ui:<build>`.

1. **Election.** Every tab calls `locks.request(leader, …)` with a promise that never settles. One gets it and opens the
   socket; the rest are queued, which costs nothing and needs no timer.
2. **Relay.** A tab posts `{ t: 'bits', tab, key, bits }`, once a frame. The leader ORs and sends. Inbound goes back out as
   `{ t: 'client' | 'gone' }`. A new leader posts `roll`, and every tab re-announces its keys.
3. **Handover.** The holder goes, the browser grants the next in the queue, it opens a socket. Nobody detects anything.
   What tabs hold is marked stale and stands for `GRACE` (1.5 s), which is why nothing flashes. The new leader joins and
   asks; holders answer; anything still stale after `GRACE` is dropped. Other clients see the old socket's `gone`, then the
   survivors re-say their bits, so a tab *hovering during a handover* does blink to others for a round trip. I accept that
   rather than add a server grace, which would be a stuck hover by design.
4. **Tab death.** Each tab also holds its own lock, taken before it posts anything, and siblings queue on it. It comes through
   when the tab is gone, crash included, so a dead sibling clears at once with **no heartbeat**. Taking it first matters: a
   watcher that got in early would read a live tab as dead.
5. **Stuck or frozen leader.** A leader in that state keeps its lock and answers nobody, so handover never fires. On a beat
   (5 s), or the moment it has something to send, a follower posts `ping`; no `pong` in 1.5 s and it requests with
   `{ steal: true }`. The old holder's request rejects when it next runs, and it stands down. Until then its socket is open:
   **two sockets, briefly, is the failure mode**, bounded by the server's 60 s idle close. A stolen-from tab rejoins the queue.
   Chrome's freezing heuristics look at Web Locks that block other work, so a queued leader lock should help keep a
   leader unfrozen ([freezing on Energy Saver](https://developer.chrome.com/blog/freezing-on-energy-saver)). The heuristic is
   not a promise, so `steal` stays. Discard needs no case: it is a tab death.
6. **Throttled tabs.** Socket and `BroadcastChannel` events are not timers, so a hidden leader relays fine at intensive
   throttling; only its beat slows, and receivers' TTL allows three. The current "park after 5 minutes hidden" becomes "park
   when *every* tab is hidden", so tabs have to post their visibility. Specified, not built, and the claim about hidden tabs is
   reasoned, not measured.
7. **Same link for channels.** The link offers `send(frame)`, `onFrame`, status, and takes the place of `browser()` in
   `channel.ts`, which already has a `SocketLink` seam. Three changes make that correct, and all three are on the server's
   side of a real bug if skipped:
   - Join and ack numbers must not collide. Top bits are the tab: `n = tab * 2^20 + i`. The leader routes replies by `n`
     with no table, and tracks only which joins to `l`eave when a tab dies.
   - `id`, `exceptSelf`, `to` and `left` are per *socket* today. Sharing one breaks them: a sibling is skipped by
     `exceptSelf`, and closing one tab fires `mp.gone` for a peer whose other tab is still there. So the server's
     handler `id` becomes `<k>.<tab>`, and `socket.ts` compares that.
   - The per-socket bucket (20/s) is now shared by all tabs. It must become per tab, with a per-socket ceiling.
   `share` itself avoids all three by being per client, so **none of this is proven by the prototype**.
8. **Offline.** `offline` drops the link at once (a closing socket's `close` event can take as long as it likes) and no dial
   happens until `online`. Past `GRACE`, `remote` is empty: stale presence is worse than none.
9. **Different builds.** Different lock, different channel, different socket. N builds, N sockets, each a separate client
   that still meets the others on the server. There is no version matrix because nothing crosses. Rollouts are short.
10. **bfcache.** `pagehide` posts `bye`, releases both locks, aborts the queue, closes the channel and socket;
    `pageshow` with `persisted` starts again with fresh ids. Chrome's handling of held locks is moving
    ([Mozilla's WPT sync](https://bugzilla.mozilla.org/show_bug.cgi?id=1989537)), hence releasing them rather than relying on it.
11. **No Web Locks.** Insecure origins have no `navigator.locks` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)),
    and private modes may differ. Fallback: **every tab is its own client**, which is exactly today, plus the channel. A tab
    tells siblings its connection id so the socket's copy of a sibling isn't counted twice, and tabs age out by beat. There is
    no `localStorage` election: a worse lock is a worse bug. Worst case is never worse than now.
12. **Service workers** are not required and not used. A `SharedWorker` would own the socket more neatly, but its mobile support has been uneven, and a second code path is what this note exists to
    remove.

## 6. Ephemeral semantics

- **Ownership.** A tab owns its bits. A client's are the OR of its tabs. Nobody writes another's.
- **Identity.** An opaque per-connection id, stamped by the server. The client never names itself.
- **Who sees what.** Everyone joined to a key sees that key's bits: hover 1, focus 2, pressed 4. Nothing else exists to see:
  no pointer position, no field content, no name. Your own client's other tabs count in `remote`, because to this page they
  are elsewhere.
- **Several hovers.** `remote.hover` is a count. warp draws lit once; an app can show the number.
- **Join snapshot.** Nothing is stored: a joiner `ask`s and holders `answer` only to it. No answers means nothing is held.
- **Leave.** `left` publishes `gone`, every entry of that id clears. If an instance dies, `left` never runs, so holders beat
  every 5 s while non-zero and receivers drop at 15 s. That 15 s is the worst stuck hover in the design, and it needs a server
  crash. Tab close, navigation, removal, crash of a tab and crash of a leader all clear immediately.
- **Throttle.** Same page: none. Tabs: one post per frame, per key, leading edge. Socket: one frame per 60 ms, latest wins
  per key, so a pointer crossing ten rows sends what's true when each frame goes out, not ten stories. The socket's 20/s bucket
  is why a frame here can't be one rAF: 60 a second is a close code. Cursors already chose 12/s for the same reason.
- **Server cost.** No stored state, no ring (`volatile`), and no bus message unless bits change. Idle cost of a key: its entry
  on the socket. Per key: `authorize` once a session window.

**In production `share` must batch.** The prototype makes one join per key, and a 200-row list would burn the bucket on mount.
Spec: one internal join per socket, `['u', add[], drop[]]`, `authorize` batched and cached for the session window, and hub
channels sharded by key hash (64) so bus subscriptions stay bounded while a client still only receives keys it joined.

## 7. Security and privacy

- **Default deny.** No `realtime({ share })` means cross-client joins are refused (R011). Tabs need no auth: a `BroadcastChannel`
  is same origin and same profile. `() => true` must be written out, like R001.
- **Per key.** `authorize({ ctx, key })` runs on join, and again at the session re-check and on `session:<user>` pokes, using the
  same machinery as `channel`. A `key` that encodes a tenant is checked by the app, not guessed by weft.
- **No identity by default.** Bits and an opaque id. The id is stable per connection, so peers can correlate one client across
  keys; only a joined peer can, and §13 Q5 offers per-key ids if that matters. Names belong to `@weft/multiplayer`, which is a
  decision someone made.
- **Hover is a behavioural signal.** What a user lingers on, in a shared document, is more than it looks. `share` is opt-in per
  element for that reason, and **docs must say so**. Focus in a sensitive form tells peers which field; warp must not share by
  default anywhere.
- **Spoofing.** The sender is stamped by the server. `bits` is validated 0–7, key at most 128 characters, `to` only routes.
- **Rate limits and abuse.** The existing per-socket bucket, plus per-key joins capped by `limits.subscriptions`. A flooding
  client hits R008 and only reaches keys it passed `authorize` for. Peers' `remote` is a count: a client can fake one hover, not
  a crowd, without opening connections, and `limits.connections` caps those.
- **Bug found:** research 32 §11 says "Rate limits close nothing"; `socket.ts` closes with 1008. One is wrong. The design needs
  the socket to survive, because now a burst from one tab would cost all of them.

## 8. SSR, hydration, islands

On the server `interaction()` returns inert boxes and registers nothing, so no key can leak between requests. All false,
`remote` zero, so server HTML has no `data-hold`, and hydration has nothing to reconcile. `attach` runs a microtask after mount
through warp's `use`, so hydration writes no attributes. If the pointer is already on an element at that moment, `:hover` is
read once, only under `(hover: hover)`, because `:hover` sticks after a tap.

Islands: one row per key per document, not per island, so two islands of one page share a box as panes do. Keeping the
registry module-level does that, provided all islands resolve one `weft/interaction`. An island that hydrates late joins late
and gets the snapshot. The share module loads with the first island that uses it. Tested only for a full page (§12).

## 9. Accessibility

- A remote state never touches `aria-*`, focus, or the accessibility tree: it is decoration. Nothing announces it.
- `focus` is never moved by a remote focus. `data-hold` draws a focus-like sweep but no focus exists, so screen-reader and
  keyboard users lose nothing and gain nothing, which is right.
- Keyboard press parity: `pressed` should follow Space and Enter on a button. Not built; one line in `interact`.
- `prefers-reduced-motion` is already handled: the sweep's duration goes to zero, and `data-hold` goes through the same switch.
- Colour alone must not carry `data-remote`. warp's draw is the sweep; a tint is optional.

## 10. Diagnostics and testing

**`weft check`:**

| Code | Catches |
|---|---|
| U001 | a `share` key with no stable part: `Math.random`, `Date.now`, `crypto.randomUUID`, an array index |
| U002 | a `share` key built from something user-typed (`location`, a form box, a `query`): the app is then authorising a string the user chose |
| U003 | `share` used with no `realtime({ share })`: works in tabs, silently stops at the socket (warning) |
| U004 | writing `remote`, or spreading a row's boxes into `state` |
| U005 | `share` inside a list without `key`: a reused component would keep the old row |

**The prototype hit W001 in its first line:** `` interaction({ share: `todo:${props.id}` }) `` fails to compile, because the key is
read once at setup. See §13 Q2. It's a real ergonomic bug in the approved one-liner.

**`weft/test`.** `tabs` already fakes `BroadcastChannel`. Add `net.ui(key, { hover: 2 })` as peers, `net.uiSent()`, and fake
`locks` so a `render()` can lead and a test can `tabs.kill(n)`. T012 covers an open line. Everything that needs real locks stays
a Playwright test in `packages/start/test`. Rule: never fake a lock in an e2e test.

## 11. Bundle cost

Brotli q11, production Vite, minified, a page with one Button and one Checkbox:

| Page | JS | Delta |
|---|---|---|
| `claude/site` | 4611 B | |
| This branch, no `ui` | 4666 B | **+55 B** |
| `ui={row}`, no `share` | 5762 B | +1096 B, once |
| `share` | 7989 B | +2227 B, once |

**"Zero bytes" is false as written:** about 27 B per component, for the `ui` branch and the ref. The owner should know the real
number. A compiler pass could drop it, and I don't recommend one for 27 B. `@weft/start` has `sideEffects: false`, which drops
a bare `import '@weft/start/share'` without a sound (the first measurement here did): the module must be listed.

## 12. Prototype: what it proves

Marked `PROTOTYPE` in each file: `packages/ui-core/src/interact.ts`, `packages/weft/src/interaction.ts`,
`packages/warp/src/ui.ts`, `packages/start/src/share.ts`, `share-server.ts`, the `ui` lines in `Button` and `Checkbox`, one
`[data-hold]` selector each in `warp.css` and `warp-components.css`, and the fixture route `/ui-state`. `socket.ts`, `hub.ts`
and `channel.ts` are unchanged: the socket path is a plain `channel` speaking the existing wire.

`packages/start/test/ui-state.browser.test.mjs`, on yuna-mbp (M3 Pro, load about 4), against a **dev server over loopback**:

| Latency, pointer event to `data-hold` written | n | p50 | p95 | max |
|---|---|---|---|---|
| Same page, across panes | 40 | ≤1 ms | 1 | 1 |
| Across tabs | 40 | ≤1 ms | 1 | 1 |
| Across clients, from the leader | 40 | 2 ms | 2 | 2 |
| Across clients, from a follower | 40 | 1 ms | 1 | 1 |

Timed with `Date.now()`, the one clock two renderers share, so these resolve to 1 ms, and the last two rows' order is noise.
They exclude paint (add up to a frame) and any real network (add a round trip). What they show is that weft adds no visible
latency, not what users will see.

| Sockets open | 1 tab | 2 | 4 | 8 |
|---|---|---|---|---|
| One client | 1 | 1 | 1 | 1 |

Handover (leader's `bye` to first frame on the new socket, survivor's clock, n=10): **p50 2.8 ms, max 6.5**, loopback. Leader
crash to row cleared everywhere: 8 ms. Stuck leader to remote hover: about 1.95 s (the 1.5 s pong wait, then a socket).

| Engine | Result |
|---|---|
| Chromium | 19 of 19 |
| Firefox | 16 of 16, 3 skipped (CDP crash, bfcache, measurement) |
| WebKit | 15 of 16, 3 skipped. **`offline` fails**: the remote hover doesn't clear. Not diagnosed. It ran on the busy Mac, because the build on yuna-mbp hung on launch. |

Tests: hover across panes, tabs and three clients; a late joiner's snapshot; warp's own `--_a` switch is 1 for a remote hover;
leader close with a watcher proving no flash; leader crash mid-hover (`Page.crash`); follower close mid-hover; an element
removed under the pointer; navigation mid-hover; echo (one in, one out: frames `[2, 0, 0]` across three clients, then
silence); a real `watch` not running for a remote hover; touch; offline; no Web Locks; two builds; newest tab; stuck leader;
a sweep over 40 rows under the socket limit. Screenshots: [same page](40-ui-state/1-same-page.png),
[tabs](40-ui-state/2-across-tabs.png), [clients](40-ui-state/3-across-clients.png).

**Proven:** the API shape on two components, zero server changes for the wire, one socket across 8 tabs, handover and both
clean-up paths, the echo argument, and the no-locks fallback with `navigator.locks` removed by script.

**Only specified:** batched joins; `realtime({ share })`; the leader link under `channel` and `sharedState`, with its three server
changes (§5.7), which is the riskiest thing left; visibility-aware parking; two instances behind a bus; islands; plugin injection;
`weft/test` fakes; `weft check` codes; every warp component beyond two.

`evals/compare/measure.mjs` was **not run**: nothing here is merged, and the only always-on change is the 55 B in §11. It must
run before this lands, per the repo's rule.

**Tried and not proven:**

- **bfcache.** With Playwright's disable removed, Chrome still didn't restore: `notRestoredReasons` says only `masked`, and the
  dev server's own socket is a likely cause. A reload path works. Restore is untested.
- **Freezing.** CDP's frozen state doesn't take on a visible headless page, so the test uses a stuck main thread: same symptom,
  not the same cause. A true freeze is untested.
- **Safari private mode.** Not run; `headless` WebKit isn't it. The fallback is proven by removing `navigator.locks`, not by
  meeting a browser without it.

## 13. Open questions, with my answers

1. **Keep "newest tab wins"?** It's approved and built (`newest`, 1 line). **Drop it.** It costs a socket per new tab, and stall
   stealing already fixes the case it was for. One less option.
2. **`share` with a prop (the W001 problem).** Accept a function, `share: () => `todo:${props.id}``, or have the compiler exempt
   the option? **Exempt it**, as warp's fixed-at-creation props are, and pair it with U005. A moving key means rejoin logic
   in the box, for a case `key` already covers.
3. **Does a tab of mine count as `remote`?** Yes. To this page it's elsewhere, and treating it as local would run hover logic for
   a hover in another window.
4. **`/_weft/rt`: is one client really one socket?** Not yet: an app with `live` queries holds one SSE per tab beside the shared
   socket. **Move rt onto the link next**, as poke and stream frames over the WebSocket, and drop the second transport.
   That is the largest removal available in this area, and it deserves its own note.
5. **Per-key opaque ids?** Not yet. Add them if an app needs unlinkable hovers; it's server-side and invisible to the API.
6. **Should `focus` be shared at all?** Yes, but warp must never default it on.
   If people find it invasive, `share` gains no option: they drop `share`.
7. **`pressed` over the network?** It's the least useful bit, at most a 100 ms flash. **Keep**: three bits, one code path, and a
   fourth rule ("all but pressed") would cost more than the feature.
8. **How does a `State`-typed `hover` behave if an app writes it?** It's drawn and shared. That is what "any source" means.
9. **Where does `data-remote` draw?** The kit needs one decision: same sweep plus an optional tint, I'd say. Design call.

## 14. Deliberately not added

A `presence` for UI state, names, avatars or colours on hover. Pointer position (`Cursors` has it). A `useHover`, a `hovered`
class, or a `data-hover` family of attributes. A server roster, a store or a replay for UI state. An option to pick a route. A
per-field share (`{ share: { hover: true } }`). A server grace period. A `localStorage` election. A SharedWorker or service
worker. A version handshake between tabs. A new `ui` runtime module in `weft`'s core or a hot-path check for `ui`. Conflict rules:
there are no conflicts, each owner writes its own bits. Synthetic DOM events for a remote hover (agorix M5).

## 15. Migration

Nothing has to migrate, and nothing changes for an app that doesn't opt in. Hand-written hover boxes can move to `interaction()`
when touched. Order of work: (1) `share` batched and built in, `realtime({ share })`; (2) `ui` across warp, mechanical, each
`:hover`-only rule gaining `[data-hold]`, dozens of selectors (count before starting), generated by `split-css` from the tokens; (3) the link under
`channel` and `sharedState` with §5.7's server changes, behind the full channel and multiplayer e2e suites; (4) rt, per Q4.
`@weft/multiplayer` needs no change until (3), which fixes its `id`.

## 16. Where it could still get messy

- **`remote` beside `hover`** is one more thing to read for anyone drawing by hand. It's the price of the safety in §1.
- **§5.7 touches the two busiest files in `@weft/start`**, and connection id semantics leak into every `left` and `exceptSelf`.
  If it goes badly, the honest fallback is `share` on its link and channels on theirs: two sockets, the thing this set out to end.
- **`seams` plus plugin injection** is invisible wiring. It's a known pattern here, but a third use should make someone stop.
- **`data-hold` overloads a word:** an app's own hold and a `ui`'s are one attribute on one element, and `attach` will fight a
  component that also sets it. Fine for Button and Checkbox; check `Field`, `CommandPalette`, `Prompt` when rolling out.
- **Fallback mode is a second behaviour.** It's small, but every tab-death and dedupe path has two answers.
