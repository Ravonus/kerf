import { createSignal, For, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js";

export interface CityPickerProps {
  search: (query: string, signal: AbortSignal) => Promise<string[]>;
  onPick: (city: string) => void;
}

const DEBOUNCE_MS = 250;
let instanceCounter = 0;

export function CityPicker(props: CityPickerProps): JSX.Element {
  const uid = `city-picker-${++instanceCounter}`;
  const inputId = `${uid}-input`;
  const listId = `${uid}-listbox`;
  const optionId = (i: number) => `${uid}-option-${i}`;

  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<string[]>([]);
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(-1);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  // Cancels the pending debounce timer and any in-flight request.
  const cancelPending = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    controller?.abort();
    controller = undefined;
  };

  const runSearch = (text: string) => {
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    props.search(text, ctrl.signal).then(
      (items) => {
        // Ignore responses from superseded requests (out-of-order arrivals).
        if (ctrl.signal.aborted) return;
        setResults(items);
        setActive(-1);
        setOpen(true);
      },
      () => {
        if (ctrl.signal.aborted) return;
        setResults([]);
        setActive(-1);
      },
    );
  };

  const onInput = (value: string) => {
    setQuery(value);
    setActive(-1);
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (value.trim() === "") {
      controller?.abort();
      controller = undefined;
      setResults([]);
      setOpen(false);
      return;
    }
    setOpen(true);
    timer = setTimeout(() => {
      timer = undefined;
      runSearch(value);
    }, DEBOUNCE_MS);
  };

  const pick = (city: string) => {
    cancelPending();
    setQuery(city);
    setResults([]);
    setActive(-1);
    setOpen(false);
    props.onPick(city);
  };

  const showList = () => open() && results().length > 0;

  const onKeyDown = (e: KeyboardEvent) => {
    const n = results();
    if (e.key === "ArrowDown") {
      if (n.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive((active() + 1) % n.length);
    } else if (e.key === "ArrowUp") {
      if (n.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive(active() <= 0 ? n.length - 1 : active() - 1);
    } else if (e.key === "Enter") {
      const city = showList() ? n[active()] : undefined;
      if (city === undefined) return;
      e.preventDefault();
      pick(city);
    } else if (e.key === "Escape") {
      if (!open()) return;
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  onCleanup(cancelPending);

  return (
    <div>
      <label for={inputId}>City</label>
      <input
        id={inputId}
        type="text"
        autocomplete="off"
        value={query()}
        onInput={(e) => onInput(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showList() ? "true" : "false"}
        aria-activedescendant={showList() && active() >= 0 ? optionId(active()) : undefined}
      />
      <Show when={showList()}>
        <ul role="listbox" id={listId}>
          <For each={results()}>
            {(city, i) => (
              <li
                role="option"
                id={optionId(i())}
                aria-selected={i() === active() ? "true" : "false"}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(city);
                }}
              >
                {city}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
