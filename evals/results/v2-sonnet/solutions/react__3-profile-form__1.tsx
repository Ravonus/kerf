import { useId, useState } from 'react';

type User = { id: string; name: string; email: string };
type Values = { name: string; email: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function ProfileForm({
  user,
  onSave,
}: {
  user: User;
  onSave: (values: Values) => void;
}) {
  const uid = useId();
  const [seen, setSeen] = useState<User>(user);
  const [base, setBase] = useState<Values>({ name: user.name, email: user.email });
  const [draft, setDraft] = useState<Values>({ name: user.name, email: user.email });

  let curBase = base;
  let curDraft = draft;
  if (seen !== user && (seen.id !== user.id || seen.name !== user.name || seen.email !== user.email)) {
    const next = { name: user.name, email: user.email };
    if (seen.id !== user.id) {
      curDraft = next;
    } else if (draft.name === base.name && draft.email === base.email) {
      curDraft = next;
    } else {
      curDraft = {
        name: draft.name === base.name ? next.name : draft.name,
        email: draft.email === base.email ? next.email : draft.email,
      };
    }
    curBase = next;
    setSeen(user);
    setBase(next);
    setDraft(curDraft);
  } else if (seen !== user) {
    setSeen(user);
  }

  const dirty = curDraft.name !== curBase.name || curDraft.email !== curBase.email;
  const valid = EMAIL_RE.test(curDraft.email.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || !valid) return;
    const values = { name: curDraft.name.trim(), email: curDraft.email.trim() };
    onSave(values);
    setBase(values);
    setDraft(values);
  };

  return (
    <form onSubmit={submit}>
      <label htmlFor={`${uid}-name`}>Name</label>
      <input
        id={`${uid}-name`}
        type="text"
        value={curDraft.name}
        onChange={(e) => setDraft({ ...curDraft, name: e.target.value })}
      />
      <label htmlFor={`${uid}-email`}>Email</label>
      <input
        id={`${uid}-email`}
        type="text"
        value={curDraft.email}
        onChange={(e) => setDraft({ ...curDraft, email: e.target.value })}
      />
      {dirty && <span data-testid="dirty">Unsaved changes</span>}
      <button type="submit" disabled={!dirty || !valid}>
        Save
      </button>
    </form>
  );
}
