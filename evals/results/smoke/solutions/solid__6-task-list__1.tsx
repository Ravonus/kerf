import { createSignal, For } from "solid-js";

type Task = { id: string; title: string };

export function TaskList(props: { initialTasks: Task[] }) {
  const [tasks, setTasks] = createSignal<Task[]>([...props.initialTasks]);
  const [notes, setNotes] = createSignal<Record<string, string>>({});
  const [newTitle, setNewTitle] = createSignal("");
  let counter = 0;

  const move = (id: string, delta: number) => {
    const list = [...tasks()];
    const i = list.findIndex((t) => t.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setTasks(list);
  };

  const remove = (id: string) => {
    setTasks(tasks().filter((t) => t.id !== id));
    setNotes((n) => {
      const { [id]: _removed, ...rest } = n;
      return rest;
    });
  };

  const add = (e: Event) => {
    e.preventDefault();
    const title = newTitle().trim();
    if (!title) return;
    let id: string;
    do {
      id = `new-${Date.now()}-${counter++}`;
    } while (tasks().some((t) => t.id === id));
    setTasks([...tasks(), { id, title }]);
    setNewTitle("");
  };

  const sort = () => setTasks([...tasks()].sort((a, b) => a.title.localeCompare(b.title)));

  return (
    <div>
      <form onSubmit={add}>
        <input
          type="text"
          aria-label="New task"
          value={newTitle()}
          onInput={(e) => setNewTitle(e.currentTarget.value)}
        />
        <button type="submit">Add</button>
      </form>
      <button type="button" onClick={sort}>Sort A-Z</button>
      <div data-testid="count">
        {tasks().length === 1 ? "1 task" : `${tasks().length} tasks`}
      </div>
      <ul aria-label="Tasks">
        <For each={tasks()}>
          {(task) => (
            <li>
              <span data-testid="title">{task.title}</span>
              <input
                type="text"
                aria-label={`Note for ${task.title}`}
                value={notes()[task.id] ?? ""}
                onInput={(e) => {
                  const v = e.currentTarget.value;
                  setNotes((n) => ({ ...n, [task.id]: v }));
                }}
              />
              <button type="button" aria-label={`Move up ${task.title}`} onClick={() => move(task.id, -1)}>Up</button>
              <button type="button" aria-label={`Move down ${task.title}`} onClick={() => move(task.id, 1)}>Down</button>
              <button type="button" aria-label={`Remove ${task.title}`} onClick={() => remove(task.id)}>Remove</button>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
