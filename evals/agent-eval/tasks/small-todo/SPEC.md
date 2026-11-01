Build a todo app at `/`.

- A heading (level 1) reads `Todos`.
- A text input labelled `New todo`. Pressing Enter, or the `Add` button, adds a todo with the trimmed text and clears the input. Blank text adds nothing.
- Todos appear in order added, in a list labelled `Todos`. Each item has:
  - a checkbox labelled with the todo's text, which marks it completed,
  - a button labelled `Edit <text>`,
  - a button labelled `Delete <text>`.
- `Edit <text>` replaces the item's checkbox with a text input labelled `Edit todo`, holding the current text, and moves focus to it. Enter saves the trimmed text. Escape leaves the text unchanged. Saving blank text deletes the todo.
- A checkbox labelled `Mark all as complete` completes every todo, or, if all are already completed, makes all active. It is checked exactly when there is at least one todo and all are completed. It is not shown when there are no todos.
- Three filter buttons, `All`, `Active` and `Completed`, show the matching todos. The selected one has `aria-pressed="true"` and the others `aria-pressed="false"`. `All` is the default.
- Text reads `N items left`, or `1 item left`, counting active todos whatever the filter.
- A button `Clear completed` removes completed todos. It is shown only when at least one todo is completed.
- Todos and the selected filter survive a page reload, using `localStorage`.
