import { useId, useState, type FormEvent } from "react";

export type ProfileUser = { id: string; name: string; email: string };
export type ProfileValues = { name: string; email: string };

export interface ProfileFormProps {
  user: ProfileUser;
  onSave: (values: ProfileValues) => void;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type FormState = {
  /** id of the user this state belongs to */
  id: string;
  /** last values received from props */
  seen: ProfileValues;
  /** last saved / server-known values (what "unsaved" is measured against) */
  baseline: ProfileValues;
  /** what the person is currently editing */
  draft: ProfileValues;
};

function fromUser(user: ProfileUser): FormState {
  const values = { name: user.name, email: user.email };
  return { id: user.id, seen: values, baseline: values, draft: values };
}

/**
 * Reconcile state with the props. A different user resets the form. The same
 * user with new data updates the baseline, and only fields the person has not
 * touched take the new value, so in-progress edits are never discarded.
 */
function sync(state: FormState, user: ProfileUser): FormState {
  if (user.id !== state.id) return fromUser(user);
  if (user.name === state.seen.name && user.email === state.seen.email) return state;

  const seen = { name: user.name, email: user.email };
  return {
    id: state.id,
    seen,
    baseline: seen,
    draft: {
      name: state.draft.name === state.seen.name ? user.name : state.draft.name,
      email: state.draft.email === state.seen.email ? user.email : state.draft.email,
    },
  };
}

export function ProfileForm({ user, onSave }: ProfileFormProps) {
  const [stored, setStored] = useState<FormState>(() => fromUser(user));
  const state = sync(stored, user);
  if (state !== stored) setStored(state);

  const nameId = useId();
  const emailId = useId();

  const { draft, baseline } = state;
  const dirty = draft.name !== baseline.name || draft.email !== baseline.email;
  const canSave = dirty && EMAIL_RE.test(draft.email.trim());

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    const values = { name: draft.name.trim(), email: draft.email.trim() };
    onSave(values);
    setStored((prev) =>
      prev.id === user.id ? { ...prev, baseline: values, draft: values } : prev,
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          type="text"
          value={draft.name}
          onChange={(e) =>
            setStored((prev) => ({
              ...prev,
              draft: { ...prev.draft, name: e.target.value },
            }))
          }
        />
      </div>
      <div>
        <label htmlFor={emailId}>Email</label>
        <input
          id={emailId}
          type="text"
          autoComplete="email"
          value={draft.email}
          onChange={(e) =>
            setStored((prev) => ({
              ...prev,
              draft: { ...prev.draft, email: e.target.value },
            }))
          }
        />
      </div>
      {dirty && <p data-testid="dirty">Unsaved changes</p>}
      <button type="submit" disabled={!canSave}>
        Save
      </button>
    </form>
  );
}
