import { useRef, useState } from "react";
import type { FormEvent } from "react";

type Task = { id: string; title: string };

export function TaskList({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(() => initialTasks.map((t) => ({ ...t })));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const counter = useRef(0);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= tasks.length) return;
    const next = tasks.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setTasks(next);
  };

  const remove = (id: string) => {
    setTasks((ts) => ts.filter((t) => t.id !== id));
    setNotes((n) => {
      const { [id]: _removed, ...rest } = n;
      return rest;
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    let id: string;
    do {
      counter.current += 1;
      id = `new-task-${counter.current}`;
    } while (tasks.some((t) => t.id === id));
    setTasks((ts) => [...ts, { id, title }]);
    setDraft("");
  };

  const sort = () => setTasks((ts) => [...ts].sort((a, b) => a.title.localeCompare(b.title)));

  return (
    <div>
      <ul aria-label="Tasks">
        {tasks.map((t, i) => (
          <li key={t.id}>
            <span data-testid="title">{t.title}</span>
            <input
              type="text"
              aria-label={`Note for ${t.title}`}
              value={notes[t.id] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
            />
            <button type="button" aria-label={`Move up ${t.title}`} onClick={() => move(i, -1)}>
              Up
            </button>
            <button type="button" aria-label={`Move down ${t.title}`} onClick={() => move(i, 1)}>
              Down
            </button>
            <button type="button" aria-label={`Remove ${t.title}`} onClick={() => remove(t.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit}>
        <input type="text" aria-label="New task" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit">Add</button>
      </form>
      <button type="button" onClick={sort}>
        Sort A-Z
      </button>
      <div data-testid="count">{tasks.length === 1 ? "1 task" : `${tasks.length} tasks`}</div>
    </div>
  );
}
