# warp 04 — Rich inputs: time, place, ink and structure

Status: v0.2, 2026-10-28. Owner: interaction design, temporal and rich inputs. Reads: [00-direction.md](00-direction.md),
[01-foundations.md](01-foundations.md), [SIGNATURE.md](SIGNATURE.md), [tokens/warp.css](tokens/warp.css). Siblings:
`03-inputs.md` (core inputs), `07-app-patterns.md` (full calendar and scheduler). Specimen:
[specimens/inputs-rich.html](specimens/inputs-rich.html) (the canonical settings bar, 01-foundations §13, with page
extras Frame and Locale; deep links `?expression=vivid&theme=dark&frame=phone&locale=de-DE&open=date`). `old:` = the predecessor's `packages/ui/src/components/`.

**Coverage (rows owned by `rich`).** DatePicker → DateField · DateRangePicker → DateRangeField · DateTimePicker →
DateTimeField · TimePicker → TimeField · MonthPicker → MonthPicker · PhoneInput → PhoneField · AddressInput →
AddressField · PlaceLookupInput · PaymentCardInput · Code · CodeBlock · Markdown. The predecessor's names stay as
exported aliases. The 29 §2 gap rows are covered too: P0 (mentions, RTE, segmented date, range presets with
comparison, inline calendar, prose) and every P1/P2 row, in §2, §4 and §4b. Each has a section and a specimen demo.

### The field shell (SIGNATURE, non-negotiable)
Every input here, including the RTE frame, the signature pad and the card iframe, renders the warp.css
`warp.signature` anatomy: `root[data-scope=field] > control[data-sweep][data-phase] > sweep-base · sweep · icon? ·
label · body`, then `root > message`. The label is a `<label id>` whose text is split into inline
`<span data-char>` (one per character), so its text is still the name. Nothing below adds a second shell.
- **Sweep border.** `data-phase` runs idle → in → out → idle. It enters left to right on hover or focus and exits
  left to right, never reversing. The stroke is `--warp-color-sweep` (full accent, ≥ 3:1 against base and surface at
  every stop) over `--warp-color-sweep-base`, timed by `--warp-sweep-duration` (`--warp-ref-sweep` 480/620/700ms
  quiet/balanced/vivid). The icon sweeps with the border. **An error pins the sweep in, painted
  `--warp-color-sweep-critical`**, and the message slides in over 180ms with `role="alert"`.
- **Popovers stay attached.** A picker's popover is a child of `control`, so the label stays up and the sweep
  stays in while it's open (`force`). The popover carries its own sweep, gated by `--warp-sweep-surfaces` (on at
  vivid). The calendar's today cell is a 1px `accent-solid` inset ring, as in the old pickers.
- **`fields: "floating" | "classic"`.** `warp({ fields })` writes `data-fields` on the root. `<Form fields>` or a
  field's `variant` overrides it. *floating* (the default) is the signature label: it rests inside, then rises
  over the border into a notch on hover, focus or value. The notch matches what's behind it: a solid colour, or a
  pixel-aligned window onto a gradient or image. Label tint travels one character at a time (`--d` = x / sweep
  speed). *classic* puts the label above the box, with no float, notch or overlap, and placeholders visible. The
  sweep border and icon sweep stay in both modes.
- **The visible label is the accessible name** (03 §1 decision 2, review 03 M1). It is never `aria-hidden`, and the
  input never repeats it in `aria-label`. `shell().link()` wires it on every refresh:
  - one text control in the body (text, email, tel, textarea, the place and address comboboxes, the JSON and
    filter inputs) → `<label for>` on it, plus the message id merged into its `aria-describedby`;
  - a composite (date, range and time segments, duration, phone country + number, payment iframe) → the body is a
    `role=group` with `aria-labelledby` → the label; its segments keep short names ("month", "day", "hour"), as in
    the APG date picker;
  - a rich editor (`contenteditable` RTE) → `aria-labelledby` → the label;
  - a label with no `for` moves focus into the body when clicked.
  `aria-describedby` points at the message. Coarse pointers get 44px targets and 16px input text.

---

## 1. Cross-cutting decisions

### 1.1 Values are ISO 8601 strings; the engine is Temporal

**Decision.** Every temporal `Bindable` holds an **ISO string typed by shape** (`IsoDate`, `IsoTime`, …). Inside, the
component computes with `Temporal` (native where present, the polyfill loaded lazily otherwise).

**Why strings, not `Temporal` objects, at the boundary:** they serialize through server functions, URLs, forms and
agent tool calls (`Temporal` objects become `{}` in JSON); equality is `===`, which is what `State<T>` notifies on;
an agent reads and writes `"2026-10-28"` without importing anything; a page that only displays a date pays no
polyfill; and it's Temporal's own format, so `Temporal.PlainDate.from(v)` is one call (`weft/time` exports
`toPlainDate()`, `toZoned()`). `Date` never appears in the API: it conflates instant and wall time, which put the
predecessor's ranges off by one at DST boundaries.

