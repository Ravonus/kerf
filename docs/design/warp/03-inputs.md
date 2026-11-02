# warp 03 — Inputs and forms

Status: v0.2, 2026-10-28. Tokens: [tokens/warp.css](tokens/warp.css) (signature layer) +
[tokens/warp-inputs.css](tokens/warp-inputs.css) (`@layer warp.inputs`). Specimen:
[specimens/inputs.html](specimens/inputs.html) (the canonical settings bar, 01-foundations §13: Expression · Fields ·
Theme · Density · Motion · Flair, page extra Pointer; URL params `?expression=&fields=&theme=&density=&motion=&flair=&pointer=`,
old `?stop=` still works). Signature: [SIGNATURE.md](SIGNATURE.md).
Temporal and rich inputs: [04-inputs-rich.md](04-inputs-rich.md) (same shell, same `FieldShell`).

**Coverage.** Every row COVERAGE.md assigns to `inputs`: forms (FormField, KitForm, DynamicForm), every file in the
old `inputs/**` except Address, Phone, PlaceLookup, PaymentCard and the date/time pickers (rich), pickers (Select,
Combobox, MultiCombobox, ColorPicker), validation (`useForm`, `V`, `zodErrorsToFieldMap`), primitives (HoverScope,
icon sweep), and all 22 §2.1 gaps. §9 maps each row to its section and its specimen demo.

---

## 1. The field shell (what the rich designer must follow)

One shell, `<Field>`, renders every text-like input. Choice, range and file controls reuse its parts (§5).

```
root [data-scope=field] [data-variant?] [data-appearance=line?] [data-invalid|data-valid|data-loading|data-disabled|data-readonly|data-open]
├─ control [data-part=control] [data-sweep] [data-phase=idle|in|out] [data-filled?] [data-pin?]
│   ├─ sweep-base   aria-hidden   resting border, --warp-color-sweep-base, 1px
│   ├─ sweep        aria-hidden   accent border, --warp-color-sweep, --warp-sweep-width (1 → 1.5px)
│   ├─ icon?        aria-hidden   two copies of the glyph: sweep-base (text-subtle) + sweep (accent), clipped like the border
│   ├─ label        always a real <label>: <label for> on a labelable input, or <label id> + aria-labelledby on a
│   │               [role=combobox] trigger / composite group. Its text is split into <span data-char> (display:
│   │               inline, --d delays). NOT aria-hidden: its text is the accessible name.
│   ├─ prefix?      fixed text, never submitted; visible once the label has lifted (always, in classic)
│   ├─ input        the one interactive element: <input>, <textarea>, <select>, or a [role=combobox] trigger
│   ├─ suffix?
│   ├─ end slots    in this order: spinner · status · clear · action · stepper · indicator (24px, hit area ≥ 44px on touch)
│   └─ popup?       popovers are children of control, so label and sweep stay up while open (data-open = force)
└─ message [data-part=message] id → merged into the input's aria-describedby
    ├─ hint | error [role=alert] (error replaces hint, slides in over --warp-message-duration)
    └─ counter? (tabular; caution at 90%, critical over the limit)
```

**Anatomy decisions (binding on 04-inputs-rich).**
1. **One control per field.** Every border, label and slot lives inside `control`. Segmented date inputs, RTE frames
   and iframes go in the `input` slot. Never add a second bordered box inside.
2. **The label is the accessible name.** It is a `<label for>`, never hidden and never paired with an `aria-label`.
   The character spans are `display: inline` (warp.css), so the computed name and `textContent` are "First name",
   never "F I R S T   N A M E" (review 03 B1: Chrome inserts a space between *inline-block* children). Split on
   plain spaces, not `&nbsp;` (`white-space: pre` keeps them). Never wrap the letters in a second, `aria-hidden` copy
   beside a hidden text copy: `getByLabelText` and `textContent` would then read the label twice.
   - A **select-only combobox** (a `button[role=combobox]` trigger, the APG pattern) takes its name from the label, with no `for`, since a `for` would make a label press click the button and open the list, so the label is a
     `<label id>` and the trigger has `aria-labelledby` = that id **only**. The value is the trigger's content; adding
     the value id to `aria-labelledby` reads it twice ("Plan Team").
   - A **composite** (date segments, phone, chips + input) is a `role=group` named by `aria-labelledby` → the label.
     Its sub-parts carry short names ("month", "day"), which is the APG and React Aria practice. Clicking a label with
     no `for` focuses the first focusable part.
   - Controls with no visible text (a gradient angle knob, the hue rail) keep `aria-label`. Controls with a visible
     caption (Rotation, Stereo position, Seats) use `aria-labelledby` or `<label for>` on that caption.
