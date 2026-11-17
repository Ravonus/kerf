// The kerf binding, and the one file in this package that imports a framework. `@kerf-js/veneer-core` itself never does
// (test/agnostic.test.mjs), so this stays behind its own subpath: `@kerf-js/veneer-core/kerf`.
import { onCleanup, onMount, untrack, watch } from '@kerf-js/core'
import type { Action } from '../src/store'

/** Actions whose element has no window yet, each as the check that makes it once the element has one. */
const waiting = new Set<() => void>()
let watcher: MutationObserver | undefined
let timer: ReturnType<typeof setInterval> | undefined
const RECHECK_MS = 250

function check() {
  for (const ready of [...waiting]) ready()
  if (waiting.size) return
  watcher?.disconnect()
  clearInterval(timer)
  timer = undefined
}

/**
 * Run `make` once `node` belongs to a document with a window; returns what gives up on it. A node cloned from a
 * `<template>` belongs to the template's own document until it is first inserted, and that document has no window:
 * `ownerDocument.defaultView` is null there, and every action reads its observers and timers from it. A component
 * built while something else holds its place (a `<Boundary>` still pending, a route behind its skeleton) mounts
 * before it is inserted, so the action waits for the insertion. A node made by `document.createElement` has a window
 * from the start and never waits, in the page or out of it.
 */
function placed(node: Element, make: () => void): () => void {
  if (node.ownerDocument.defaultView) {
    make()
    return () => {}
  }
  const ready = () => {
    if (!node.ownerDocument.defaultView) return
    waiting.delete(ready)
    make()
  }
  waiting.add(ready)
  // The page's own mutations say when: the insertion is one of them. The interval covers an insertion they don't
  // report, into a shadow tree or a fragment of the page's document.
  watcher ??= new MutationObserver(check)
  watcher.observe(document, { childList: true, subtree: true })
  timer ??= setInterval(check, RECHECK_MS)
  return () => {
    waiting.delete(ready)
    check()
  }
}

/* @kerf visible */
/**
 * Attach a veneer-core action to an element once it is in the document (never on the server), feed it `opts` whenever
 * they change, and destroy it with the component. Call it in a component's setup. `el` is read after mount, so a `ref`
 * variable works. The action is made a microtask after mount, so hydration itself writes nothing: what an action
 * writes (a counter, a tooltip's aria-describedby) lands just after the server HTML is adopted. An element that was
 * built out of the page and has not been inserted yet gets its action when it is.
 */
export function use<E extends Element, O>(
  make: (el: E, o: O) => Action<O>,
  el: () => E | undefined,
  opts: () => O = () => undefined as O,
) {
  onMount(() => {
    let action: Action<O> | undefined
    let live = true
    let cancel = () => {}
    queueMicrotask(() => {
      const node = live && el()
      if (node)
        cancel = placed(node, () => {
          action = make(node, untrack(opts))
        })
    })
    watch(opts, (o, prev) => {
      if (prev !== undefined) action?.update(o)
    })
    onCleanup(() => {
      live = false
      cancel()
      action?.destroy()
    })
  })
}