```ts
import type { State } from "weft";
type IsoDate      = `${number}-${number}-${number}`;                 // Temporal.PlainDate      2026-10-28
type IsoTime      = `${number}:${number}` | `${number}:${number}:${number}`; // PlainTime   14:30
type IsoDateTime  = `${IsoDate}T${IsoTime}`;                          // PlainDateTime (wall time, no zone)
type IsoZoned     = `${IsoDateTime}${string}[${string}]`;             // ZonedDateTime …-07:00[America/Los_Angeles]
type IsoMonth     = `${number}-${number}`;                            // PlainYearMonth 2026-10
type IsoWeek      = `${number}-W${number}`;                           // ISO week 2026-W44
type IsoDuration  = `P${string}`;                                     // Temporal.Duration PT1H30M
type TimeZoneId   = string;                                           // IANA, e.g. "Europe/Berlin"
type DateRange    = { start: IsoDate | null; end: IsoDate | null };

type Bindable<T> =
  | { value: State<T>; defaultValue?: never; onValueChange?: (v: T, reason: ChangeReason) => void }
  | { value?: T; defaultValue?: T; onValueChange?: (v: T, reason: ChangeReason) => void };
type ChangeReason = "pointer" | "keyboard" | "programmatic";
type Openable = { open?: State<boolean> | boolean; defaultOpen?: boolean; onOpenChange?: (o: boolean) => void };

/** The SIGNATURE field shell every input below shares. */
type FieldShell = {
  label: string; hint?: string; error?: string | State<string | null>; icon?: IconName;
  variant?: "floating" | "classic";                             // default: nearest <Form fields> → warp({ fields })
  required?: boolean; disabled?: boolean; readOnly?: boolean; size?: "sm" | "md" | "lg";
  prefix?: JSX.Element; suffix?: JSX.Element; name?: string;   // name → hidden input with the ISO value
  locale?: string;                                              // default: nearest <Surface lang> → document lang
};
```

`onValueChange` fires only with a **complete, valid** value or `null`. A half-typed date is not a value. It stays
in the segments, and the field's `error` explains it on blur.

### 1.2 Phone presentation: decided per input

The rule: **use native when the OS control is strictly better and the value fits it. Use a custom sheet when the
input needs things native can't do** (ranges, presets, unavailable dates, a locale that differs from the device,
search). `presentation?: "auto" | "popover" | "sheet" | "native"` overrides it. `auto` picks a sheet when the
field's container is under 600px **or** the pointer is coarse and the viewport is under 600px.

| Input | Phone | Why |
|---|---|---|
| Date | **Custom bottom sheet**: month grid, typed entry at the top | Native `type=date` can't show unavailable dates or presets, takes the device's locale rather than the app's, and iOS gives a spinner with no week context. The sheet keeps one mental model across devices. |
| Date range | **Full-height sheet**: preset chips, then months scrolling vertically | Two months side by side can't fit 390px, and native has no ranges. |
| Time | **Sheet with scroll-snap wheel columns** (hour · minute · period) | A wheel is the thumb idiom. It's custom because iOS's native wheel ignores `step`, and 12/24h must follow the app locale, not the device. |
| Date-time | One sheet, segmented `Date` / `Time` tabs, a single Done | Two sheets in a row lose context. |
| Time zone · country · language · currency | **Full-screen sheet with search**, recents pinned | 400+ options need a search field and the keyboard, so a half sheet would be covered. |
| Duration | Wheel sheet (only the units you allow) | Same reason as time. |
| Month / year · week | Sheet: year stepper + 3×4 months · month grid with whole-row selection | `type=month`/`week` are unsupported on desktop Safari and Firefox, so the custom version is consistent everywhere. |
| Recurrence | Full-screen sheet (it's a small form) | It needs room for the plain-language summary. |
| Phone number | Inline native `type=tel` (`inputmode="tel"`); the country list is a full-screen sheet | The OS keypad and SMS autofill (`autocomplete="tel"`) beat anything custom. |
| Address | **Native fields only**, no sheet | OS autofill fills `address-line1…postal-code` in one tap. A sheet would hide it. |
| Rich text | Toolbar docked **above the keyboard** (`visualViewport`) | Bubble menus collide with the OS selection callout. |
| Emoji / icon | Half sheet, category tabs at the bottom (thumb reach) | — |

Sheets are modal `<dialog>`s with a grab handle, swipe-down to dismiss and an explicit **Done** (a swipe is never the only way out).

### 1.3 Typed entry: segments, masks, locale parsing

- **Date, time, date-time, duration and month use segmented fields.** Each part is a `role="spinbutton"`
  (`aria-valuenow/min/max`, `aria-valuetext="October"`, `aria-label="Month"`), ordered by
  `Intl.DateTimeFormat(locale).formatToParts()`, so en-US gets `MM/DD/YYYY`, de-DE `DD.MM.YYYY` and ja-JP
  `YYYY/MM/DD`. Typing digits fills a segment and moves on once no further digit could fit (typing "4" in the month
  moves on; "1" waits). ↑/↓ steps with wrap, Backspace clears, and the separator keys (`/ . - :`) jump to the next
  segment. Empty segments show placeholders (`mm`, `dd`, `yyyy`) in `text-subtle`.
- **Paste and free typing are parsed, not masked away.** Pasting into any segment parses the whole string: ISO,
  the locale's short and medium formats, and month names in the UI locale. Two-digit years pivot ±50 years around
  today. An optional `parse` hook adds natural language ("tomorrow", "+3d", "next fri").
- **Masks** (phone, card display, duration) format *as you type* without fighting the caret. Count the digits
  before the caret, reformat, then put the caret back after the same number of digits. Never reject a keystroke
  silently; an impossible digit makes the segment's error visible.
- **On phone**, segments are display only. A tap opens the sheet, which has a single native `inputmode="numeric"`
  text box at the top for typed entry, because spinbuttons don't summon the keypad.

### 1.4 The calendar grid: APG model and names

Pattern: **APG Date Picker Dialog** with a **Grid**. `<table role="grid" aria-labelledby={caption}>`. Weekday
headers are `<th scope="col" abbr="Monday">` and show `Intl` `narrow` or `short`. Each `<td role="gridcell"
aria-selected>` holds one `<button>` with a roving `tabindex`.

**Every day cell has a full name.** This fixes `old:pickers/dates/DatePicker.tsx:209`, where a day was named only
"14" and the grid had 42 tab stops. The name is built from `Intl.DateTimeFormat(locale, { dateStyle: "full" })` plus
state words from the locale's message table:

> "Wednesday, October 14, 2026" · "…, today" · "…, unavailable" · "…, start of range" · "…, in range" ·
> "…, end of range"

`aria-current="date"` marks today, `aria-disabled="true"` marks an unavailable day (still focusable, so it can be
explained), and `aria-selected` sits on the gridcell. Out-of-range days (before `min`, after `max`) are only faint
(`text-faint`, no strike): a month of struck-through past dates is noise (review 02 m5). The strike is kept for days
the app marks **unavailable** (`data-booked`: booked slots, closed weekends), where it carries meaning. The caption ("October 2026") is `aria-live="polite"`.
Outside days (from adjacent months) are rendered as blank cells and are not focusable.

**Keys.** ←/→ day (mirrored in RTL) · ↑/↓ week · Home/End week start/end (locale) · PageUp/PageDown month (31 Jan →
28/29 Feb) · Shift+Page year · Enter/Space select (in range mode: start, then end, swapped if earlier) · Esc closes
and returns focus · Tab moves header → grid (one stop) → footer and never walks the days.

The week starts where the locale says (`Intl.Locale.prototype.getWeekInfo()`, with a CLDR fallback table). This fixes
`old:…/DatePicker.tsx:92`, which hard-coded Sunday. Weekend days come from the same source and get `text-subtle`.

---

## 2. Temporal inputs

### DateField
- **Variants.** `segments` (default) or `trigger` (a button showing the formatted date, for read-mostly forms).
  `size`. `presentation`. An optional `weekNumbers` column.
- **States.** empty · partial (segments filled in part; no value) · valid · invalid (out of `min`/`max`, unavailable,
  impossible like 31 Feb) · disabled · read-only (segments are not spinbuttons, the button stays to *view*).
- **Popover.** Anchored below the control and flipped above when there's no room. Header: month/year title (a button
  that switches to the month view), then ‹ ›. Footer: **Today** and **Clear** as ghost buttons. 7 columns ×
  `control-sm` cells (≥ 44px on coarse pointers).