3. **Every input has a placeholder**, `" "` at minimum. The float uses `:placeholder-shown`, so a real placeholder
   shows only after the label lifts (floating) or always (classic). Custom triggers set `data-filled`.
4. **Phase is one attribute on the control**, written by `sweep()`. It goes `idle → in` on hover (not touch), focus,
   `data-pin` or an open popup. It goes `in → out` when that ends, and `out → idle` on `transitionend` for
   clip-path/transform, with a duration+150ms backstop (immediately when the duration is 0). The sweep never reverses.
5. **Error pins the sweep** in `--warp-color-sweep-critical`: `[data-invalid]` on the root, or on the host for cells,
   cards and the dropzone. `aria-invalid` goes on the input, and the error text goes in the message.
6. **The notch matches what's behind it.** `notch()` finds the first opaque or image background behind the field and
   sets `--_notch-color` on the label. For gradients and images it also sets `--_notch-image/-size/-pos`, so the label
   window is pixel-aligned. It re-runs on resize, on theme and density changes, and on the Fields toggle.
7. **Per-character tint delay** = (label x + char x) ÷ control width × sweep duration, recomputed after the label's
   font-size transition ends. The tint arrives exactly when the sweep passes each letter.
8. **Sizes** set `--warp-field-height` only (`sm`, `md`, `lg`; ≥ 44px on a coarse pointer). The notch adds 4px of
   top room, not height.
9. **No new tokens.** The sweep uses the foundations tokens (`--warp-color-sweep*`, `--warp-sweep-*`,
   `--warp-label-*`). The field fill is `--warp-color-field`, which is accent-tinted by design.

### 1.1 Fields: floating | classic
`warp({ fields: "floating" | "classic" })` writes `data-fields` on the root. `<Form fields>` overrides it for a
subtree, and `variant` on a field (`data-variant`) overrides that. The markup is identical for both. Only CSS
differs:

| | Floating (default, the signature) | Classic |
|---|---|---|
| Label at rest | inside the box, body size, rest colour | above the box, body-strong |
| Hover / focus / value | rises into a notch in the top border: 10px caps, per-char tint | stays put; tints per char with the sweep |
| Placeholder, prefix, suffix | hidden until the label lifts | always visible |
| Sweep, icon sweep, error pin | yes | yes |
| Group legends, range heads | caps "float" style | plain label style |

Date and time inputs always float, because their segments are the placeholder (rich §1). `appearance="line"`
(FloatingLineInput) is a third look on the same parts. It has a bottom hairline and an accent line that scales in
from the left and exits to the right, and no notch.

### 1.2 States

| State | Root | Visual |
|---|---|---|
| rest | — | base border; label inside (floating) |
| hover (fine pointer) | phase in | sweep L→R, label lifts, chars tint |
| focus (keyboard or pointer) | `:focus-within` | as hover, +1px sweep; caret in accent; no outline (the sweep is the focus indicator, ≥ 3:1) |
| filled | `data-filled` / value | label stays lifted at rest in the resting floated colour (accent + 40% black) |
| invalid | `data-invalid` | critical sweep pinned; error replaces hint; one shake at vivid only |
| valid (async) | `data-valid` | status tick; "Available"-style hint |
| loading | `data-loading` | spinner in the end slot; `aria-busy`. Under reduced motion the spinner doesn't turn: it pulses its opacity (1 → 0.45, 1.6s) |
| disabled | `data-disabled` + `disabled` | 50% opacity, no sweep, not focusable |
| read-only | `data-readonly` + `readonly` | dashed base, no fill; focusable, copyable, sweeps |
| open | `data-open` | sweep and label forced up while a popup is open |

### 1.3 Validation timing
Errors appear late and clear early:
- **Typing a first value:** no error is shown.
- **Blur:** the field is checked once.
- **After an error:** it re-checks on every key, so the danger sweep lets go the moment the value is fixed.
- **Async checks:** 400ms debounce. The previous request is aborted and the old message stays until the new answer
  arrives. The result is announced politely.
- **Submit, one invalid field:** focus moves to that field.
- **Submit, two or more:** an error summary (`role=alert`, focused) lists them, and each entry links to its field.

The vivid stop shakes the invalid fields once. Quiet, balanced and reduced motion don't.

---

## 2. TypeScript API

Shared with 04-inputs-rich (identical `Bindable`, `ChangeReason`, `Openable`, `FieldShell`):

