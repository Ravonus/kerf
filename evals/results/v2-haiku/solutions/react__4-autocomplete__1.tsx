import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";

export interface CityPickerProps {
  search: (query: string, signal: AbortSignal) => Promise<string[]>;
  onPick: (city: string) => void;
}

const DEBOUNCE_MS = 250;

export function CityPicker({ search, onPick }: CityPickerProps) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const inputId = useId();
  const listId = useId();

  const searchRef = useRef(search);
  searchRef.current = search;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const controllerRef = useRef<AbortController | null>(null);

  // Cancels the pending debounce timer and any in-flight request.
  const cancel = () => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    controllerRef.current?.abort();
    controllerRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    };
  }, []);

  const runSearch = (query: string) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    searchRef.current(query, controller.signal).then(
      (results) => {
        if (controller.signal.aborted) return;
        controllerRef.current = null;
        setOptions(results);
        setActive(-1);
        setOpen(true);
      },
      () => {
        if (controller.signal.aborted) return;
        controllerRef.current = null;
        setOptions([]);
        setActive(-1);
      },
    );
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setText(value);
    cancel();

    const query = value.trim();
    if (query === "") {
      setOptions([]);
      setActive(-1);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      runSearch(query);
    }, DEBOUNCE_MS);
  };

  const pick = (city: string) => {
    cancel();
    setText(city);
    setOpen(false);
    setActive(-1);
    onPickRef.current(city);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown": {
        if (options.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive((i) => (i < 0 ? 0 : Math.min(i + 1, options.length - 1)));
        return;
      }
      case "ArrowUp": {
        if (options.length === 0) return;
        event.preventDefault();
        setOpen(true);
        setActive((i) => (i < 0 ? options.length - 1 : Math.max(i - 1, 0)));
        return;
      }
      case "Enter": {
        if (!open || active < 0 || active >= options.length) return;
        event.preventDefault();
        pick(options[active]);
        return;
      }
      case "Escape": {
        if (!open) return;
        event.preventDefault();
        cancel();
        setOpen(false);
        setActive(-1);
        return;
      }
    }
  };

  const showList = open && options.length > 0;

  return (
    <div>
      <label htmlFor={inputId}>City</label>
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-activedescendant={
          showList && active >= 0 ? `${listId}-option-${active}` : undefined
        }
      />
      {showList && (
        <ul role="listbox" id={listId}>
          {options.map((option, index) => (
            <li
              key={`${index}-${option}`}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(option);
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
