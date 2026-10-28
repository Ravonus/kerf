import { createSignal, For, onCleanup, Show } from "solid-js";

export function CityPicker(props: {
  search: (query: string, signal: AbortSignal) => Promise<string[]>;
  onPick: (city: string) => void;
}) {
  const [text, setText] = createSignal("");
  const [options, setOptions] = createSignal<string[]>([]);
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(-1);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let seq = 0;

  const cancel = () => {
    seq++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
  };
  onCleanup(cancel);

  const onInput = (value: string) => {
    setText(value);
    cancel();
    setActive(-1);
    if (value.trim() === "") {
      setOptions([]);
      setOpen(false);
      return;
    }
    const mine = seq;
    timer = setTimeout(() => {
      timer = undefined;
      const ctl = new AbortController();
      controller = ctl;
      props
        .search(value, ctl.signal)
        .then((res) => {
          if (mine !== seq || ctl.signal.aborted) return;
          setOptions(res);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {});
    }, 250);
  };

  const pick = (city: string) => {
    cancel();
    setText(city);
    setOpen(false);
    setOptions([]);
    setActive(-1);
    props.onPick(city);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const n = options().length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open() || n === 0) return;
      setActive((active() + 1) % n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open() || n === 0) return;
      setActive(active() <= 0 ? n - 1 : active() - 1);
    } else if (e.key === "Enter") {
      if (open() && active() >= 0 && active() < n) {
        e.preventDefault();
        pick(options()[active()]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div>
      <label for="city-picker-input">City</label>
      <input
        id="city-picker-input"
        type="text"
        autocomplete="off"
        value={text()}
        onInput={(e) => onInput(e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <Show when={open() && options().length > 0}>
        <ul role="listbox">
          <For each={options()}>
            {(city, i) => (
              <li
                role="option"
                aria-selected={active() === i() ? "true" : "false"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(city)}
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
