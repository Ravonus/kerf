import { DownIcon, GlobeIcon, SearchIcon } from '@weft-js/warp-icons'
import { caretAfter, currencyCodes, currencySymbol, digitsOf, displayName, formatPhone, inferCountry, languageCodes, listKey, localZone, matchZone, nationalLength, PHONE_COUNTRIES, regionCodes, regionOf, uid, zoneCity, zoneRows, type ChangeReason, type CountryCode, type E164, type IsoDate, type PhoneCountry, type TimeZoneId } from '@weft-js/warp-core'
import { derived, flush, onMount, state, untrack } from '@weft-js/core'
import { Field } from './Field'
import type { IconRef } from './Icon'
import { bindable, Composite, Hidden, Panel, useOpen, usePickerEnv, type Bindable, type Openable, type RichFieldProps } from './Picker'
import { use } from '@weft-js/warp-core/weft'
import '@weft-js/warp-core/styles/rich/listbox.css'
import '@weft-js/warp-core/styles/rich/timezone.css'
import '@weft-js/warp-core/styles/rich/phone.css'

export type Row = { key: string; main: string; sub?: string | undefined; meta?: string | undefined; code?: string; pin?: string | undefined; search: string }

const SHOWN = 80

/**
 * The search list in a picker's panel (APG Combobox with a listbox popup): focus stays in the input, ↑/↓ move the
 * active option, Enter picks. Long lists render their first rows; typing narrows them.
 */
function SearchList({ label, placeholder, rows, value, match, onPick, count }: { label: string; placeholder: string; rows: () => Row[]; value: string | null; match?: ((r: Row, q: string) => boolean) | undefined; onPick: (key: string, r: ChangeReason) => void; count?: ((n: number, q: string) => string) | undefined }) {
  const id = uid('list')
  const q = state('')
  const all = derived(() => rows())
  const hits = derived(() => {
    const s = q.value.trim().toLowerCase()
    return s ? all.value.filter(r => (match ? match(r, s) : r.search.includes(s))) : all.value
  })
  const shown = derived(() => hits.value.slice(0, SHOWN))
  const active = state(untrack(() => Math.max(0, all.value.slice(0, SHOWN).findIndex(r => r.key === value))))
  let list: HTMLUListElement | undefined
  const show = () => list?.querySelector('[data-active]')?.scrollIntoView?.({ block: 'nearest' })
  const onKey = (e: KeyboardEvent) => {
    const n = shown.value.length
    if (!n) return
    const m = listKey(e.key, active.value, n, { page: 8, wrap: true, typing: true })
    if (!m.handled) return
    e.preventDefault()
    if (m.pick) return onPick(shown.value[active.value]!.key, 'keyboard')
    active.value = m.to
    flush()
    show()
  }
  onMount(show)
  return (
    <div class="tz-pop">
      <label data-part="search">
        <SearchIcon />
        <span class="sr">{label}</span>
        <input type="search" role="combobox" data-initial="" aria-expanded="true" aria-controls={id} aria-autocomplete="list" aria-activedescendant={shown.value.length ? `${id}-${active.value}` : undefined} placeholder={placeholder} onInput={e => { q.value = (e.currentTarget).value; active.value = 0 }} onKeyDown={onKey} />
      </label>
      <ul ref={n => (list = n)} data-part="listbox" role="listbox" id={id} aria-label={label}>
        {shown.value.map((r, n) => <Option key={r.key} id={`${id}-${n}`} row={r} selected={r.key === value} active={n === active.value} onPick={onPick} />)}
      </ul>
      {!shown.value.length && <p class="tz-empty">No match for “{q.value}”.</p>}
      {count && <p class="tz-count" aria-live="polite">{count(hits.value.length, q.value)}</p>}
    </div>
  )
}

const Option = ({ id, row, selected, active, onPick }: { id: string; row: Row; selected: boolean; active: boolean; onPick: (k: string, r: ChangeReason) => void }) => (
  <li role="option" id={id} aria-selected={selected ? 'true' : 'false'} data-active={active ? '' : undefined} onClick={() => onPick(row.key, 'pointer')}>
    {row.pin && <span class="tz-pin">{row.pin}</span>}
    {row.code && <span data-part="code">{row.code}</span>}
    <span>{row.main}{row.sub && <small> {row.sub}</small>}</span>
    {row.meta && <span data-part="opt-meta">{row.meta}</span>}
  </li>
)