```ts
type Bindable<T> =
  | { value: State<T>; defaultValue?: never; onValueChange?: (v: T, reason: ChangeReason) => void }
  | { value?: T; defaultValue?: T; onValueChange?: (v: T, reason: ChangeReason) => void };
type ChangeReason = "pointer" | "keyboard" | "programmatic";
type Openable = { open?: State<boolean> | boolean; defaultOpen?: boolean; onOpenChange?: (o: boolean) => void };

type FieldShell = {
  label: string; hint?: string; error?: string | State<string | null>; icon?: IconName;
  variant?: "floating" | "classic";                 // default: nearest <Form fields> → warp({ fields })
  appearance?: "box" | "line";                      // line = FloatingLineInput
  required?: boolean; disabled?: boolean; readOnly?: boolean; size?: "sm" | "md" | "lg";
  prefix?: JSX.Element; suffix?: JSX.Element; name?: string;
  locale?: string;                                  // default: nearest <Surface lang> → document lang
  labelBackground?: string;                         // overrides the measured notch fill
};

// The shell itself, for anything not listed below (rich inputs build on this):
function Field(p: FieldShell & { children: JSX.Element /* the input slot */; end?: JSX.Element;
  counter?: number; loading?: boolean; valid?: boolean; force?: boolean /* = data-open */ }): JSX.Element;
```

Rules:
- `value` is a `State<T>`: the input writes to it, with no `onChange` plumbing. `defaultValue` makes the field
  uncontrolled.
- `onValueChange` fires with a **complete** value. A half-typed number or a partial mask is not a value; `reason`
  says why it changed.
- Text values are strings. Numbers are `number | null`. Currency is `{ minor: bigint | number; currency: string }`,
  integer minor units. Percent stores a fraction.
- `error` alone controls invalid. `aria-invalid`, the critical sweep, and `role=alert` all follow from it.
- `name` writes a hidden input with the serialised value, so native `<form>` posts work.

```ts
type TextFieldProps = FieldShell & Bindable<string> & { type?: "text" | "email" | "url" | "search" | "tel";
  maxLength?: number; counter?: boolean; clearable?: boolean; autoComplete?: string; inputMode?: string; enterKeyHint?: string };
type PasswordFieldProps = FieldShell & Bindable<string> & { reveal?: boolean; strength?: boolean | ((v: string) => 0|1|2|3|4);
  rules?: { id: string; label: string; test: (v: string) => boolean }[]; generate?: boolean; mode?: "new" | "current" };
type NumberFieldProps = FieldShell & Bindable<number | null> & { min?: number; max?: number; step?: number;
  stepper?: boolean; scrub?: boolean; format?: Intl.NumberFormatOptions; unit?: string };
type CurrencyFieldProps = FieldShell & Bindable<{ minor: number; currency: string } | null> & { currencies?: string[] };
type MaskedFieldProps = FieldShell & Bindable<string> & { mask: string /* 0 digit · A alnum · literals */; raw?: boolean };
type QuantityProps = Bindable<number> & { min: number; max: number; step?: number; label: string };
type OtpProps = Bindable<string> & { length: number; masked?: boolean; label: string;
  onComplete?: (code: string) => void | Promise<void | { error: string }>;  // a returned error = wrong code
  autoSubmit?: boolean /* default true: completing the code calls onComplete, then submits the form */; error?: string };
type InlineEditProps = Bindable<string> & { label: string; placeholder?: string; validate?: (v: string) => string | null };
type InputGroupProps = { children: JSX.Element[] };   // Addon | Field | Button, joined corners
type SelectProps<T> = FieldShell & Bindable<T | null> & Openable & { options: Option<T>[] | Group<T>[];
  presentation?: "auto" | "popover" | "sheet"; searchable?: boolean };
type ComboboxProps<T> = FieldShell & Bindable<T | null> & Openable & { options: Option<T>[] | ((q: string, s: AbortSignal) => Promise<Option<T>[]>);
  creatable?: boolean | ((q: string) => T); };
type MultiComboboxProps<T> = FieldShell & Bindable<T[]> & Openable & Omit<ComboboxProps<T>, keyof Bindable<T | null>>;  // TagsInput
type AutocompleteProps = FieldShell & Bindable<string> & { suggest: (q: string, s: AbortSignal) => Promise<string[]> };
type CascaderProps = FieldShell & Bindable<string[]> & Openable & { tree: CascadeNode[] };
type TreeSelectProps = FieldShell & Bindable<string[]> & Openable & { tree: TreeNode[]; checkStrategy?: "leaves" | "parents" };
type ListboxProps<T> = Bindable<T[]> & { options: Option<T>[]; multiple?: boolean; label: string };
type TransferProps<T> = Bindable<T[]> & { options: Option<T>[]; titles: [string, string] };
type CheckboxProps = Bindable<boolean | "mixed"> & { label: string; hint?: string; error?: string };
type SwitchProps = Bindable<boolean> & { label: string; hint?: string; size?: "sm" | "md"; placement?: "start" | "end" };
type RadioGroupProps<T> = Bindable<T> & { options: Option<T>[]; orientation?: "horizontal" | "vertical"; cards?: boolean };
type SegmentedProps<T> = Bindable<T> & { options: Option<T>[]; size?: "sm" | "md"; label: string };
type ChipGroupProps<T> = Bindable<T[]> & { options: Option<T>[]; multiple?: boolean; label: string };
type SliderProps = Bindable<number> & { min: number; max: number; step?: number; ticks?: string[]; format?: (v: number) => string; label: string };
type RangeSliderProps = Bindable<[number, number]> & Omit<SliderProps, keyof Bindable<number>> & { histogram?: number[]; names?: [string, string] };
type KnobProps = Bindable<number> & { max?: number /* 360 */; step?: number; variant?: "arc" | "hue"; label: string };
type XYPadProps = Bindable<{ x: number; y: number }> & { labels: [string, string]; format?: (x: number, y: number) => string };
type RatingProps = Bindable<number> & { max?: number; label: string };
type ColorPickerProps = FieldShell & Bindable<string /* #rrggbb */> & { swatches?: string[]; eyedropper?: boolean; alpha?: boolean };
type GradientEditorProps = Bindable<{ angle: number; stops: { at: number; color: string }[] }> & { label: string };
type FileDropzoneProps = Bindable<UploadItem[]> & { accept?: string; multiple?: boolean; maxSize?: number;
  upload: (f: File, signal: AbortSignal, progress: (p: number) => void) => Promise<void>; camera?: boolean };
type ImageCropProps = Bindable<CropRect> & { src: string; aspect?: number; preview?: boolean };
```

