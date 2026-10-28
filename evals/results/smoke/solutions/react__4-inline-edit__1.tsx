import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function InlineEdit({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => void;
}) {
  const [current, setCurrent] = useState(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef(false);
  const refocusRef = useRef(false);

  useEffect(() => {
    setCurrent(value);
  }, [value]);

  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (refocusRef.current) {
      refocusRef.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const start = () => {
    doneRef.current = false;
    setDraft(current);
    setEditing(true);
  };

  const save = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onSave(draft);
    setCurrent(draft);
    refocusRef.current = true;
    setEditing(false);
  };

  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    refocusRef.current = true;
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label="Title"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={save}
      />
    );
  }

  return (
    <>
      <span data-testid="display">{current}</span>
      <button type="button" ref={buttonRef} onClick={start}>
        Edit
      </button>
    </>
  );
}
