# Reading reactive values

`state(initial)` returns a writable `State<T>`. Read or assign its `.value`.
`derived(fn)` returns a read-only `Derived<T>`. Read `.value` to evaluate it and
track its dependencies.

Use `memo(fn)` when a caller needs an accessor instead of a box:

```ts
import { derived, memo, state } from '@weft-js/core'

const count = state(1)
const doubled = derived(() => count.value * 2)
const readDoubled = memo(() => count.value * 2)

console.log(doubled.value, readDoubled()) // 2, 2
```

Both forms cache their result and refresh it when a dependency changes. `memo`
returns a function, so call it; it has no `.value` property. The compiler also uses
this accessor form to cache component children.

For side effects, `watch(source, callback)` tracks reads in `source`. Keep the
source pure and give reactive work an owner with a component or `createRoot`.
Graph tracking, mount queues and renderer helpers belong to
`@weft-js/core/internal`; application code uses the public lifecycle APIs.