```ts
type DateFieldProps = FieldShell & Bindable<IsoDate | null> & Openable & {
  min?: IsoDate; max?: IsoDate; isDateUnavailable?: (d: IsoDate) => boolean;
  firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;          // default: locale
  weekNumbers?: boolean; presentation?: "auto" | "popover" | "sheet" | "native";
  parse?: (text: string, today: IsoDate) => IsoDate | null;
};
```

### DateRangeField
- Two segment groups (`start – end`) in one control, plus one trigger. The popover shows **two months** at ≥ 600px
  container width and one month below that. A **preset rail** sits at the inline start: a `role="listbox"` of
  `Today · Yesterday · Last 7 days · Last 30 days · This month · Last month · Year to date · Custom`. Picking a
  preset selects it, moves the visible months, and announces the range. While picking the end, hovering previews
  the band in `accent-soft` with `accent-border` ends.
- The selected preset is kept as `preset` (for "Last 7 days" that rolls forward on a dashboard), separate from the
  frozen dates. **Comparison:** `compare: "previous-period" | "previous-year" | DateRange` adds a second range,
  reported as "vs Oct 15 – 21, 2026", and paints it in `info-soft` in the grid.
```ts
type RangePreset = { id: string; label: string; range: (today: IsoDate, weekStart: number) => DateRange };
type DateRangeFieldProps = FieldShell & Bindable<DateRange> & Openable & {
  presets?: RangePreset[] | "default" | false; preset?: Bindable<string | null>;
  min?: IsoDate; max?: IsoDate; maxDays?: number; isDateUnavailable?: (d: IsoDate) => boolean;
  months?: 1 | 2 | "auto"; compare?: Bindable<"previous-period" | "previous-year" | DateRange | null>;
};
```

### TimeField
- Segments `hh : mm [: ss] [AM|PM]`. The order and cycle come from `resolvedOptions().hourCycle` (`h12`/`h23`/`h11`/
  `h24`), so ja-JP and de-DE get 24h and en-US gets 12h, with `hourCycle` to pin it. The period segment takes
  `a`/`p` and the localized initials. The suffix button opens a **slot listbox** (`step` minutes, default 15)
  that scrolls to the nearest slot. On phone it's the wheel sheet.
- **DST.** A wall time that doesn't exist (02:30 on a spring-forward day) or happens twice, when a `date` and
  `timeZone` are given, resolves with `disambiguation: "compatible"` and a hint says so: "2:30 AM doesn't exist on
  Mar 8 in New York; using 3:30 AM."
```ts
type TimeFieldProps = FieldShell & Bindable<IsoTime | null> & Openable & {
  hourCycle?: "h12" | "h23" | "auto"; step?: number; seconds?: boolean;
  min?: IsoTime; max?: IsoTime; slots?: IsoTime[];        // explicit availability (booking)
  date?: IsoDate; timeZone?: TimeZoneId;                  // only for DST hints
};
```

### DateTimeField · ZonedDateTimeField
- DateTimeField (DateTimePicker) is a date segment group and a time segment group in one control, with one popover:
  the calendar and the time slot list side by side on desktop, stacked with slot chips in the phone sheet. The value
  is a PlainDateTime with no zone, and the hint spells it out in full. ZonedDateTimeField appends a
  `TimeZoneSelect` as the control's suffix ("PDT ▾").
```ts
type DateTimeFieldProps = Omit<DateFieldProps, keyof Bindable<IsoDate | null>> & Bindable<IsoDateTime | null> & { step?: number };
type ZonedDateTimeFieldProps = Omit<DateTimeFieldProps, keyof Bindable<IsoDateTime | null>> &
  Bindable<IsoZoned | null> & { timeZone?: Bindable<TimeZoneId> };
```

