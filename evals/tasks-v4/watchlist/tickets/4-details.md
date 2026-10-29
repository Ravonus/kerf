# Ticket 4: details and notes

Add this method to the `Api` interface and to `createFakeApi`:

```ts
details(id: string): Promise<{ description: string }> // rejects on failure
```

- Each row's symbol becomes a button labelled `Details <SYMBOL>`. Clicking it opens a panel (`role="region"`,
  labelled **Details**) for that stock. The panel shows:
  - the symbol and name in a heading,
  - the current price in an element with `data-testid="detail-price"`, kept live as quotes arrive,
  - the description: `Loading…` while it loads. If loading fails, show `Couldn't load details` (`role="alert"`) and
    a **Retry** button that loads it again.
- Opening another stock replaces the panel's content. A description that arrives late for a stock that's no longer
  open must never be shown.
- When the panel opens, focus moves to its **Notes** textarea. Pressing Escape anywhere in the panel closes it and
  returns focus to the `Details <SYMBOL>` button that opened it.
- Notes: the textarea shows the open stock's saved note (empty if none). A **Save** button saves it for that stock.
  An **Undo** button undoes the most recent save, for whichever stock it was. Pressing it again undoes the one
  before, and so on; it is disabled when there is nothing to undo. If an undo changes the open stock's note, the
  textarea shows the restored note. Notes don't need to survive a reload.

The work budget still applies. Typing in Notes must not format or render any row. A quote for the open stock may
also update the panel's price.
