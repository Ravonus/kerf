import { Title } from "@solidjs/meta";
import { createAsync, createAsyncStore, Navigate, revalidate, useAction, useSearchParams, useSubmissions, type RouteDefinition } from "@solidjs/router";
import { createMemo, ErrorBoundary, For, onCleanup, onMount, Show, Suspense } from "solid-js";

import { field, primary } from "~/components/button";
import { AccountMenu } from "~/components/account-menu";
import { Logo } from "~/components/logo";
import { addTodo, deleteTodo, getTodos, getViewer, toggleTodo } from "~/lib/data";
import { filters, parseFilter, type Filter } from "~/lib/filter";

export const route = {
  preload: ({ location }) => {
    getViewer();
    getTodos(parseFilter(location.query.filter));
  },
} satisfies RouteDefinition;

const labels = { all: "All", active: "Active", done: "Done" };
const empty = { all: "Nothing here yet", active: "All caught up", done: "Nothing finished yet" };

export default function Todos() {
  const [params] = useSearchParams();
  const filter = () => parseFilter(params.filter);

  const adds = useSubmissions(addTodo);
  const toggles = useSubmissions(toggleTodo);
  const deletes = useSubmissions(deleteTodo);
  const add = useAction(addTodo);
  const toggle = useAction(toggleTodo);

  const settled = () => [...adds, ...toggles, ...deletes].filter((s) => !s.pending);
  const failed = () => settled().some((s) => s.error || (s.result as { error?: string } | undefined)?.error);
  const forget = () => settled().forEach((s) => s.clear());

  function submit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title"));
    if (!title.trim()) return;
    data.set("id", crypto.randomUUID());
    forget();
    add(data).catch(() => {
      const input = form.elements.namedItem("title") as HTMLInputElement;
      input.value ||= title;
    });
    form.reset();
  }

  const setDone = (id: string, done: boolean) => {
    forget();
    toggle(id, done).catch(() => {});
  };

  // Another tab, or another device, may have changed the list while this one was in the background.
  onMount(() => {
    let last = 0;
    const refresh = () => {
      if (document.hidden || performance.now() - last < 250) return;
      last = performance.now();
      revalidate(getTodos.key);
    };
    addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    onCleanup(() => {
      removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    });
  });

  return (
    <>
      <Title>Todos · Daybook</Title>
      <header class="sticky top-0 z-10 border-b border-line/70 bg-page/85 backdrop-blur">
        <div class="mx-auto flex h-16 max-w-2xl items-center justify-between px-4 sm:px-6">
          <a href="/todos">
            <Logo />
          </a>
          <Suspense fallback={<span class="size-9 rounded-full bg-sunken" />}>
            <Account />
          </Suspense>
        </div>
      </header>
      <main class="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 class="text-3xl font-semibold tracking-tight">Todos</h1>
        <form action={addTodo} method="post" onSubmit={submit} class="mt-6 flex gap-2">
          <input name="title" aria-label="New todo" placeholder="What needs doing?" required maxlength="200" autocomplete="off" class={field} />
          <button type="submit" class={primary}>
            Add
          </button>
        </form>
        <Show when={failed()}>
          <p role="alert" class="mt-2 text-sm font-medium text-danger">
            That change wasn't saved. Check your connection and try again.
          </p>
        </Show>
        <nav aria-label="Filter" class="mt-6 flex gap-1">
          <For each={filters}>
            {(f) => (
              <a
                href={f === "all" ? "/todos" : `/todos?filter=${f}`}
                aria-current={filter() === f ? "page" : undefined}
                class="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink aria-[current=page]:bg-sunken aria-[current=page]:text-accent-text"
              >
                {labels[f]}
              </a>
            )}
          </For>
        </nav>
        <ErrorBoundary
          fallback={(_, reset) => (
            <div role="alert" class="mt-3 rounded-2xl border border-line bg-surface p-6 text-sm">
              <p class="font-medium text-danger">Your list didn't load. Nothing was lost.</p>
              <button type="button" class="mt-2 font-semibold text-accent-text underline underline-offset-4" onClick={reset}>
                Try again
              </button>
            </div>
          )}
        >
          <Suspense fallback={<Loading />}>
            <TodoList filter={filter()} adds={adds} toggles={toggles} deletes={deletes} onToggle={setDone} onDelete={forget} />
          </Suspense>
        </ErrorBoundary>
      </main>
    </>
  );
}

