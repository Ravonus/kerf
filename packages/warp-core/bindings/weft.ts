// The weft binding, and the one file in this package that imports a framework. `@weft-js/warp-core` itself never does
// (test/agnostic.test.mjs), so this stays behind its own subpath: `@weft-js/warp-core/weft`.
import { onCleanup, onMount, untrack, watch } from '@weft-js/core'
import type { Action } from '../src/store'

/* @weft visible */
/**
 * Attach a warp-core action to an element once it is in the document (never on the server), feed it `opts` whenever
 * they change, and destroy it with the component. Call it in a component's setup. `el` is read after mount, so a `ref`
 * variable works. The action is made a microtask after mount, so hydration itself writes nothing: what an action
 * writes (a counter, a tooltip's aria-describedby) lands just after the server HTML is adopted.
 */
export function use<E extends Element, O>(make: (el: E, o: O) => Action<O>, el: () => E | undefined, opts: () => O = () => undefined as O) {
  onMount(() => {
    let action: Action<O> | undefined
    let live = true
    queueMicrotask(() => {
      const node = live && el()
      if (node) action = make(node, untrack(opts))
    })
    watch(opts, (o, prev) => { if (prev !== undefined) action?.update(o) })
    onCleanup(() => { live = false; action?.destroy() })
  })
}
