import { createSignal, For, onCleanup, Show } from "solid-js";

type Status = "idle" | "loading" | "empty" | "error" | "done";

export function SearchBox(props: {
  search: (query: string, signal: AbortSignal) => Promise<string[]>;
}) {
  const [results, setResults] = createSignal<string[]>([]);
  const [status, setStatus] = createSignal<Status>("idle");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let seq = 0;

  const onInput = (value: string) => {
    if (timer) clearTimeout(timer);
    const query = value.trim();
    timer = setTimeout(() => {
      timer = undefined;
      controller?.abort();
      controller = undefined;
      const id = ++seq;
      if (!query) {
        setResults([]);
        setStatus("idle");
        return;
      }
      const c = new AbortController();
      controller = c;
      setResults([]);
      setStatus("loading");
      let p: Promise<string[]>;
      try {
        p = props.search(query, c.signal);
      } catch {
        setStatus("error");
        return;
      }
      p.then(
        (r) => {
          if (id !== seq) return;
          setResults(r);
          setStatus(r.length === 0 ? "empty" : "done");
        },
        () => {
          if (id !== seq) return;
          setResults([]);
          setStatus("error");
        },
      );
    }, 300);
  };

  onCleanup(() => {
    if (timer) clearTimeout(timer);
    seq++;
    controller?.abort();
  });

  return (
    <div>
      <label>
        Search
        <input type="text" onInput={(e) => onInput(e.currentTarget.value)} />
      </label>
      <Show when={status() === "loading" || status() === "empty" || status() === "error"}>
        <div data-testid="status">
          {status() === "loading" ? "Loading" : status() === "empty" ? "No results" : "Error"}
        </div>
      </Show>
      <ul aria-label="Results">
        <For each={results()}>{(r) => <li>{r}</li>}</For>
      </ul>
    </div>
  );
}
