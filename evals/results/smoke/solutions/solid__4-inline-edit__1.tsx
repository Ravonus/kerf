import { createSignal, createEffect, on, Show } from "solid-js";

export function InlineEdit(props: { value: string; onSave: (next: string) => void }) {
  const [text, setText] = createSignal(props.value);
  const [editing, setEditing] = createSignal(false);
  let input: HTMLInputElement | undefined;
  let editBtn: HTMLButtonElement | undefined;
  let finished = false;

  createEffect(on(() => props.value, (v) => setText(v), { defer: true }));

  const focusEdit = () => {
    editBtn?.focus();
  };

  const finish = (save: boolean) => {
    if (finished) return;
    finished = true;
    if (save) {
      const draft = input ? input.value : text();
      setText(draft);
      props.onSave(draft);
    }
    setEditing(false);
    focusEdit();
  };

  const start = () => {
    finished = false;
    setEditing(true);
    if (input) {
      input.focus();
      input.select();
    }
  };

  return (
    <Show
      when={editing()}
      fallback={
        <div>
          <span data-testid="display">{text()}</span>
          <button type="button" ref={editBtn} onClick={start}>
            Edit
          </button>
        </div>
      }
    >
      <input
        type="text"
        aria-label="Title"
        ref={input}
        value={text()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
      />
    </Show>
  );
}
