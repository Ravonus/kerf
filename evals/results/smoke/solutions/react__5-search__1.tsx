import { useEffect, useRef, useState } from "react";

type Status = "idle" | "loading" | "empty" | "error";

export function SearchBox({
  search,
}: {
  search: (query: string, signal: AbortSignal) => Promise<string[]>;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const controllerRef = useRef<AbortController | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    const query = text.trim();
    if (!query) {
      controllerRef.current?.abort();
      controllerRef.current = null;
      setResults([]);
      setStatus("idle");
      return;
    }
    const timer = setTimeout(() => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setStatus("loading");
      setResults([]);
      let p: Promise<string[]>;
      try {
        p = Promise.resolve(searchRef.current(query, controller.signal));
      } catch {
        p = Promise.reject(new Error("search failed"));
      }
      p.then(
        (r) => {
          if (controllerRef.current !== controller) return;
          setResults(r);
          setStatus(r.length === 0 ? "empty" : "idle");
        },
        () => {
          if (controllerRef.current !== controller) return;
          setResults([]);
          setStatus("error");
        },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  return (
    <div>
      <label>
        Search
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {status === "loading" && <div data-testid="status">Loading</div>}
      {status === "empty" && <div data-testid="status">No results</div>}
      {status === "error" && <div data-testid="status">Error</div>}
      <ul aria-label="Results">
        {results.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
