import { onCleanup, onMount, untrack, watch } from 'weft'

type Action<O> = { update(o: O): void; destroy(): void }

/**
 * Attach a ui-core action to an element once it is in the document (never on the server), feed it `opts` whenever
 * they change, and destroy it with the component. `el` is read after mount, so a `ref` variable works. The action is
 * made a microtask after mount: a component's nodes are inserted after its setup runs, and actions read the
 * surroundings (a tooltip's trigger is its previous sibling; a popover is placed by its trigger).
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
