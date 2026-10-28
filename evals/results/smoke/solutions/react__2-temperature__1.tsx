import { useState } from 'react';

const fmt = (x: number): string => String(Math.round(x * 10) / 10);

export function TemperatureConverter() {
  const [c, setC] = useState('');
  const [f, setF] = useState('');

  const onC = (text: string) => {
    setC(text);
    const t = text.trim();
    if (t === '') {
      setF('');
      return;
    }
    const n = Number(t);
    if (Number.isFinite(n)) setF(fmt((n * 9) / 5 + 32));
  };

  const onF = (text: string) => {
    setF(text);
    const t = text.trim();
    if (t === '') {
      setC('');
      return;
    }
    const n = Number(t);
    if (Number.isFinite(n)) setC(fmt(((n - 32) * 5) / 9));
  };

  return (
    <div>
      <label>
        Celsius
        <input type="text" value={c} onChange={(e) => onC(e.target.value)} />
      </label>
      <label>
        Fahrenheit
        <input type="text" value={f} onChange={(e) => onF(e.target.value)} />
      </label>
    </div>
  );
}
