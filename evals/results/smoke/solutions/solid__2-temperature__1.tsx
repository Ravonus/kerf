import { createSignal } from "solid-js";

function fmt(x: number): string {
  return String(Math.round(x * 10) / 10);
}

export function TemperatureConverter() {
  const [c, setC] = createSignal("");
  const [f, setF] = createSignal("");

  const onC = (text: string) => {
    setC(text);
    const t = text.trim();
    if (t === "") setF("");
    else {
      const n = Number(t);
      if (Number.isFinite(n)) setF(fmt((n * 9) / 5 + 32));
    }
  };
  const onF = (text: string) => {
    setF(text);
    const t = text.trim();
    if (t === "") setC("");
    else {
      const n = Number(t);
      if (Number.isFinite(n)) setC(fmt(((n - 32) * 5) / 9));
    }
  };

  return (
    <div>
      <label>
        Celsius
        <input type="text" value={c()} onInput={(e) => onC(e.currentTarget.value)} />
      </label>
      <label>
        Fahrenheit
        <input type="text" value={f()} onInput={(e) => onF(e.currentTarget.value)} />
      </label>
    </div>
  );
}