---

## 3. Text family

Mobile column: `type` · `inputmode` · `enterkeyhint` · `autocomplete`. Every field uses 16px text on a coarse
pointer, so iOS doesn't zoom. Motion is per stop. The sweep runs 240 / 300 / 340ms (quiet / balanced / vivid); the
label float takes `--warp-label-float-duration`. Reduced motion changes colour instantly and fades the label over
120ms.

| Input (old name) | Variants · states | Keyboard (APG) | Mobile | ARIA | Motion |
|---|---|---|---|---|---|
| **TextField** (FloatingBorderInput) | floating · classic · line; sm/md/lg; icon, prefix, suffix, clear, counter; every §1.2 state | native text editing; Esc clears when `clearable` (if not empty) | text · — · next · per field (`name`, `email`, `organization` …) | label `for`; message in `aria-describedby`; `aria-invalid` | sweep + float + char tint; error shake at vivid only |
| **FloatingLineInput** | `appearance="line"` | as text | as text | as text | accent line scaleX from the left; exits to the right |
| **Email · URL** | icon; URL with display-only scheme prefix | as text | `email` · `email` · next · `email`; `url` · `url` · go · `url`; `autocapitalize=off spellcheck=false` | as text | as text |
| **PasswordInput** | reveal, strength meter (4 clip rails + word), rules checklist, generate | reveal is a toggle button (Space/Enter), `aria-pressed` | `password` · — · done · `new-password` / `current-password` | rules list is `aria-describedby`; meter is `aria-live=polite` | meter segments fill L→R in sweep timing; each rule tick draws itself in 180ms |
| **SearchInput** | recent, results, `/` shortcut, clear | APG Combobox (list autocomplete): ↓↑ move, Enter picks, Esc closes (and calls `preventDefault`, so `type=search`'s native clear can't fire `input` and reopen the popup), a second Esc clears | `search` · — · search · off | `role=combobox`, `aria-expanded`, `aria-activedescendant` | popup open = sweep forced in |
| **Autocomplete** *(gap)* | free text with suggestions; value not constrained | APG Combobox; no auto-highlight, so Enter keeps the typed text | as text · search/done | as SearchInput | as SearchInput |
| **Textarea** | auto-grow 3→10 lines (`field-sizing`, JS fallback), counter, ⌘↩ submits | native | text · — · enter | counter is in `aria-describedby` | label rests on the first line |
| **NumberInput** | stepper (−/+, `tabindex=-1`), scrub handle (fine pointer only), unit suffix, locale format on blur | APG Spinbutton: ↑↓ step, ⇧ ×10, PgUp/PgDn ×10, Home/End min/max | text · `numeric`/`decimal` · next | `role=spinbutton`, `aria-valuenow/min/max` | stepper boxes grow to 40px on coarse, and each one's 2px expander makes a full 44×44 area without covering its neighbour |
| **CurrencyInput** | symbol prefix + ISO suffix from the locale; percent variant stores a fraction | as number | `decimal` | `aria-describedby` names the currency | as text |
| **MaskedInput** | template `[data-part=mask]` (literals as `<em>`), shown on focus or when filled; value is the raw chars | native; paste accepts with or without separators | `numeric` for all-digit masks | hint states the format in words | template fades in with the float |
| **Quantity** | one swept box; − value +; disables at min/max | APG Spinbutton | `numeric` | `role=spinbutton` on the input, named by a visible `<label for>` (the row title); the price line is its `aria-describedby` | sweep on the box |
| **OTPInput** | 4–8 painted cells over **one real input**; separator; masked PIN; auto-submit when complete (`autoSubmit={false}` opts out) → `onComplete(code)`; checking state | one tab stop; native editing; paste of the full code fills every cell | `numeric` · done · `one-time-code` (iOS/Android SMS fill lands in the one input) | one input, one label; `aria-busy` while checking; wrong code: `aria-invalid` + `role=alert` message | the active cell pins its sweep. Wrong code: critical sweep pinned on every cell, one shake at vivid only (never under reduced motion), then after 900ms the cells clear and focus returns to cell 1; the message stays until the next key |
| **InputGroup** | addon · field · button, joined corners; a button is field-height | native | per field | addon text is in the label or the hint | each part sweeps on its own |
| **InlineEdit** | preview (swept, no resting edge) ↔ sm field + save/cancel | Enter saves, Esc cancels, focus returns to the preview | as text | preview is a button "Edit {label}, {value}" | the preview sweeps; the swap is instant |
| **Read-only + copy** | dashed base, copy action | focusable; the copy button announces "Copied" | — | `readonly` (not disabled) | as text |

