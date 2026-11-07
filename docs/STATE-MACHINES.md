# Runtime state machines

Weft's runtime has several lifecycles that are not written as one state
variable. They live in flags, nullable fields, timers and abort
controllers spread across a module. This page names each one, its states
and where they change, so a change to one of these files starts from the
whole picture.

When you touch one of these, keep its transitions in the places listed
here, or add a place to this page. A new async step (an `await`, a timer,
a lock request) is where these machines break: check what happens if the
owner stops, is disposed or starts again while it waits.

Status says what was done in the 2026-11 review:

- **fixed**: a race or leak was closed and has a regression test.
- **documented**: the encoding is implicit but its combinations are safe.
- **by design**: the behavior looks like a gap but is intended.

| # | Machine | File | Status |
|---|---|---|---|
| 1 | Client navigation | `start/src/run/navigation.ts` | fixed (2 items) |
| 2 | Leader election | `start/src/link/election.ts` | fixed |
| 3 | Tab lock | `start/src/link/election.ts` | fixed |
| 4 | Live connection loop | `start/src/live.ts` | fixed |
| 5 | Lazy islands | `core/src/island.ts` | fixed |
| 6 | Change feed | `start/src/changes.ts` | fixed |
| 7 | Mux socket | `start/src/mux.ts` | fixed |
| 8 | Query cache entry | `start/src/data/cache.ts` | documented |
| 9 | `resource` | `core/src/async.ts` | by design |
| 10 | Boundary | `core/src/async/boundary.ts` | documented |
| 11 | Leader socket | `start/src/link.ts` | documented |
| 12 | Channel socket loop | `start/src/channel/socket.ts` | documented |
| 13 | Prefetch jobs | `start/src/run/prefetch.ts` | fixed (resume) |
| 14 | Source context | `start/src/run/source-context.ts` | documented |
| 15 | Click admission | `start/src/run/admission.ts` | documented |
| 16 | Video swap | `core/src/media-swap.ts` | documented |

## 1. Client navigation

States: **idle**, **navigating** (fetching, with an incoming shape
shown), **showing cached** (a history entry applied from the route
cache while it revalidates), **refreshing** (the current page's data
refetched in place), **retry armed** (a failed refresh waiting to try
again) and **disposed** (after `pagehide`).

