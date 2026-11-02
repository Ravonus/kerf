# React prop names

Code written with React habits runs as React would. On native elements these names work in a literal, a dynamic value
and a `{...spread}`, on the client, on the server and in hydration. Components receive their props untouched. React's
hooks are a different matter: `useState`, `useEffect` and the rest are W020–W029, each with the weft form to use
(`weft docs rules`).

## Names

- HTML camelCase: `tabIndex`, `readOnly`, `maxLength`, `autoComplete`, `colSpan`, `srcSet`, `crossOrigin` and the rest,
  plus `className`, `htmlFor`, `acceptCharset`, `httpEquiv`.
- SVG: `strokeWidth`, `fillOpacity`, `clipPath`, `stopColor`, `textAnchor` and the rest become their dashed attributes.
  `xlinkHref` becomes `xlink:href`. Case-sensitive attributes such as `viewBox` and `gradientUnits` stay as written.

The compiler resolves names it can see, so they cost nothing at run time. A spread
resolves its keys in `attrName` (`@weft-js/core/dom`). One gap: on an SVG element a spread lowercases only `tabIndex`,
`crossOrigin`, `hrefLang` and `referrerPolicy`; other HTML-only camelCase names there keep their case. SVG font attributes
(`unitsPerEm`, `horizAdvX`), which no browser reads, also keep their case in a spread. An app with no `{...spread}` on an
element ships none of this.

## Values

- `style` takes camelCase or kebab-case names and custom properties. Numbers get `px` unless the property is unitless,
  as in React. `null` and booleans mean no declaration, so `color: on && 'red'` works.
- `dangerouslySetInnerHTML={{ __html }}` is `innerHTML`. The HTML isn't escaped.
- `defaultValue` and `defaultChecked` set the starting value of an `<input>` or `<textarea>`. Later changes reach an
  untouched field and leave an edited one alone.
- `value` and `defaultValue` work on `<textarea>` and `<select>`, including literals.
- `autoFocus` focuses on mount, not only during page load. Hydrating, the server's attribute does this instead.

## Events and form fields

- **`onChange` fires on every edit, as in React**, not on blur. One edit fires it once: on a text input per keystroke,
  and on a checkbox, radio, select or file input when the value changes. On a `<form>` it hears its fields per
  keystroke. A `change` event with no `input` before it, such as `fireEvent.change` in a test, still fires it. To act
  on commit, use `onBlur`, or `on(el, 'change', fn)` from `@weft-js/core/browser`. `onInput` is the plain `input` event.
- **`false` is written as a word on `contentEditable`, `spellCheck`, `draggable` and `focusable`**, as it is on
  `aria-*`. Removing the attribute would inherit or fall back to the default instead of turning the state off.
- **`select` with `defaultValue={x}` follows `x`**: it behaves as `value`. React reads it once.
- `onDoubleClick` listens to `dblclick`. The `Capture` forms (`onClickCapture`) listen in the capture phase;
  `onChangeCapture` listens to `input`.

## Where weft differs from React

**`data-*` booleans are presence flags.** `data-open={true}` writes `data-open=""` and `data-open={false}` removes it;
React writes `"true"` and `"false"`. So `[data-open]` works in weft, and `[data-open="true"]` doesn't match. For React's
output, pass a string: `data-open={String(open)}`. weft's own components and recorded output depend on the presence form,
so this stays. `weft check` reports a literal `{true}` or `{false}` here as W043, and `weft fix` rewrites it to what it
already renders: `data-open`, or nothing.