---

## 4. Choice family

| Input (old name) | Look | Keyboard (APG) | ARIA | Motion |
|---|---|---|---|---|
| **Checkbox** (FloatingBorderCheckbox) · **CheckboxGroup** · **checkbox tree** | 20px box; **unfilled**; sweep border; the accent check (or dash) draws in by dashoffset over 420ms; tri-state parent | Checkbox: Space toggles; a group is a `<fieldset>` | a native `input type=checkbox` sits under the painted box; `indeterminate` is real; error via `aria-describedby` | sweep + the check draws; invalid pins critical |
| **RadioGroup** · **radio cards** *(gap)* | 20px ring, dot scales in; a card pins its sweep on accent-soft when checked | Radio Group: one tab stop, arrows move and select | native radios in a `<fieldset><legend>` | sweep; the dot pops |
| **Switch** | track 44×24, knob 18px. **The fill sweeps through the rail** L→R (clip-path, sweep duration) while the knob slides (420ms × motion). Off + hover: the ring sweeps. On + hover: an `accent-hover` layer sweeps through the inside | Switch: Space toggles | `input type=checkbox role=switch`; applies at once (never inside a form with a Save button) | rail per SIGNATURE §1c |
| **Segmented** | the group rests on the ink border and does **not** sweep. Hovering or focusing an **unselected** option sweeps a ring around that option only (original `Segmented.tsx`); the selected option never sweeps. The accent-solid indicator slides to the selection (420ms, sweep ease): that slide is the rail. The group is `position: relative`, the indicator's containing block | Radio Group | native radios | per-option ring L→R in and out; indicator slide |
| **Chips** (toggle group) | pill; hover sweeps; pressed pins the sweep on accent-soft and draws the check | button: Space/Enter; single choice uses `role=radio` with roving tabindex | `aria-pressed` | sweep + check draw |
| **Select** | warp's trigger and list on every device, a sheet on a phone, same shell, chevron rotates | Select-only Combobox: ↓/Enter/Space opens, ↑↓ Home End, typeahead, Enter picks, Esc/Tab closes | `role=combobox` on the trigger, `aria-labelledby` = the `<label id>` only (the value is the trigger's content), `aria-controls` = the listbox, listbox with groups | popup opens with sweep forced; the highlight sweeps in as a fill |
| **Combobox** | async (350ms; stale results dimmed), creatable ("Create …" last, never the default) | Combobox (list) | `aria-activedescendant`; result count in a polite live region | as Select |
| **MultiCombobox · TagsInput** | tags wrap inside the box; Enter or comma adds; paste "a, b, c" adds three | ←→ walk the tags, ⌫ highlights then removes | each add and remove is announced | tag pops in |
| **Listbox** *(gap)* · **Transfer** *(gap)* | always-open list; multi with check boxes; transfer = two listboxes + move buttons; stacks under 520px | Listbox: ↑↓, Space toggles, ⇧↑↓ extends, ⌘A all | `aria-multiselectable` | the highlight fill sweeps |
| **Cascader** *(gap)* | select trigger; popup with one listbox column per level; the trail stays tinted; value reads "Europe / Germany" | from the trigger: ↑↓ in a column, → or Enter opens the next column, ← goes back | `aria-controls` → the first column; `aria-activedescendant` spans the columns | as Select |
| **Tree select** *(gap)* | select trigger; `role=tree` popup with tri-state checkboxes | Tree: ↑↓, → expand / first child, ← collapse / parent, Space checks | `aria-haspopup=tree`, `aria-controls` → the tree, `aria-activedescendant` → a treeitem; `aria-checked` true/false/mixed, `aria-expanded` | the check draws itself |

