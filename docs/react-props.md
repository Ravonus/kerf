# React prop names

Code written with React habits runs as React would. On native elements these work in a literal, a dynamic value and a
`{...spread}`, on the client, on the server and in hydration. Components receive their props untouched.

## Names

- HTML camelCase: `tabIndex`, `readOnly`, `maxLength`, `autoComplete`, `colSpan`, `srcSet`, `crossOrigin` and the rest,
  plus `className`, `htmlFor`, `acceptCharset`, `httpEquiv`.
- SVG: `strokeWidth`, `fillOpacity`, `clipPath`, `stopColor`, `textAnchor` and the rest become their dashed attributes.
  `xlinkHref` becomes `xlink:href`. Case-sensitive attributes such as `viewBox` and `gradientUnits` stay as written.

The compiler resolves names it can see (`crates/weft-compiler/src/react.rs`), so they cost nothing at run time. A spread
resolves its keys in `attrName` (`weft/dom`). One gap: on an SVG element a spread lowercases only `tabIndex`,
`crossOrigin`, `hrefLang` and `referrerPolicy`; other HTML-only camelCase names there keep their case.

## Values

- `style` takes camelCase or kebab-case names and custom properties. Numbers get `px` unless the property is unitless,
  as in React. `null` and booleans mean no declaration, so `color: on && 'red'` works.
- `dangerouslySetInnerHTML={{ __html }}` is `innerHTML`. The HTML isn't escaped.
- `defaultValue` and `defaultChecked` set the starting value of an `<input>` or `<textarea>`. Later changes reach an
  untouched field and leave an edited one alone.
- `value` and `defaultValue` work on `<textarea>` and `<select>`, including literals.
- `autoFocus` focuses on mount, not only during page load. Hydrating, the server's attribute does this instead.

## Changed behaviour

Three things differ from weft before this was added:

- **`onChange` fires on every edit, as in React**, not on blur. One edit fires it once: on a text input per keystroke,
  and on a checkbox, radio, select or file input when the value changes. On a `<form>` it hears its fields per
  keystroke. A `change` event with no `input` before it, such as `fireEvent.change` in a test, still fires it. To act
  on commit, use `onBlur`, or `on(el, 'change', fn)` from `weft/browser`. `onInput` is unchanged, and W042 is retired.
- **`false` is written as a word on `data-*`, `contentEditable`, `spellCheck`, `draggable` and `focusable`**, as `aria-*`
  already was. `data-open={false}` writes `data-open="false"` and `data-open={true}` writes `data-open="true"`, so a
  `[data-open]` selector now matches both. For a presence flag write `data-open={open ? '' : undefined}`.
- **`select` with `defaultValue={x}` follows `x`**: it behaves as `value`. React reads it once.

## Events

`onDoubleClick` listens to `dblclick`. The `Capture` forms (`onClickCapture`) listen in the capture phase;
`onChangeCapture` listens to `input`.