/** A field whose control is one value button over a search list: the frame of TimeZoneSelect and the Intl selects. */
function ListField({ value, defaultValue, onValueChange, open, defaultOpen, onOpenChange, icon, text, title, search, rows, match, count, hint, label, name, presentation, disabled, readonly, locale, today, ...rest }: RichFieldProps & Bindable<string | null> & Openable & { icon?: IconRef; text: (v: string, locale: string) => string; title: string; search: string; rows: (locale: string, today: string) => Row[]; match?: (r: Row, q: string) => boolean; count?: (n: number, q: string) => string; hint?: unknown }) {
  const env = usePickerEnv(() => locale, () => today)
  const v = bindable<string | null>(() => value, () => defaultValue, null, () => onValueChange)
  const pop = useOpen(() => open, () => defaultOpen, () => onOpenChange)
  const shown = derived(() => (v.value ? text(v.value, env.locale.value) : ''))
  let trigger: HTMLButtonElement | undefined
  return (
    <Composite
      {...rest}
      icon={icon}
      label={label}
      hint={hint}
      disabled={disabled}
      readonly={readonly}
      bound={v}
      filled={!!v.value}
      hold={pop.value}
      control={() => (
        <>
          <button ref={n => (trigger = n)} type="button" data-part="pick" aria-haspopup="dialog" aria-expanded={pop.value ? 'true' : 'false'} aria-label={`${label}, ${shown.value || 'none'}`} aria-disabled={readonly ? 'true' : undefined} disabled={disabled} onClick={() => { if (!readonly) pop.set(!pop.value) }}>
            <span>{shown.value}</span><DownIcon />
          </button>
          <Hidden name={name} value={() => v.value ?? ''} />
        </>
      )}
      end={
        <Panel label={title} open={pop} trigger={() => trigger!} presentation={presentation}>
          {() => <SearchList label={search} placeholder={search} rows={() => rows(env.locale.value, env.today.value)} match={match} value={v.value} count={count} onPick={(k, r) => { v.set(k, r); pop.set(false) }} />}
        </Panel>
      }
    />
  )
}

/** Props for TimeZoneSelect. */
export type TimeZoneSelectProps = RichFieldProps & Bindable<TimeZoneId | null> & Openable & { referenceDate?: string | undefined; zones?: TimeZoneId[]; showOffset?: boolean }

/** TimeZoneSelect (04 §2): every IANA zone with its offset at `referenceDate`; Local is pinned first. */
export function TimeZoneSelect({ referenceDate, zones, showOffset = true, ...props }: TimeZoneSelectProps) {
  const local = untrack(localZone)
  const matches = new Map<string, ReturnType<typeof zoneRows>[number]>()
  const rows = (locale: string, today: string): Row[] => {
    const list = zoneRows(locale, (referenceDate ?? today) as IsoDate, zones)
    for (const z of list) matches.set(z.zone, z)
    const row = (z: (typeof list)[number]): Row => ({ key: z.zone, main: z.city, sub: z.region, meta: showOffset ? z.offset : undefined, pin: z.zone === local ? 'Local' : undefined, search: z.search })
    return [...list.filter(z => z.zone === local), ...list.filter(z => z.zone !== local)].map(row)
  }
  return <ListField icon={GlobeIcon} title="Choose a time zone" search="City, zone or +5:30" text={v => zoneCity(v)} rows={rows} match={(r, q) => matchZone(matches.get(r.key)!, q)} count={(n, q) => (q ? `${n} zone${n === 1 ? '' : 's'}` : `${n} zones · offsets for today`)} {...props} />
}

export type CodeSelectProps = RichFieldProps & Bindable<string | null> & Openable & { options?: string[] | undefined; preferred?: string[] }
const pinned = (list: string[], first?: string[]) => (first ? [...first, ...list.filter(c => !first.includes(c))] : list)