**One select everywhere.** The owner's call, reversing the earlier split: no device gets the OS picker. Warp draws the
list on every pointer: a popover where there is room, and under 600px a sheet with a title and Done, where focus moves
onto the rows because mobile screen readers follow `aria-activedescendant` unreliably. A hidden real `<select>` stays the
form value, so posting, reset, `required`, autofill and `onChange` all behave, and with scripting off it is what shows.
The cost: the OS sheet was free for accessibility, so the warp sheet needs its own VoiceOver and TalkBack passes before a
release. `presentation="popover" | "sheet"` overrides the width rule. Over 15 options the list adds a search (`searchable`
overrides that); with free text, use Combobox. Up to 5, show
them (radio, segmented, chips).

---

## 5. Range, colour and files

| Input (old name) | Look | Keyboard (APG) | ARIA | Motion |
|---|---|---|---|---|
| **Slider** | the filled range is a **rail**: hover or focus sweeps `accent-hover` through it. Thumbs are hollow accent rings (filled while dragged), with a value bubble on touch and ticks that snap | Slider: ←→↑↓ step, ⇧ ×10, PgUp/PgDn ±10%, Home/End | `role=slider`, `aria-valuetext` ("40%", not "40") | rail per §1c |
| **RangeSlider** · **with histogram** *(gap)* | two thumbs that can't cross; paired fields give an exact-value path (WCAG 2.5.7); histogram bars inside the range take the accent | as Slider, per thumb | each thumb has its own name; the histogram is `aria-hidden`, and the result count is announced | bars recolour in 180ms |
| **Knob / angle** *(gap)* · **hue wheel** *(gap)* | 64px swept ring; arc rail; pointer dot; value in the centre; `variant="hue"` is the colour wheel | Slider: ←→ ±1, ⇧ ±15, Home/End | `role=slider` named by its visible caption (`aria-labelledby`), `aria-valuetext` "45 degrees" | arc brightens under the pointer |
| **XY pad** *(gap)* | swept box, crosshair rails, one hollow thumb | ←→ x, ↑↓ y, ⇧ ×10 | one `role=slider` named by the visible range head (`aria-labelledby`); `aria-valuetext` gives both values | sweep |
| **Rating** | stars fill left to right; hover previews | Radio Group | five native radios | 40ms stagger, like the char tint |
| **ColorPicker** · **swatches** *(gap)* · **area + channel sliders + eyedropper** *(gap)* | XY area, hue slider, hex field (normal shell, swatch dot), EyeDropper only where it exists, swatch radio group. Swatches are 24px on a fine pointer, 36px on an 8px gap (a 44px pitch) on a coarse one | area thumb: arrows; swatches: Radio Group (one tab stop on the checked swatch, arrows move and select) | area `aria-valuenow` (saturation %, 0–100) + `aria-valuetext` "Saturation 62%, brightness 58%" | sweep on the hex field |
| **Gradient editor** *(gap)* | preview, a bar with stop thumbs, angle knob, H/L channel sliders, CSS output | stop: ←→ move, Delete removes, Tab next stop; click the bar to add | each stop is a `role=slider` | as Slider |
| **FileDropzone** · **upload list** *(gap)* | dashed base + sweep; dragging pins the sweep and lifts the icon; a wrong type pins critical; on touch the copy becomes "Choose files" + "Take photo" | a native file input inside, named by the drop copy (`aria-labelledby`) and described by the type and size hint; the buttons are real buttons | per row: progress `role=progressbar`, polite result; Retry and Remove keep the file name | progress is a clip rail |
| **Image crop** | frame drag, zoom slider, exact output preview | arrows move, +/− zoom | frame is focusable with a hint | — |

---

## 6. Forms

**Primitives.**
- **`<Field>`** (§1). **`<FormField>`**, the old name, is kept as an alias.
- **`<Fieldset legend description>`** renders a native `<fieldset>` + `<legend>`, styled caps in floating mode and
  plain in classic.
