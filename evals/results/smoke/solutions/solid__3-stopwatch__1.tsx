import { createSignal, For, onCleanup } from "solid-js";

export function Stopwatch() {
  const [ticks, setTicks] = createSignal(0); // in tenths of a second * speed units
  const [running, setRunning] = createSignal(false);
  const [speed, setSpeed] = createSignal(1);
  const [laps, setLaps] = createSignal<string[]>([]);
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    setRunning(false);
  };
  const start = () => {
    if (timer !== undefined) return;
    setRunning(true);
    timer = setInterval(() => setTicks((t) => t + speed()), 100);
  };
  const fmt = () => (ticks() / 10).toFixed(1);

  onCleanup(() => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  });

  return (
    <div>
      <div data-testid="elapsed">{fmt()}</div>
      <label>
        Speed
        <select value={String(speed())} onChange={(e) => setSpeed(Number(e.currentTarget.value))}>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="5">5</option>
        </select>
      </label>
      <button type="button" onClick={() => (running() ? stop() : start())}>
        {running() ? "Stop" : "Start"}
      </button>
      <button type="button" onClick={() => setLaps((l) => [...l, fmt()])}>
        Lap
      </button>
      <button
        type="button"
        onClick={() => {
          stop();
          setTicks(0);
          setLaps([]);
        }}
      >
        Reset
      </button>
      <ol aria-label="Laps">
        <For each={laps()}>{(l, i) => <li>{`Lap ${i() + 1}: ${l}`}</li>}</For>
      </ol>
    </div>
  );
}