/** The middleware turned away anyone with no cookie, so the shell is already out. A cookie that no longer stands is caught here. */
function Account() {
  const viewer = createAsync(() => getViewer());
  return (
    <Show when={viewer()} fallback={<Show when={viewer() === null}><Navigate href="/login" /></Show>}>
      {(user) => <AccountMenu name={user().name} email={user().email} />}
    </Show>
  );
}

type Pending<Input extends unknown[]> = Iterable<{ pending: boolean; input: Input }>;
type Fields = FormData | URLSearchParams;

function TodoList(props: {
  filter: Filter;
  adds: Pending<[Fields]>;
  toggles: Pending<[string, boolean]>;
  deletes: Pending<[Fields]>;
  onToggle(id: string, done: boolean): void;
  onDelete(): void;
}) {
  const data = createAsyncStore(() => getTodos(props.filter), { reconcile: { key: "id" } });

  // What's on its way to the server, laid over the last list it sent. A submission leaves these as soon as its reply has been applied.
  const overlay = createMemo(() => {
    const done = new Map<string, boolean>();
    const gone = new Set<string>();
    const added = new Map<string, { id: string; title: string; done: boolean }>();
    for (const s of props.adds) {
      const id = String(s.input[0].get("id"));
      if (s.pending) added.set(id, { id, title: String(s.input[0].get("title")).trim(), done: false });
    }
    for (const s of props.toggles) if (s.pending) done.set(s.input[0], s.input[1]);
    for (const s of props.deletes) if (s.pending) gone.add(String(s.input[0].get("id")));
    return { done, gone, added };
  });

  const isDone = (t: { id: string; done: boolean }) => overlay().done.get(t.id) ?? t.done;
  const fits = (t: { id: string; done: boolean }) => !overlay().gone.has(t.id) && (props.filter === "all" || isDone(t) === (props.filter === "done"));

  const fresh = createMemo(() => {
    const known = new Set(data()?.rows.map((t) => t.id));
    return [...overlay().added.values()].filter((t) => !known.has(t.id)).filter(fits);
  });
  const rows = createMemo(() => [...fresh(), ...(data()?.rows.filter(fits) ?? [])]);

  const left = createMemo(() => {
    const { done, gone } = overlay();
    let n = (data()?.left ?? 0) + fresh().filter((t) => !isDone(t)).length;
    if (done.size || gone.size)
      for (const t of data()?.rows ?? []) {
        const now = gone.has(t.id) || isDone(t);
        if (now !== t.done) n += now ? -1 : 1;
      }
    return n;
  });

  return (
    <div class="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
      {/* The delete buttons belong to this form from a distance: Enter on a checkbox inside it would press the first one. */}
      <form id="delete-todo" action={deleteTodo} method="post" onSubmit={props.onDelete} />
      <ul role="list" aria-label="Todos" class="divide-y divide-line">
        <For each={rows()}>
          {(todo) => (
            <li class="flex items-center gap-2 pr-2">
              <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 pl-4">
                <input type="checkbox" class="check" checked={isDone(todo)} onInput={(e) => props.onToggle(todo.id, e.currentTarget.checked)} />
                <span class="min-w-0 wrap-anywhere" classList={{ "text-faint line-through": isDone(todo) }}>
                  {todo.title}
                </span>
              </label>
              <button
                type="submit"
                form="delete-todo"
                name="id"
                value={todo.id}
                aria-label={`Delete ${todo.title}`}
                class="grid size-9 flex-none cursor-pointer place-items-center rounded-lg text-faint transition-colors hover:bg-sunken hover:text-danger"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round">
                  <path d="M3.5 3.5l9 9m0-9l-9 9" />
                </svg>
              </button>
            </li>
          )}
        </For>
      </ul>
      <Show when={!rows().length}>
        <p class="px-4 py-10 text-center text-muted">{empty[props.filter]}</p>
      </Show>
      <p role="status" class="border-t border-line px-4 py-2.5 text-sm text-muted tabular-nums">{`${left()} left`}</p>
    </div>
  );
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading todos" class="mt-3 animate-pulse rounded-2xl border border-line bg-surface p-4">
      <For each={[72, 54, 64, 46, 68, 58]}>{(width) => <div class="my-4 h-5 rounded-md bg-sunken" style={{ width: `${width}%` }} />}</For>
    </div>
  );
}