### TimeZoneSelect
- A combobox (APG Combobox, listbox popup). Options come from `Intl.supportedValuesOf("timeZone")` and are grouped by
  region. Each option reads **"Berlin — Central European Time · UTC+01:00"**. Search matches city, country,
  `Intl` long and short names, abbreviations ("PST") and offsets ("+5:30"). Pinned groups: **Local** (detected),
  then **Recent**. Offsets are computed for `referenceDate` (default today), because offsets change with DST.
```ts
type TimeZoneSelectProps = FieldShell & Bindable<TimeZoneId> & Openable & {
  referenceDate?: IsoDate; zones?: TimeZoneId[]; showOffset?: boolean;
};
```

### DurationField
- Segments for the allowed units only (`1 h 30 min`), with each unit label from `Intl.NumberFormat` `unit` style.
  The value is an ISO duration, balanced (`PT90M` → `PT1H30M`) unless `balance: false`. Steppers have a hold-to-repeat
  acceleration. The display string uses `Intl.DurationFormat`, with a fallback.
```ts
type DurationFieldProps = FieldShell & Bindable<IsoDuration | null> & {
  units?: Array<"d" | "h" | "m" | "s">; max?: IsoDuration; step?: Partial<Record<"h" | "m" | "s", number>>; balance?: boolean;
};
```

### InlineCalendar
- The same APG grid, standalone (no popover, no field shell): 1–3 months, `selection: "single" | "multiple" |
  "range"`. Multiple selection toggles days and the grid announces "3 days selected". Used for availability and
  booking. The full event calendar is in `07-app-patterns.md`.
```ts
type InlineCalendarProps = { selection?: "single" | "multiple" | "range"; months?: 1 | 2 | 3; min?: IsoDate; max?: IsoDate;
  isDateUnavailable?: (d: IsoDate) => boolean; "aria-label": string } & Bindable<IsoDate | IsoDate[] | DateRange | null>;
```

### PeriodPicker (year · quarter · month · week)
- One trigger, one popover grid whose granularity switches: years (12 per page), quarters ("Q4 2026, Oct to Dec"),
  months, ISO weeks ("Week 44, Oct 26 to Nov 1, 2026"). The grid keys match the month grid; PageUp/PageDown moves a
  year (a dozen years in year view). Values: `"2026"`, `"2026-Q4"`, `"2026-10"`, `"2026-W44"`.

### MonthPicker · WeekPicker
- **MonthPicker** is a 3×4 grid of `Intl` short month names with year arrows. It uses the same grid key model (←→ ±1,
  ↑↓ ±3, PageUp/PageDown ± year). Cells are named "October 2026". **WeekPicker** is the month grid with a leading
  week-number column, and selection covers the whole row (`aria-selected` on every cell in it). The row button is
  named "Week 44, October 26 to November 1, 2026". Numbering is `iso` (default) or `locale`.
```ts
type MonthPickerProps = FieldShell & Bindable<IsoMonth | null> & Openable & { min?: IsoMonth; max?: IsoMonth };
type WeekPickerProps  = FieldShell & Bindable<IsoWeek | null> & Openable & { numbering?: "iso" | "locale" };
```

### RecurrenceField (an RRULE builder in plain language)
- **The summary leads and the controls sit below it.** The top line always reads as a sentence: **"Every 2 weeks on
  Tuesday and Thursday, until Dec 31, 2026"**. Controls: Repeat [Daily | Weekly | Monthly | Yearly] · every [n] ·
  weekday toggle group (weekly) · "on day 14" / "on the second Wednesday" / "on the last day" (monthly, derived from
  `dtstart`) · Ends [Never | On date | After n times]. A **preview** lists the next 5 occurrences with weekday names.
  An "Advanced" disclosure shows the raw RRULE (copyable).
- **Supported subset:** FREQ, INTERVAL, BYDAY (with ordinals), BYMONTHDAY, BYMONTH, COUNT, UNTIL. Unknown parts are
  **never dropped**. The field becomes read-only "Custom rule" with the raw text and an "Edit as text" escape.
- i18n: the sentence is built from ICU messages (`{interval, plural, one {Every week} other {Every # weeks}}`).
  Weekday lists use `Intl.ListFormat`.
```ts
type RecurrenceFieldProps = FieldShell & Bindable<string | null> & {  // RFC 5545 RRULE, e.g. "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH"
  dtstart: IsoDate; timeZone?: TimeZoneId; preview?: number; frequencies?: Array<"DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY">;
};
```

**Full calendar and scheduler** (month/week/day views, busy blocks, event drag and resize) belong to
[07-app-patterns.md](07-app-patterns.md). This doc owns the pickers only; they share the grid model in §1.4.

---

## 3. Identity and location

### PhoneField
- The control has a **country button** as its prefix (ISO code in mono plus the dial code, e.g. `GB +44 ▾`), then a
  `type="tel" inputmode="tel" autocomplete="tel-national"` input. Formatting is libphonenumber-style, from
  per-country metadata loaded lazily (`AsYouTypeFormatter` semantics). Typing or pasting a leading `+` switches to
  international input and **infers the country**. The value is **E.164** (`+442071838750`). `isPossible` is checked
  on blur and `isValid` on submit. The error names the expected shape ("UK numbers have 10 digits after 0").
- The default country comes from `locale`'s region, then the field's `defaultCountry`. Never assume US; the
  predecessor did (`old:inputs/specialized/PhoneInput.tsx:38`, 9 hard-coded masks).
- The country list is a combobox. Names come from `Intl.DisplayNames(locale, {type: "region"})`, and the search
  matches name, ISO code and dial code. **No emoji flags by default**: Windows renders them as letter pairs, and a
  flag isn't a language. `renderFlag` opts in to images.
```ts
type E164 = `+${number}`;
type PhoneFieldProps = FieldShell & Bindable<E164 | null> & {
  country?: Bindable<CountryCode>; defaultCountry?: CountryCode; countries?: CountryCode[]; preferred?: CountryCode[];
  renderFlag?: (c: CountryCode) => JSX.Element; extension?: boolean;
};
```

