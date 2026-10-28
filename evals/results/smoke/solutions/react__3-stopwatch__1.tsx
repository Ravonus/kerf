import { useEffect, useRef, useState } from "react";

export function Stopwatch() {
  const [ticks, setTicks] = useState(0); // in tenths of a second (speed-weighted)
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [laps, setLaps] = useState<number[]>([]);
  const speedRef = useRef(1);
  speedRef.current = Number(speed);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTicks((t) => t + speedRef.current);
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  const fmt = (t: number) => (t / 10).toFixed(1);

  return (
    <div>
      <div data-testid="elapsed">{fmt(ticks)}</div>
      <label>
        Speed
        <select value={speed} onChange={(e) => setSpeed(e.target.value)}>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="5">5</option>
        </select>
      </label>
      <button type="button" onClick={() => setRunning((r) => !r)}>
        {running ? "Stop" : "Start"}
      </button>
      <button type="button" onClick={() => setLaps((l) => [...l, ticks])}>
        Lap
      </button>
      <button
        type="button"
        onClick={() => {
          setRunning(false);
          setTicks(0);
          setLaps([]);
        }}
      >
        Reset
      </button>
      <ol aria-label="Laps">
        {laps.map((l, i) => (
          <li key={i}>{`Lap ${i + 1}: ${fmt(l)}`}</li>
        ))}
      </ol>
    </div>
  );
}
