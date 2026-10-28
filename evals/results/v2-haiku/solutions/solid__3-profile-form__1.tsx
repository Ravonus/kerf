import { createComputed, createMemo, createSignal, Show, untrack } from "solid-js";

export interface ProfileUser {
  id: string;
  name: string;
  email: string;
}

export interface ProfileFormProps {
  user: ProfileUser;
  onSave: (values: { name: string; email: string }) => void;
}

type Values = { name: string; email: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function ProfileForm(props: ProfileFormProps) {
  // The last known server copy of the user (the baseline for "unsaved changes").
  const [saved, setSaved] = createSignal<ProfileUser>({
    id: props.user.id,
    name: props.user.name,
    email: props.user.email,
  });
  // What the person currently sees in the inputs.
  const [draft, setDraft] = createSignal<Values>({
    name: props.user.name,
    email: props.user.email,
  });

  // Sync with the parent's user prop. A different user resets the form. The same user
  // (refreshed copy) updates every field the person has not edited, and keeps edited fields.
  createComputed(() => {
    const u = props.user;
    untrack(() => {
      const prev = saved();
      const cur = draft();
      if (u.id !== prev.id) {
        setDraft({ name: u.name, email: u.email });
      } else {
        setDraft({
          name: cur.name.trim() !== prev.name.trim() ? cur.name : u.name,
          email: cur.email.trim() !== prev.email.trim() ? cur.email : u.email,
        });
      }
      setSaved({ id: u.id, name: u.name, email: u.email });
    });
  });

  const dirty = createMemo(
    () =>
      draft().name.trim() !== saved().name.trim() ||
      draft().email.trim() !== saved().email.trim(),
  );
  const emailValid = createMemo(() => EMAIL_RE.test(draft().email.trim()));
  const canSave = createMemo(() => dirty() && emailValid());

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!canSave()) return;
    const values: Values = {
      name: draft().name.trim(),
      email: draft().email.trim(),
    };
    props.onSave({ ...values });
    setDraft(values);
    setSaved({ id: saved().id, ...values });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label for="profile-name">Name</label>
        <input
          id="profile-name"
          type="text"
          value={draft().name}
          onInput={(e) => setDraft({ ...draft(), name: e.currentTarget.value })}
        />
      </div>
      <div>
        <label for="profile-email">Email</label>
        <input
          id="profile-email"
          type="text"
          value={draft().email}
          onInput={(e) => setDraft({ ...draft(), email: e.currentTarget.value })}
        />
      </div>
      <Show when={dirty()}>
        <p data-testid="dirty">Unsaved changes</p>
      </Show>
      <button type="submit" disabled={!canSave()}>
        Save
      </button>
    </form>
  );
}