- **Marks.** The default marks *optional* fields with an "Optional" hint. `<Form mark="required">` draws a
  CSS-only asterisk (`content: "*" / ""`) that screen readers skip; the input carries `required`.

**Layout answers the form's container**, not the viewport:
- one column below 600px;
- `columns={2}` from 600px, with `span="full"` for wide fields;
- `layout="aside"` from 900px puts each section title in a 15rem aside;
- below 600px, `actions sticky` pins the submit bar to the scroller bottom, respecting the home indicator,
  with full-width buttons and the status on its own line.

Section legends are floated so they become grid items. A rendered legend can't take a grid column.

**Wizard.**
- Steps are clip rails.
- Each step validates before moving on and keeps its values when you go back.
- Focus moves to the step heading.
- The last button names the action ("Send invites").

**Unsaved changes** *(gap)*.
- A save bar (`role=region "Unsaved changes"`, Discard · Save) wipes in L→R while any value differs from the saved
  snapshot, and leaves when it matches again.
- Leaving while dirty asks first: `beforeunload` and the router guard.
- It never covers the focused field.

**Autosave** *(gap)*.
- Saves 800ms after the last key.
- Status is `saving → saved` or `failed` with a Retry button, in a polite live region. It is never announced per
  keystroke.
- On failure, the text stays.

**Settings rows.**
- Label and hint on the left, the control at the end.
- Changes apply immediately and are confirmed with a toast. There is no Save button.

**`useForm(schema, { defaults, mode })`** (from the old `useForm` / `V` / `zodErrorsToFieldMap`):
- It returns `{ values: State<z.input>, errors: State<Record<path, string>>, touched, submit, reset, dirty,
  field(path) }`.
- `field(path)` returns props for any `FieldShell` input: `value`, `error`, `name`, `required`, and the `onBlur`
  that drives §1.3.
- `zodErrorsToFieldMap(err)` maps issues to paths. A server error map uses the same path and lands on the same
  fields.
- `V` is the small built-in validator set (`required`, `email`, `min`, `max`, `pattern`, `matches`) for forms
  without Zod.

**Zod 4 → fields (DynamicForm, old KitForm).** `<DynamicForm schema={Project} fields="floating" />` renders one input
per key, in key order:

| Zod node | Input | Notes |
|---|---|---|
| `z.string()` | TextField | `.email()` → email, `.url()` → url; `.max(n)` → counter |
| `z.enum([...])` ≤ 5 | Segmented (in a Fieldset) | > 5 → Select; > 15 → Combobox |
| `z.int()` | NumberField + stepper | `.min/.max` → bounds and hint |
| `z.number()` + `meta({ unit })` | CurrencyField | |
| `z.boolean()` | Switch | |
| `z.array(z.string())` | MultiCombobox (tags) | |
| `z.object()` | Fieldset | nested keys recurse |
| `.optional()` | — | "Optional" hint |
| `.default(v)` | — | initial value via `parse({})` |
| `.meta({ label, hint, icon, placeholder, widget })` | — | copy and overrides; `widget` forces an input |

Submit runs `safeParse`. Success emits `z.output`. Failure maps issues to fields and follows the §1.3 submit rules.
`KitForm` is DynamicForm with the old layout props (`columns`, `sections`).

---

## 7. Shared mechanics

- **HoverScope** (with `useIconSweepHover`) lifts hover and focus from a whole row, card or link onto the swept parts
  inside it, by setting `data-pin`. A big target still plays the small sweep.
- **Icon tile** is FloatingBorderIcon: a swept 40px box with two glyph copies.
- **Popups.** A popup is a child of `control`. It opens 6px below, at most 320px or 50vh tall. The highlighted option
  gets an accent-soft fill (sweeping in through a `::before` clip) and a 2px accent bar.
- **Group labels** are caps. "Create …" is always the last option and never the default unless nothing matches.
- **Live regions.** A field has at most one live region (`[data-part=live]`, polite). Errors use `role=alert` and
  are written on blur and submit; while typing, the text is only cleared.
- **Touch.** Every hit area is at least 44px on a coarse pointer (`--warp-hit-min`, 24px on fine pointers, so the
  rules are no-ops on desktop). Two rules keep that true when targets sit side by side:
  - an expander (`::before`/`::after` with `inset: min(0px, calc((100% - var(--warp-hit-min)) / 2))`) only works when
    its neighbour's expander can't cover it. In-field icon buttons (reveal + generate, clear) become 40px boxes with no
    negative margin on coarse; stepper boxes become 40px; swatches become 36px on an 8px gap.
  - an expander inside `overflow: hidden` is clipped for hit-testing too. Chips and sm/icon buttons use
    `overflow: visible`, and their hover layer clips itself with `border-radius: inherit`.
  Scrub is fine-pointer only. Inline text links in prose are exempt (WCAG 2.5.8).