### AddressField (AddressInput)
- **Country first.** It decides the field set, order, labels and validation (libaddressinput-style metadata):
  US "State · ZIP code", UK "Town/City · Postcode" with no region, JP big-to-small "〒 Postal code · Prefecture ·
  City", IE "Eircode". Line 1 doubles as **autocomplete** (APG Combobox) when a `provider` is given. Choosing a
  suggestion fills and reveals the parts for review.
- **The manual fallback is always one click away** ("Enter address manually"), and it's automatic when the provider
  errors, times out (1.5s) or is offline. The fields carry the full `autocomplete` tokens (`address-line1`,
  `address-level2`, `postal-code`, `country`) so browser autofill works with or without the provider.
```ts
type Address = { country: CountryCode; lines: string[]; locality?: string; dependentLocality?: string;
  region?: string; postalCode?: string; sortingCode?: string; organization?: string; recipient?: string };
interface AddressProvider {
  suggest(q: string, o: { country?: CountryCode; signal: AbortSignal }): Promise<Array<{ id: string; label: string; secondary?: string }>>;
  resolve(id: string): Promise<Address>;
}
type AddressFieldProps = Omit<FieldShell, "prefix" | "suffix"> & Bindable<Address | null> & {
  provider?: AddressProvider; countries?: CountryCode[]; fields?: Partial<Record<keyof Address, "required" | "optional" | "hidden">>;
};
```

### PlaceLookupInput
- A combobox in the field shell (pin icon) for "a place", not a postal address: birthplace, event city, a weather
  location. The app supplies `search()`, so warp is vendor-agnostic and ships no geocoder. Results read "Lisbon,
  Portugal · city" with coordinates as secondary text. **Bias chips** ("Cities", "Countries", "Landmarks") re-rank
  the results and re-run the search. The request is debounced (120ms) and cancelled when superseded; the body is
  `aria-busy` and the hint says "Searching…". The value is the chosen place, with its IANA zone when known, so it can
  feed a TimeZoneSelect.
- **Keyboard (APG Combobox, list autocomplete with automatic selection; review 03 M12).** Typing 2+ characters
  opens the listbox with the first result active (`aria-activedescendant`). ↓/↑ move (wrapping), Enter picks, Esc
  closes and keeps the text, a second Esc clears it, ↓ on a closed combobox re-runs the search. Focus never leaves
  the input: the popup wrapper is presentational (not a dialog) and pointer-down on an option doesn't blur.
  Closing removes `aria-activedescendant`. AddressField's line 1 follows the same model.
```ts
type Place = { displayName: string; lat: number; lng: number; timezone?: TimeZoneId; category?: string; id?: string };
type PlaceLookupInputProps = FieldShell & Bindable<Place | null> & {
  search: (q: string, o: { bias: Record<string, boolean>; signal: AbortSignal }) => Promise<Place[]>;
  biases?: Array<{ id: string; label: string; default?: boolean }>; minChars?: number;
};
```

### CountrySelect · LanguageSelect · CurrencySelect
One combobox each, with names from `Intl.DisplayNames` in the UI locale. Languages show the **endonym** as secondary
text ("German · Deutsch"), because people look for their own language in their own script. Currencies read
"Euro · EUR · €". `preferred` pins items. A long list on phone opens the full-screen search sheet.
```ts
type CountrySelectProps  = FieldShell & Bindable<CountryCode | null>  & { options?: CountryCode[]; preferred?: CountryCode[] };
type LanguageSelectProps = FieldShell & Bindable<string | null>       & { options?: string[]; endonyms?: boolean };   // BCP 47
type CurrencySelectProps = FieldShell & Bindable<CurrencyCode | null> & { options?: CurrencyCode[] };                 // ISO 4217
```

---

## 4. Rich content

### RichTextEditor
- **Toolbar or bubble.** `toolbar: "fixed"` (default) for anything inside a form: a field-sized editor, with
  commands that are discoverable and stay put. `"bubble"` is for long-form documents and canvases, where a fixed bar
  steals reading width; it shows on a non-empty selection, 8px above it. On phone, **both become a keyboard
  accessory bar** pinned above the keyboard with `visualViewport`, scrolling horizontally.
- The toolbar is APG Toolbar: one tab stop with roving ←/→ and `aria-pressed` toggles. Groups are separated by
  hairline dividers: *Text style ▾ · B I S · Link · Bullets, Numbers, Quote · Code*. Shortcuts are listed in each
  tooltip (`Mod+B`).
