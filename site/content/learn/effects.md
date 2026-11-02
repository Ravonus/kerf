# Effects and refs

:::learn
- How `watch` runs code when state changes, and cleans up after it
- How `onMount` and `onCleanup` fit a component's life
- How to reach a DOM element with `ref`
:::

Most of a weft app is state, derived values and JSX. Effects are for the rest: talking to things outside weft, such as
timers, the DOM, or a third-party library.

:::demo effects

## `watch`

```tsx
watch(() => running.value, on => {
  if (!on) return
  const id = setInterval(() => tenths.value++, 100)
  return () => clearInterval(id)
})
```

`watch(source, effect)` runs `effect` with the source's value, and again each time it changes. The effect gets the new
and the previous value. If it returns a function, that runs before the next run and when the component goes away.

Don't compute values in a `watch`. A value that comes from other values is `derived`.

## `onMount` and `onCleanup`

`onMount(fn)` runs once the component's elements are in the document. That's the place for DOM work, such as measuring.
`onCleanup(fn)` runs when the component goes away.

```tsx
onMount(() => console.log(box.offsetWidth))
onCleanup(() => socket.close())
```

## Refs

`ref` gives you the element. Assign a variable, or pass a function that gets it:

```tsx
let field!: HTMLInputElement
<input ref={field} />
<button onClick={() => field.select()}>Select</button>

<canvas ref={el => draw(el)} />
```

Use the element in handlers, `onMount` or `watch`, never while the body runs: the element doesn't exist yet.

## Two more

- `untrack(() => …)` reads without following. It's a snapshot that never updates, so not for anything you render
  (**W018**).
- `flush()` applies pending DOM updates now, for when you must measure or focus right after a write.

## Recap

- `watch` reacts to state with side effects, and its returned function cleans up.
- `onMount` for DOM work, `onCleanup` for teardown.
- `ref` reaches an element: a variable or a function.
