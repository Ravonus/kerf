Build a `ProfileForm` for editing a user's profile.

```ts
props: {
  user: { id: string; name: string; email: string }
  onSave: (values: { name: string; email: string }) => void
}
```

- Text inputs labelled **Name** and **Email**, filled in from `user`.
- A **Save** button, enabled only when the form has unsaved changes and the email is valid
  (`/^[^@\s]+@[^@\s]+\.[^@\s]+$/` on the trimmed value). Saving calls `onSave` with trimmed values.
- While there are unsaved changes, show `Unsaved changes` in an element with `data-testid="dirty"`. Changing a field
  and changing it back counts as no change. Once saved, the form has no unsaved changes.

The parent may switch to a different user at any time, or pass a refreshed copy of the same user (for example after
someone edited it in another tab). Never throw away what the person is typing, and never show stale data.