- **Markdown shortcuts** at the start of a block: `# `, `## ` (headings), `- `/`* ` (bullets), `1. ` (numbers),
  `> ` (quote), ```` ``` ```` (code block), `---` (divider). Inline: `**b**`, `_i_`, `` `code` ``. Each one is
  undoable with one Mod+Z, which restores the literal characters.
- **Slash commands** (`/` at an empty block start) and **mentions** (`@`) both open an APG Combobox anchored to the
  caret. The editor (`role="textbox" aria-multiline`) gets `aria-expanded`, `aria-controls` and
  `aria-activedescendant`. Mentions insert as atomic nodes named "Mention: Ada Lovelace". Slash items have an icon,
  label, hint and shortcut.
- Engine: a headless editor model (ProseMirror via `@weft/editor`); warp only skins it with `data-part`s.
```ts
type RichTextEditorProps = FieldShell & Bindable<string> & {
  format?: "html" | "markdown" | "json"; toolbar?: "fixed" | "bubble" | "none";
  marks?: Array<"bold" | "italic" | "strike" | "code" | "link">; blocks?: Array<"h2" | "h3" | "ul" | "ol" | "quote" | "codeblock">;
  commands?: SlashCommand[]; mentions?: { search: (q: string, signal: AbortSignal) => Promise<MentionItem[]> };
  minRows?: number; maxRows?: number;
};
```

### CodeInput · JsonEditor · KeyValueEditor
- **CodeInput** is a `<textarea>` over a highlighted layer drawn with the **CSS Custom Highlight API** (no span soup,
  no re-render per keystroke). It's monospace at `text-code-size`, with optional `lineNumbers` in a `text-faint`
  gutter. **Tab indents**. Esc, then Tab, leaves the field, and that's announced in the hint ("Esc then Tab to
  leave"). There's no autocorrect, spellcheck or autocapitalize.
- **JsonEditor** is a CodeInput with `language="json"`. Errors come from the parser and an optional schema and show
  inline at the line, with the first one in the field `error`, and there's a "Format" action. **KeyValueEditor** is a
  table of `key | value | remove` rows with "Add row". A duplicate key is a caution, not a block. A **Form ⇄ JSON**
  segmented switch toggles between the two and keeps the value.
```ts
type CodeInputProps = FieldShell & Bindable<string> & { language?: string; lineNumbers?: boolean; tabSize?: 2 | 4; wrap?: boolean };
type KeyValueEditorProps = FieldShell & Bindable<Array<{ key: string; value: string }>> & { keyLabel?: string; valueLabel?: string };
```

### MentionsInput
- A plain `<textarea>` (so paste, autofill and spellcheck still work) with trigger characters: `@` people, `#`
  channels, configurable. The list is an APG Combobox popup anchored **at the caret** (mirror-element measurement),
  ↑/↓ then Enter or Tab inserts, Esc closes, and an insertion is announced. The value keeps tokens as `@[Ada
  Lovelace](user:ada)` markup; the display shows the name.
```ts
type MentionsInputProps = FieldShell & Bindable<string> & { triggers: Record<string, (q: string, s: AbortSignal) => Promise<MentionItem[]>> };
```

### ImageCropper · CameraCapture
- **ImageCropper**: a focusable stage (`role="application"`, described keys: arrows move, Shift×4, ＋/− zoom, R
  rotates) with a rule-of-thirds frame and a dimmed outside. Aspect chips (1:1, 4:3, 16:9 or free), a zoom slider
  and Rotate. The value is the crop transform; the app encodes the image.
