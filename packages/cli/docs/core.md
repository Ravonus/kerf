# Core entrypoints

Import application APIs such as `state`, `derived`, `watch`, `context` and `createRoot`
from `@kerf-js/core`. Use the `State<T>` and `Derived<T>` types for boxes.

`memo(fn)` returns a cached accessor, `() => T`. Call it to read the current value.
It tracks the same dependencies as `derived(fn)` and recomputes when they change.

```ts
import { memo, state } from '@kerf-js/core'

const count = state(1)
const twice = memo(() => count.value * 2)
console.log(twice()) // 2
```

Compiler output and framework integrations use `@kerf-js/core/internal`. This
entrypoint re-exports the runtime's existing implementations and shares its graph,
box constructors and server state. It does not create another runtime instance.

The root no longer exports `DIRTY`, `rt`, `listener`, `read`, `reach`, `clean`,
`setFlat`, `flat`, `collecting`, `runMounts`, `setKeyed`, `NONE`, `stats`,
`devComponent` or `Box`. Integrations that require these use the internal entrypoint.
Applications create boxes with `state` rather than constructing `Box`.

`hole`, `localProps` and `restOf` also live under the internal entrypoint. `hole`
tracks a renderer's child binding. `localProps` implements writable prop locals.
`restOf` takes the prop snapshot used by a compiled native-element spread. These
are compiler and renderer contracts, rather than application APIs. The `hole`
export of `@kerf-js/core/ssr` is a separate server-rendering helper.
