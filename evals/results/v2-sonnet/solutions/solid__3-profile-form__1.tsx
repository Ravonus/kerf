import { createComputed, createMemo, createSignal } from "solid-js";

type User = { id: string; name: string; email: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function ProfileForm(props: {
  user: User;
  onSave: (values: { name: string; email: string }) => void;
}) {
  const [baseName, setBaseName] = createSignal(props.user.name);
  const [baseEmail, setBaseEmail] = createSignal(props.user.email);
  const [name, setName] = createSignal(props.user.name);
  const [email, setEmail] = createSignal(props.user.email);

  let prevId = props.user.id;
  let prevName = props.user.name;
  let prevEmail = props.user.email;

  createComputed(() => {
    const id = props.user.id;
    const n = props.user.name;
    const e = props.user.email;
    if (id !== prevId) {
      setBaseName(n);
      setBaseEmail(e);
      setName(n);
      setEmail(e);
    } else {
      if (n !== prevName) {
        // adopt the refreshed value unless the person has edited this field
        if (name() === baseName()) setName(n);
        setBaseName(n);
      }
      if (e !== prevEmail) {
        if (email() === baseEmail()) setEmail(e);
        setBaseEmail(e);
      }
    }
    prevId = id;
    prevName = n;
    prevEmail = e;
  });

  const dirty = createMemo(() => name() !== baseName() || email() !== baseEmail());
  const valid = createMemo(() => EMAIL_RE.test(email().trim()));

  const submit = (ev: Event) => {
    ev.preventDefault();
    if (!dirty() || !valid()) return;
    const values = { name: name().trim(), email: email().trim() };
    props.onSave(values);
    setBaseName(values.name);
    setBaseEmail(values.email);
    setName(values.name);
    setEmail(values.email);
  };

  return (
    <form onSubmit={submit}>
      <label>
        Name
        <input type="text" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <label>
        Email
        <input type="text" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
      </label>
      {dirty() && <span data-testid="dirty">Unsaved changes</span>}
      <button type="submit" disabled={!dirty() || !valid()}>
        Save
      </button>
    </form>
  );
}
