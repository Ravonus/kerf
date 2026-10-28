Build a `TemperatureConverter` component (no props).

Behaviour:

- Two text inputs, labelled **Celsius** and **Fahrenheit** (use `<label>` or `aria-label`). Both start empty.
- When the user edits one field and its trimmed text is a valid number (non-empty and `Number(text)` is finite), the
  other field shows the converted value, formatted as `String(Math.round(x * 10) / 10)`.
  (`F = C × 9/5 + 32`, `C = (F − 32) × 5/9`.)
- When the user clears a field (trimmed text is empty), the other field becomes empty.
- When the edited text is not a valid number (for example `-` or `12x`), the other field is left unchanged.
- The field the user is typing in always shows exactly what they typed. It is never reformatted or rounded
  (for example `1.` stays `1.`).