/** CountrySelect (04 §3): names from Intl.DisplayNames in the UI locale; `preferred` pins items. */
export function CountrySelect({ options, preferred, ...props }: CodeSelectProps) {
  const rows = (locale: string): Row[] => pinned(options ?? regionCodes(), preferred).map(c => { const main = displayName('region', c, locale); return { key: c, code: c, main, search: `${main} ${c}`.toLowerCase() } })
  return <ListField icon={GlobeIcon} title="Choose a country" search="Search countries" text={(v, l) => displayName('region', v, l)} rows={rows} {...props} />
}

/** LanguageSelect (04 §3): each language with its endonym, because people look for their own language in their own script. */
export function LanguageSelect({ options, preferred, endonyms = true, ...props }: CodeSelectProps & { endonyms?: boolean }) {
  const rows = (locale: string): Row[] => pinned(options ?? languageCodes(), preferred).map(c => { const main = displayName('language', c, locale), own = displayName('language', c, c); return { key: c, main, sub: endonyms && own !== main ? `· ${own}` : undefined, search: `${main} ${own} ${c}`.toLowerCase() } })
  return <ListField icon={GlobeIcon} title="Choose a language" search="Search languages" text={(v, l) => displayName('language', v, l)} rows={rows} {...props} />
}

/** CurrencySelect (04 §3): "Euro · EUR · €". */
export function CurrencySelect({ options, preferred, ...props }: CodeSelectProps) {
  const rows = (locale: string): Row[] => pinned(options ?? currencyCodes(), preferred).map(c => { const main = displayName('currency', c, locale); return { key: c, main, sub: `· ${c}`, meta: currencySymbol(c, locale), search: `${main} ${c}`.toLowerCase() } })
  return <ListField title="Choose a currency" search="Search currencies" text={(v, l) => `${displayName('currency', v, l)} · ${v}`} rows={rows} {...props} />
}

/** A prefix moves where the label rests: onto the input, past the country button (specimen, `restOn`). */
function restOnInput(el: HTMLInputElement) {
  const control = el.closest<HTMLElement>('[data-part="control"]')!
  const measure = () => {
    if (!control.style.getPropertyValue('--_inset')) control.style.setProperty('--_inset', getComputedStyle(el.parentElement!).paddingInlineStart)
    control.style.setProperty('--_lead', `${Math.round(el.getBoundingClientRect().left - control.getBoundingClientRect().left)}px`)
  }
  measure()
  const size = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
  size?.observe(control)
  return { update() {}, destroy() { size?.disconnect() } }
}

/** Props for PhoneField. */
export type PhoneFieldProps = RichFieldProps & Bindable<E164 | null> & {
  country?: CountryCode
  defaultCountry?: CountryCode
  countries?: CountryCode[] | undefined
  onCountryChange?: (c: CountryCode) => void
}

/**
 * PhoneField (04 §3): a country button, then a native tel input (the OS keypad and SMS autofill beat anything custom).
 * Digits format as you type and the caret stays behind the same digit; a pasted `+…` infers the country. The value is
 * E.164, and only once the number is the country's length. The country list is a search list.
 */
