# Testing and tooling

:::learn
- How to test a component the way a user would use it, and how weft spots tests that can't fail
- What a plugin adds to an app, and how to write one
- Where weft's speed comes from, and how to keep it and measure it
- What the Rust compiler does, and when to write Rust yourself
:::

The chapters so far were about building an app. This one is about the tools around it: the tests that tell you it works,
the plugins that extend it, the habits and measurements that keep it fast, and the compiler underneath all of it. Each
tool is built for two kinds of user at once: you, and the coding agent working in your app. They give both of you the
same answer to "is this done?"

## Testing

`@weft-js/core/test` renders a component under vitest and drives it by what a person sees: roles, labels and text. Every
action waits for the page to update, so a test never sleeps.

```tsx
// src/overview/Like.test.tsx
import { state } from '@weft-js/core'
import { render, screen, user } from '@weft-js/core/test'
import { expect, test } from 'vitest'

function Like() {
  const likes = state(0)
  return <button type="button" onClick={() => likes.value++}>Likes: {likes.value}</button>
}

test('a click adds a like', async () => {
  render(Like)
  await user.click(screen.getByRole('button', { name: 'Likes: 0' }))
  expect(screen.getByRole('button').textContent).toBe('Likes: 1')
})
```

The test clicks the button by its name and checks the text a person would read. It never looks at `likes` itself.

`weft check` reports tests that would pass whatever the code did, such as a test with no assertion (T001) or one that
sleeps (T004), and `weft test --gate` proves each new test fails on the code from before your change.

Read **[Testing](/learn/testing)** to learn how to test state, time, server functions and live data, and how to put a
number on how much work a click does.

## Plugins

warp, payments, fonts and the database layers all reach your app as plugins in `weft.config.ts`. A plugin can add slot
providers, design tokens, diagnostics with their own check, and a section of your agent's `AGENTS.md`. `weft add`
installs and wires one; the plugin lock asks you to approve what it may touch.

```bash
weft add pay --dry-run
weft plugins
```

Read **[Plugins](/learn/plugins)** to learn how plugins and their permissions work, how to write one with its own
diagnostic, and how project tasks keep your scripts in one list.

## Performance and bundle size

A weft component runs once, and each reactive read is wired to the DOM node that shows it, so a change does work in
proportion to what it changes. Lists are where that's won or lost: keep items you didn't change as the same objects, and
read one entry per row.

:::demo tool-rows

Read **[Performance and bundle size](/learn/performance)** to learn the list habits the compiler checks, how islands and
server-only code keep JavaScript off the page, how to measure, and how weft compares with other stacks.

## Rust, in depth

You never need Rust to use weft. The compiler is written in it and reaches you prebuilt, as a native addon or as
WebAssembly with the same output, and `weft doctor` says which you have. When a server function does heavy CPU work, you
can give it a Rust body without changing anything the client sees:

```ts
// src/overview/rust.ts
import { native } from '@weft-js/start/rust'

export const media = native('media')
```

Read **[Rust, in depth](/learn/rust)** to learn what the compiler does to your components, and how `native()` and
`remote()` run Rust server functions with the Zod schema as the one contract.

## Recap

- `@weft-js/core/test` tests components by role, label and text, with a fake clock and network. `weft check` and the gate
  catch tests that can't fail.
- Plugins add slots, tokens, diagnostics and agent context, under a lock you approve.
- Speed comes from compiled bindings; keep it with stable list items and per-row reads, and measure it.
- Rust is optional: the compiler ships prebuilt, and Rust server functions are there when CPU work calls for them.

## What's next

Start with **[Testing](/learn/testing)**: a test that fails when the code is wrong is the best tool in this chapter.
