Build an `InlineEdit` component.

Props:

```ts
{ value: string; onSave: (next: string) => void }
```

Behaviour:

- **Display mode:** an element with `data-testid="display"` shows the current text, plus a button labelled **Edit**.
  The current text is the last saved text, or `value` whenever the parent changes `value`.
- Clicking **Edit** switches to **edit mode**: a text input labelled **Title** (use `<label>` or `aria-label`)
  replaces the display. It starts with the current text, is focused, and has all its text selected.
- In edit mode:
  - **Enter** saves: call `onSave(draft)` exactly once, show the draft as the current text, return to display mode.
  - **Escape** cancels: `onSave` is not called, and the current text is unchanged.
  - Moving focus away (blur) saves, exactly like Enter.
- After saving or cancelling, keyboard focus is on the **Edit** button.