export function PhoneField({ value, defaultValue, onValueChange, country, defaultCountry, countries, onCountryChange, locale, today, name, presentation, label, hint, error, disabled, readonly, ...rest }: PhoneFieldProps) {
  const env = usePickerEnv(() => locale, () => today)
  const v = bindable<E164 | null>(() => value, () => defaultValue, null, () => onValueChange)
  const list = untrack(() => (countries ? PHONE_COUNTRIES.filter(c => countries.includes(c.code)) : PHONE_COUNTRIES))
  const find = (code?: string) => list.find(c => c.code === code)
  const code = state<PhoneCountry>(untrack(() => find(country) ?? find(defaultCountry) ?? find(regionOf(env.locale.value)) ?? list[0]!))
  const text = state(untrack(() => {
    const e = v.value
    if (!e) return ''
    const c = inferCountry(e, code.value, list) ?? code.value
    code.value = c
    return formatPhone(e.slice(c.dial.length + 1), c).shown
  }))
  const pop = useOpen(() => undefined, () => false, () => undefined)
  const own = state<string | undefined>(undefined)
  const name_ = derived(() => displayName('region', code.value.code, env.locale.value))
  const placeholder = derived(() => { const c = code.value; return c.pattern.replace(/#/g, '0').replace(/^0/, c.trunk ? '0' : '5') })
  let button: HTMLButtonElement | undefined
  let input: HTMLInputElement | undefined
  const sync = (raw: string, caret: number | null) => {
    const c = code.value
    const before = digitsOf(raw.slice(0, caret ?? raw.length)).length
    const { shown, national } = formatPhone(raw, c)
    text.value = shown
    if (input) { input.value = shown; if (input === input.ownerDocument.activeElement) { const at = caretAfter(shown, before); input.setSelectionRange(at, at) } }
    const need = nationalLength(c)
    own.value = national.length > need ? `${name_.value} numbers have ${need} digits after the country code.` : undefined
    const e = national.length === need ? `+${c.dial}${national}` as E164 : null
    if (e !== untrack(() => v.value)) v.set(e, 'keyboard')
  }
  const choose = (c: PhoneCountry) => { code.value = c; untrack(() => onCountryChange)?.(c.code); pop.set(false); input?.focus(); sync(text.value, null) }
  const onBlur = () => {
    const c = code.value
    const n = formatPhone(text.value, c).national.length, need = nationalLength(c)
    if (n && n < need) own.value = `That's ${n} digits. ${name_.value} numbers have ${need}.`
  }
  use(restOnInput, () => input)
  const onPaste = (e: ClipboardEvent) => {
    if (readonly) return
    const t = e.clipboardData?.getData('text').trim() ?? ''
    if (!t.startsWith('+')) return
    const m = inferCountry(t, code.value, list)
    if (!m) return
    e.preventDefault()
    code.value = m
    sync((m.trunk ?? '') + digitsOf(t).slice(m.dial.length), null)
  }
  return (
    <Field
      {...rest}
      label={label}
      hint={hint}
      error={error ?? own.value}
      disabled={disabled}
      readonly={readonly}
      filled={text.value.length > 0}
      hold={pop.value}
      attrs={{ 'data-phone': '' }}
      reset={() => { v.reset(); own.value = undefined; code.value = inferCountry(v.value ?? '', code.value, list) ?? code.value; text.value = v.value ? formatPhone(v.value.slice(code.value.dial.length + 1), code.value).shown : ''; if (input) input.value = text.value }}
      control={p => (
        <div data-part="body">
          <button ref={n => (button = n)} type="button" data-part="country" aria-haspopup="dialog" aria-expanded={pop.value ? 'true' : 'false'} aria-disabled={readonly ? 'true' : undefined} disabled={disabled} onClick={() => { if (!readonly) pop.set(!pop.value) }}>
            <span aria-hidden="true"><b>{code.value.code}</b>+{code.value.dial}</span><span class="sr">Country: {name_.value}, +{code.value.dial}</span><DownIcon />
          </button>
          <input ref={n => (input = n)} data-part="input" id={p.id} type="tel" inputmode="tel" autocomplete="tel-national" placeholder={placeholder.value} aria-describedby={p.describedby} value={text.value} required={p.rest.required} disabled={disabled} readonly={readonly} onInput={e => { const el = e.currentTarget; sync(el.value, el.selectionStart) }} onBlur={onBlur} onPaste={onPaste} />
          <Hidden name={name} value={() => v.value ?? ''} />
        </div>
      )}
      end={
        <Panel label="Country" open={pop} trigger={() => button!} presentation={presentation}>
          {() => <SearchList label="Search countries" placeholder="Country or code" value={code.value.code} rows={() => list.map(c => { const main = displayName('region', c.code, env.locale.value); return { key: c.code, code: c.code, main, meta: `+${c.dial}`, search: `${main} ${c.code} ${c.dial}`.toLowerCase() } })} match={(r, q) => r.search.includes(q.replace(/^\+/, ''))} onPick={k => choose(find(k)!)} />}
        </Panel>
      }
    />
  )
}