Encoded in `Navigation`: `current` (the navigation's AbortController),
`refreshing` (`{ ctrl, tags }`), `owed` (tags a stopped refresh still
owes the page), `again` (retry timer), `tries`, `source` (the retained
source context), the level `shape` states, and
`presentation.pending` in `CachePresentation`.

Transitions:

- `go()` aborts `current`, moves `refreshing.tags` to `owed`, retains
  the source context, pushes history and presents a shape or cached
  payload.
- `settle()` is the one exit from navigating: it stops the cached
  presentation timer, clears the shape, restores the committed URL if
  the navigation was aborted, releases the source context and refreshes
  what is owed.
- `refresh()` and `owing()` run the refreshing and retry states;
  `owing()` only acts when neither `current` nor `refreshing` is set.
- `dispose()` (pagehide, session change) aborts everything and stops
  prefetch. A `pageshow` with `persisted` resumes prefetch.
- Two paths abandon a navigation by clearing `current` and leaving the
  page with `location.replace`: the `travel()` error path and
  `CachePresentation.check()`. They skip `settle()` because the page is
  unloading.

Fixed: prefetch stayed stopped for the life of a tab restored from the
back/forward cache. `settle()` now stops the cached-presentation timer,
which a same-path `popstate` left armed (harmless only because of a
guard in `check()`).

Known: `reloaded()` (dev HMR) is not tracked in `refreshing`, so a
refresh in flight can land after it with older data. Dev only.

## 2. Leader election

States: **queued** (waiting on the lock), **stealing** (asked for the
lock with `steal`, after a ping went unanswered), **leading** and
**stopped**.

Encoded in `ElectionState` (`on`, `leads`, `waiting`) plus `abort`,
`release` and `pongAt` in `queuedCampaign`. Callers keep a copy of the
role in `linkStats.role` and `shareStats.role`.

Fixed: a steal request can't be aborted, so a tab stopped while
stealing used to be granted the lock afterwards, call `won()` and hold
the lock for good. A grant after `stop()` is now handed straight back.

## 3. Tab lock

States: **unheld**, **requesting**, **held**, **freed**. Encoded in
`tabHeld`, `tabFree`, the `whenHeld` queue and `tabTurn`.

Fixed: a rejected lock request left its callers queued forever, and
every later `holdTab()` joined that dead queue. Callers now go on
without the lock. `freeTab()` during a pending request now hands the
later grant back instead of marking the tab held again.

## 4. Live connection loop

States: **stopped**, **connecting**, **open**, **backing off**,
**parked** (tab hidden) and **offline**.

Encoded in module fields: `conn`, `running`, `attempt`, `retry`,
`nudge`, `parked`, `hiddenAt`, `changing`. `rt.status` is written from
several places and reflects these.

Transitions live in `run()` (the loop), `sync()` (the subscription set
changed), `park()`, `wake()`, `onOffline()` and the `h` frame.

Fixed: `sleep()` promised to wake early when the subscription set
changed, but `sync()` never woke it, so a new live query waited out the
whole backoff (up to 30 s). `sync()` now nudges the sleeping loop.

## 5. Lazy islands

States: **waiting** (for a trigger), **watched** (in the viewport
observer), **loading**, **retrying** (one retry after 800 ms),
**mounted**, **stale** (code could not load: reload once, then a note)
and **disposed**.

Encoded by membership in the `later` map, `Later.running`, `Later.el`
with the `watched` map and the shared IntersectionObserver, and the
`weft:reloaded:` sessionStorage flag.

The rule: an outcome only applies while `later.get(key)` is still this
island. Disposal removes it from the map and unobserves its element.

Fixed: the failure branch skipped that check, so an island disposed
during its retry (the user navigated away) reloaded the page. Disposal
also left the element observed, keeping detached DOM alive.

## 6. Change feed

States: **stopped**, **starting**, **running**. Explicit since this
review: `phase` plus a `turn` counter in `feedHandle`.

Fixed: `stop()` during `source.start()` used to leave the started
listener running (a database connection on the server), and the next
`start()` opened a second one. A start that resolves after its turn has
passed now stops its source at once.

## 7. Mux socket

States: **counted** (the user's socket count taken), **open**,
**closed**.

Fixed: if the first send or the session lookup failed, the count and
the drain interval were never released, so a user could run into R009
("too many sockets") with no sockets open. `release()` now runs on that
failure and on `close()`.

## 8. Query cache entry

States: **empty**, **loading**, **fresh**, **stale**, **refetching**,
**held** (behind a mutation's prediction) and **forgotten**.

Encoded in `Entry`: `has`, `stale`, `p`, `since`, `gen`, `held`,
`layers`. `held` is set in five places (`cache.ts`, `mutation.ts`,
`query.ts`) and cleared only in `relieve()`. Any new path that removes
prediction layers must call `relieve()`, or the entry stays stale.
Errors are thrown, not stored.

## 9. `resource`

States: **hydrated**, **idle**, **pending**, **settled**, **errored**,
**refetching**. Encoded in `value`, `pending`, `error`, `first`,
`hydrated`, `ctrl`.

By design: a refetch after an error keeps `error` set until the new
result lands, so a Boundary keeps its error view rather than flashing
the loading view. `pending` is true meanwhile for a UI that wants to
show progress on the retry.

## 10. Boundary

States: **held**, **wait**, **fallback**, **content**, **error**.
Encoded in `show`, `timer`, `shownAt`, `held`, `thrown`. The fallback
timer can fire while the error view shows; it is contained because the
error view takes precedence.

## 11. Leader socket

States: **none**, **dialing**, **open**, **backing off**, **closing
when idle**. Encoded in `ws`, `open`, `retry`, `ping`, `dead`, `idle`,
`queue`. `lost()` resets them together.

## 12. Channel socket loop

The same machine as #4, written again in `channel/socket.ts` with its
own visibility and online listeners. Two loops on one page can disagree
about being parked. Sharing one reconnect loop between them is open
work.

## 13. Prefetch jobs

States per job: **in flight**, **promoted** (a navigation claimed it),
**aborted**. The owner is **running** or **stopped**. An aborted job
stays in `jobs` until its `finally` runs, so `size` briefly counts it.
`resume()` returns a stopped owner to running after a back/forward
cache restore.

## 14. Source context

States: **active**, **stopped** (no longer observing, controls still
pinned) and **released**. One context per document (`active` WeakSet).

## 15. Click admission

States: **idle** and **armed** (a pointerdown accepted, its click to be
suppressed). Contained in `admission.ts`.

## 16. Video swap

States: **idle**, **swapping**, **done**. If `loadeddata` never fires,
the swap stays in swapping; the poster remains, which is the safe
outcome.