- **Icons.** Every decorative `<svg>` carries `aria-hidden="true" focusable="false"`; the `ico()` helper writes it.
- **Combobox popups are the listbox.** The popup wrapper is presentational (no `role=dialog`); the combobox's
  `aria-controls` points at the listbox. When the popup closes, `aria-activedescendant` is removed with it.

## 8. Do / don't

| Do | Don't |
|---|---|
| Put every part of an input inside one `control` so the sweep traces it | Nest a second bordered box (date segments, RTE toolbars) inside the field |
| Keep the label as the name; `aria-describedby` the message | `aria-hidden` the label or duplicate it in `aria-label` |
| Keep the character spans inline, so the label text is the name | Make `[data-char]` inline-block ("F I R S T"), or add a hidden second copy of the text |
| Name a select-only trigger with its label id alone | Put the value id in `aria-labelledby` too |
| Validate on blur, re-check live after an error, summarise on submit | Show "Invalid email" while someone is typing their first character |
| Use `inputmode` + `pattern` for numbers | Use `type="number"` (wheel changes, "e", locale bugs) |
| Show up to 5 options; select from 6–15; combobox beyond | Hide 3 options behind a select |
| Give a touch picker its own sheet, tall enough for the keyboard | Build a picker the keyboard covers |
| Let the switch apply at once | Put a switch in a form that also has Save |
| Pin the sweep (`data-pin`) for drag, open or active states | Invent a new focus ring or a second accent |
| Use `fields="classic"` when an app wants conventional forms | Fork the markup for classic; it is CSS only |
| Pass `labelBackground` when the notch sits on a moving or video background | Fill the notch with the field colour on a gradient |

## 9. Coverage map

| COVERAGE row | Section | Specimen |
|---|---|---|
| FormField · KitForm · DynamicForm | §1, §6 | 07 Forms (devices, schema → fields) |
| FloatingBorderInput · FloatingLineInput · FloatingBorderIcon · HoverScope | §1, §1.1, §7 | 01 The shell; 08 HoverScope |
| PasswordInput · SearchInput · Textarea · NumberInput · CurrencyInput · MaskedInput · OTPInput · InputGroup · InlineEdit | §3 | 03 Text family |
| FloatingBorderCheckbox · CheckboxGroup · RadioGroup · Switch | §4 | 04 Choice family |
| Select · Combobox · MultiCombobox · TagsInput | §4 | 04 Choice family |
| Slider · RangeSlider · Rating · ColorPicker | §5 | 05 Range family |
| FileDropzone | §5 | 06 File family |
| validation: `useForm`, `V`, `zodErrorsToFieldMap` | §1.3, §6 | 02 Validation; 07 schema demo |
| §2.1 gaps P0: Field/Fieldset, checkbox and radio cards, upload list, wizard | §6, §4, §5, §6 | 08 Field primitives; 04 cards; 06; 07 Wizard |
| P1: native select, autocomplete, listbox, checkbox tree, counter, password rules, swatches, save bar, autosave | §4, §3, §5, §6 | 04, 08, 03, 05, 08 |
| P2: cascader, tree select, transfer, scrub, knob, XY pad, histogram range, colour area/wheel, gradient | §4, §3, §5 | 08, 04, 03, 05 |

**Owned elsewhere.** Speech input with mic selector (§2.1), all-inputs sync (realtime recipes) and the CSV import
wizard (§2.13) are assigned to **app** in COVERAGE, not to inputs. The pieces they compose are here: a speech
prompt is a Textarea with an `action` mic button and a Select for the device; CSV import uses FileDropzone + upload
list, Select per column for the mapping, and the §1.3 validation summary for the preview.

## 10. Open issue for foundations/components

`warp-components.css` §S (layer `warp.components`, which comes after `warp.signature`) restyles **every**
`[data-part="sweep"]` and `[data-part="sweep-base"]`:
- the base is `--warp-color-border`, a hairline, not `--warp-color-sweep-base`;
- the sweep is `--warp-sweep-color` / `--warp-sweep-weight`;
- the inset is −1px.

That overrides the signature for anything that doesn't restate it, and it's why inputs first looked sweepless.
`warp-inputs.css` §0 restates the signature for input hosts only, inside `:where`. Components should scope §S to its
own hosts (buttons, surfaces) or adopt the signature tokens, so there is one sweep definition.