- **CameraCapture**: nothing opens until the user presses **Allow camera**. Each failure is named ("Camera blocked:
  allow it in the address bar", "No camera found"), and **Upload a photo instead** is always present. Stop releases
  the tracks.
```ts
type Crop = { zoom: number; x: number; y: number; rotate: 0 | 90 | 180 | 270; aspect: string };
type ImageCropperProps = Bindable<Crop> & { src: string; aspects?: string[]; "aria-label": string };
```

### Code · CodeBlock · Markdown (display)
- **Code** is inline: mono at 0.88em on `surface-sunken` with a hairline border, never wrapped mid-token.
- **CodeBlock** is a `<figure>`: a head with an optional **filename**, a **language** badge, a wrap toggle
  (`aria-pressed`) and **Copy**, which turns into "Copied ✓" for 1.6s and announces it politely, falling back to
  "Press ⌘C" when the clipboard is blocked. The `<pre>` is focusable (`tabindex=0`, named by filename) so keyboard
  users can scroll it. `lineNumbers` are CSS counters, so they're never copied. Highlighting is optional and token
  coloured (comments `text-subtle`, strings `accent-text`); with no highlighter it's plain.
- **Markdown** is a small, safe renderer: h1–h4 (rendered one level down), paragraphs, lists and task lists,
  bold, italic, strike, inline code, links (http, https, mailto and relative only), quotes, rules, and fenced
  blocks rendered through CodeBlock. **Raw HTML is never interpreted**: it's escaped and shown as text. Larger needs
  (tables, footnotes, MDX) plug in a parser through `renderer` and keep warp's element styles.
```ts
type CodeProps = { children: string };
type CodeBlockProps = { code: string; language?: string; filename?: string; lineNumbers?: boolean; wrap?: boolean; copyable?: boolean };
type MarkdownProps = { source: string; renderer?: (src: string) => Node; linkTarget?: "_self" | "_blank" };
```

### MarkdownEditor
Source and preview side by side at ≥ 640px container width, tabs below it. The source is a multiline field shell
with toolbar shortcuts (Mod+B, Mod+K); the preview is the Markdown renderer above. Specimen: the Changelog demo.

### EmojiPicker · IconPicker
Search, then an APG Grid (roving focus, 8 columns, 7 on phone), then category tabs; names and keywords from CLDR in
the UI locale ("grinning face"), a skin-tone selector and recents. IconPicker is the same frame over the app's icons.
```ts
type EmojiPickerProps = Bindable<string | null> & Openable & { recents?: number; skinTone?: Bindable<1 | 2 | 3 | 4 | 5 | 6> };
```

### SignaturePad
- A `<canvas>` on `surface-raised` with a `border-control` frame and a baseline `×` in `text-faint`. The stroke uses
  pointer events (pen pressure when present, velocity-scaled width otherwise) and quadratic smoothing through the
  midpoints, inked in `color-text` and **redrawn on theme change** from the stored points. Actions: Undo, Clear.
- **Typed alternative is mandatory** (WCAG 2.1.1, 2.5.1): a "Type instead" tab renders the name in the display
  italic. Keyboard and switch users can sign. The canvas is `role="img"` named "Signature, 3 strokes".
- The legal ceremony (consent text, audit trail, hashing) lives in the e-sign pack, not here.
```ts
type SignatureValue = { method: "drawn" | "typed"; strokes?: Array<Array<[x: number, y: number, p: number]>>; text?: string; svg: string };
type SignaturePadProps = FieldShell & Bindable<SignatureValue | null> & { aspect?: number; typedFont?: "display" | "sans" };
```

**Drawing and annotation** (note only, not v1) reuses SignaturePad's strokes and redraw-on-theme rule, adds shape
tools in an APG Toolbar, and keeps an object list as its accessible alternative.

---

## 4b. Docs, developer and content display

All display-only, all token-styled, and all with a keyboard path and a text alternative.
- **Prose** (`data-scope="prose"`): typography for rendered HTML from AI answers and docs, with a 68ch measure,
  title-font headings, captioned tables with header cells, blockquotes, footnotes with back-links, and MathML.
  **Heading anchors** appear on hover/focus (always faintly on coarse pointers) and copy the URL with "copied".
  **Mermaid and KaTeX** are lazy plugins. Without them the block shows its source under a "mermaid · plugin not
  loaded" caption, never an empty box.
- **CodeTabs · Snippet**: an APG Tabs group over CodeBlocks. The chosen tab (package manager) is remembered and
  shared by every group on the page. A Snippet is one line with a non-copyable `$` prompt and an icon copy button.
- **JSON viewer**: `role="tree"`, treeitems with `aria-level` and `aria-expanded`. ←/→ collapse and expand, ↑/↓ move,
  Home/End, "Expand all". Values are coloured by type, with optional schema type badges.
- **DiffViewer**: unified or split, line numbers on both sides, word-level marks in changed pairs. Added and removed
  lines carry a sign named for screen readers, never colour alone. The body is a focusable region that scrolls.
- **LogViewer**: `role="log"`; ANSI SGR colours map to fixed terminal tokens. **Follow** turns off when you scroll up
  and back on with the chip. Filter shows "4 of 120 lines" and marks matches. Bounded buffer.
- **StackTrace**: the error line, then frames. Library frames collapse into one "3 library frames hidden" button, and
  Copy gives the plain trace. **TestResults**: summary text, a proportional bar with a text alternative, and suites
  as `<details>` that open on failure, with the assertion diff inline.
- **Props table**: a focusable scroll region, row headers on the prop name, and type, default and description.
- **LinkPreview**: loaded, loading (skeleton, `aria-busy`) and failed. A failed unfurl degrades to a plain link.
  **Embed**: a consent placeholder that names the host and what loading does, with Load and "Always allow"; the
  real frame is a sandboxed iframe. **Feedback** ("Was this helpful?"): Yes/No toggles; No reveals an optional
  field; both are acknowledged in a status message.
```ts
type CodeTabsProps = { tabs: Array<{ id: string; label: string; code: string; language?: string }>; syncKey?: string };
type DiffViewerProps = { before: string; after: string; filename?: string; view?: Bindable<"unified" | "split">; wordDiff?: boolean };
type LogViewerProps = { lines: State<string[]>; follow?: Bindable<boolean>; maxLines?: number; "aria-label": string };
type JsonViewerProps = { value: unknown; schema?: Record<string, string>; defaultExpandDepth?: number; "aria-label": string };
```

## 5. Specialised

### PaymentCardInput (provider iframe) · CardNumberText
**warp never renders an input for a raw card number.** Entry belongs to the payment provider's hosted field or iframe
(the predecessor got this right: `old:inputs/specialized/PaymentCardInput.tsx:12`). That keeps the app in PCI SAQ-A
scope. warp provides: (1) the **field shell around the provider's iframe**, with its focus and invalid states driven by
the provider's events, and its tokens passed into the provider's appearance API (font, `text-control-size`,
`radius-control`, `border-control`, `critical-text`); (2) **`CardNumberText`**, for display: `•••• 4242`, brand
from the BIN range, grouping 4-4-4-4 / Amex 4-6-5, and expiry as `MM/YY` from the locale. Provider `focus` → `force(true)`,
`change{complete}` → filled, `change{error}` → pinned critical sweep plus the provider's message.
```ts
type PaymentCardInputProps = FieldShell & { mount: (el: HTMLElement, appearance: ProviderAppearance) => ProviderField };
interface ProviderField { on(e: "focus" | "blur" | "change", f: (ev: { complete?: boolean; error?: string }) => void): void; destroy(): void }
```

### FilterBar (search with facets) · QueryBuilder
- **FilterBar.** One field shell that wraps: committed filter **chips**, then a text input (free search). "+ Filter"
  opens a two-step popover: field list → operator and value. Enum values are a checkbox list with **facet counts**
  ("Open 12"). Dates use the DateRangeField presets, numbers a min–max pair. A chip reads **Status is Open or
  Blocked** and is a button that reopens its editor. Its × is a separate button named "Remove filter: Status is
  Open or Blocked". **Backspace in an empty input** focuses the last chip, and Backspace again removes it. Results
  count is `aria-live="polite"`. On phone the chips scroll horizontally and the editor is a sheet.
- **QueryBuilder** is for when users need AND/OR. A group is a list of rows `[field ▾] [operator ▾] [value]`, with
  "Match [all | any] of the following" as a segmented control, and a nested group one level deep by default
  (`maxDepth`). Every row has a remove button and the group has "+ Condition / + Group". It renders the same
  `Filter` model, so a flat query can collapse back to chips.
```ts
type FilterField = { id: string; label: string; type: "enum" | "text" | "number" | "date" | "person"; options?: Array<{ value: string; label: string }> };
type Filter = { field: string; op: "is" | "is-not" | "any-of" | "contains" | "gt" | "lt" | "between" | "before" | "after"; value: unknown };
type FilterBarProps = FieldShell & Bindable<Filter[]> & { fields: FilterField[]; query?: Bindable<string>;
  facets?: (field: string, current: Filter[]) => Promise<Record<string, number>> };
type QueryGroup = { match: "all" | "any"; items: Array<Filter | QueryGroup> };
type QueryBuilderProps = Bindable<QueryGroup> & { fields: FilterField[]; maxDepth?: number; "aria-label": string };
```

### SortableList
- **Pointer:** drag the **handle** (a `grip` button, `touch-action: none`). The lifted row gets `elevation-2` and
  `surface-overlay`, and its neighbours glide with FLIP at `duration-base`. **Keyboard:** focus the handle, Space
  lifts, ↑/↓ move, Space drops and Esc cancels. Announcements go through a polite live region: "Design review
  lifted, position 2 of 5" → "moved to position 3 of 5" → "dropped". **Touch and switch access:** explicit **Move
  up / Move down** buttons on each row whenever the pointer is coarse (always visible), and on hover/focus for fine
  pointers. Dragging is never the only way (WCAG 2.5.7).
```ts
type SortableListProps<T> = Bindable<T[]> & { getKey: (t: T) => string; itemLabel: (t: T) => string;
  renderItem: (t: T) => JSX.Element; "aria-label": string; disabled?: boolean };
```

---

## 6. Motion, per dial stop

All values come from tokens: `duration-*` × `motion-k`, `motion-distance` (4/8/12) and `ease-*`. Exits are 70%, accelerate,
continue the entry direction, and leave toward the anchor.

| Moment | quiet | balanced | vivid | Reduced motion |
|---|---|---|---|---|
| **Calendar month change** | cross-fade, 4px slide, `fast` | 16px (2 × distance) slide in the nav direction, `base`, ease-out | 24px slide plus a clip wipe from the leading edge, `base`, ease-out | 120ms opacity cross-fade, no travel |
| **Popover enter / exit** | fade + 4px from the anchor, scale 0.985, `base` | fade + 8px, scale 0.97 | fade + 12px, scale 0.95, spring on scale | fade only, `base × 0.6` |
| **Sheet enter / exit** | 100% from the bottom, `slow`, in-out; scrim fades | same, ease-out | same, spring (3.5% overshoot) on the last 10% | sheet fades in place; scrim fades |
| **Range band** | colour only | the band fills from start to end, `fast` | same plus an emphasis edge on the ends | colour only |
| **Field sweep** | L→R, 480ms | L→R, 620ms | L→R, 700ms; popovers sweep too | phase still runs, 0ms; colour change only |
| **Validation** | sweep pinned critical; message fades in, 180ms | same; message slides 8px, 180ms | same | colour, icon and message; no travel |
| **Sortable drop** | FLIP `base` | FLIP `base`, ease-out | FLIP with `ease-pop` | instant reorder, 120ms highlight |

**No shake on errors, at any stop**: it moves layout and says nothing colour, an icon and a message don't.

---

## 7. Do and don't

| Do | Don't |
|---|---|
| Keep values as ISO strings and compute with Temporal. | Put `Date` in a `Bindable`, or store a local-midnight instant for a calendar date. |
| Name every day "Wednesday, October 14, 2026" plus its state. | Ship a grid of buttons named "14". |
| Take the week start, hour cycle and segment order from the locale. | Hard-code Sunday, `MM/DD` or 12h. |
| Use a sheet on phone when the picker needs ranges, presets or search. | Squeeze a two-month popover into 390px. |
| Use native `tel` and address autofill on phone. | Build a custom keypad or a sheet for an address. |
| Wrap the provider's card iframe in the warp field shell. | Render your own `<input>` for a card number. |
| Put every input, popover trigger and editor frame in the SIGNATURE shell. | Draw a second border or label for a "special" input. |
| Let `fields` or `variant` choose floating or classic. | Hard-code a label position per component. |
| Offer typed signatures and Move up/down buttons. | Make drawing or dragging the only way to complete a field. |
| Keep unknown RRULE parts and show them read-only. | Silently drop BYSETPOS because the UI can't edit it. |
| Keep `text-control-size` at ≥ 16px in every segment and sheet field on phones. | Use 14px inputs in a sheet; iOS zooms the page. |
| Move error text in at most `motion-distance`, then hold still. | Shake the field. |
| Name the control with the visible `<label for>` (or `aria-labelledby` for a group). | `aria-hidden` the label and repeat it in `aria-label`. |
| Give sm and icon buttons, chips and filter chips a hit-min expander, with `overflow: visible`. | Leave a 28px button inside `overflow: hidden`, where its expander is clipped. |
| Set `aria-checked` on every chip radio, with one tab stop and arrows that move and select. | Leave the unchecked radios without `aria-checked`. |
| Set non-vivid hero `em` upright in the accent colour (`font-synthesis-style: none`). | Let the browser slant Space Grotesk into a fake italic. |

**As built, the editors and code inputs** (`packages/warp-core/src/{editor,code,mention}.ts`, `packages/warp/src/{RichTextEditor,Markdown,CodeInput,MentionsInput,KeyValueEditor}.tsx`). Where the build differs from this spec:

- RichTextEditor is contenteditable with `execCommand`, like the specimen, not a ProseMirror `@weft/editor`: the app pays about 16 KB br of JS rather than a full editor engine. Everything that enters it goes through warp-core's allow-list `sanitizeHtml`. `format` is `html` or `markdown`; `json` and the `renderer` prop aren't built.
- Undo stops at a mention and at a list made by a Markdown shortcut: Chromium needs a direct DOM change for both (it drops or nests the element otherwise), and that ends its undo history there.
- CodeInput paints with the CSS Custom Highlight API over a mirrored `<pre>`, since ranges can't reach inside a textarea. Without the API the textarea shows plain text.
- `aria-expanded` is left off MentionsInput and RichTextEditor: axe rejects it on textbox roles. `aria-activedescendant` and `aria-controls` carry the list.
- Tools are labelled `H2 heading` and `H3 subheading` so the name holds the visible text (WCAG 2.5.3).
- JSON errors are located by a small walker, because V8 doesn't report a position for most messages.
