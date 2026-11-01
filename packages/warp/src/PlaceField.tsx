import { PinIcon } from '@weft/icons'
import { addressFormat, addressPart, withAddressPart, type Address, type AddressPart, type TimeZoneId } from '@weft/ui-core'
import { derived, state, untrack } from 'weft'
import { Chip } from './Chip'
import { ComboField } from './Combobox'
import { Input } from './Field'
import { bindable, type Bindable, type RichFieldProps } from './Picker'
import { CountrySelect } from './RichSelect'
import '@weft/ui-core/styles/rich/address.css'

export type Place = { displayName: string; lat: number; lng: number; timezone?: TimeZoneId; category?: string; id?: string }
export type PlaceBias = { id: string; label: string; default?: boolean }

export type PlaceLookupInputProps = RichFieldProps & Bindable<Place | null> & {
  search: (q: string, o: { bias: Record<string, boolean>; signal: AbortSignal }) => Promise<Place[]>
  biases?: PlaceBias[]
  minChars?: number
}

/** PlaceLookupInput (04 §3): "a place", not a postal address. warp ships no geocoder: the app supplies `search()`. */
export function PlaceLookupInput({ value, defaultValue, onValueChange, search, biases, minChars = 2, label, hint, ...rest }: PlaceLookupInputProps) {
  const v = bindable<Place | null>(() => value, () => defaultValue, null, () => onValueChange)
  const text = state(untrack(() => v.value?.displayName ?? ''))
  const bias = state<Record<string, boolean>>(untrack(() => Object.fromEntries((biases ?? []).map(b => [b.id, !!b.default]))))
  const list = derived(() => biases ?? [])
  const chosen = derived(() => { const p = v.value; return p ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}${p.timezone ? ` · ${p.timezone}` : ''}` : undefined })
  return (
    <div class="stack">
      <ComboField
        icon={PinIcon}
        {...rest}
        label={label}
        hint={hint}
        minChars={minChars}
        text={() => text.value}
        status={() => chosen.value}
        find={(q, signal) => search(q, { bias: untrack(() => bias.value), signal })}
        row={(p: Place) => ({ main: p.displayName, sub: p.category, meta: `${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}` })}
        onText={t => { text.value = t; if (v.value) v.set(null, 'keyboard') }}
        onPick={(p: Place) => { text.value = p.displayName; v.set(p, 'keyboard') }}
      />
      {list.value.length > 0 && (
        <div class="chips" role="group" aria-label="Prefer">
          {list.value.map(b => <Chip key={b.id} pressed={!!bias.get(b.id)} onClick={() => (bias.value = { ...bias.value, [b.id]: !bias.value[b.id] })}>{b.label}</Chip>)}
        </div>
      )}
    </div>
  )
}

export interface AddressProvider {
  suggest(q: string, o: { country?: string; signal: AbortSignal }): Promise<Array<{ id: string; label: string; secondary?: string }>>
  resolve(id: string): Promise<Address>
}
export type AddressFieldProps = Bindable<Address | null> & { label?: string; provider?: AddressProvider; countries?: string[]; defaultCountry?: string; locale?: string; name?: string; errors?: Partial<Record<AddressPart, string>> }

/**
 * AddressField (04 §3): the country comes first and decides the fields. Line 1 is a combobox when there is a `provider`;
 * manual entry is one click away, and automatic when the provider fails or takes over 1.5s.
 */
export function AddressField({ value, defaultValue, onValueChange, label = 'Address', provider, countries, defaultCountry = 'US', locale, name, errors }: AddressFieldProps) {
  const v = bindable<Address | null>(() => value, () => defaultValue, null, () => onValueChange)
  const country = state<string | null>(untrack(() => v.value?.country ?? defaultCountry))
  const format = derived(() => addressFormat(country.value!))
  const manual = state(false)
  const note = state('')
  const touched = state<Record<string, boolean>>({})
  const address = () => v.value ?? { country: country.value!, lines: [] }
  const write = (part: AddressPart, text: string) => v.set(withAddressPart(address(), part, text), 'keyboard')
  const fill = async (id: string) => {
    try {
      const a = await provider!.resolve(id)
      country.value = a.country
      v.set(a, 'keyboard')
      note.value = 'Filled from suggestion. Check line 2.'
    } catch { goManual('Suggestions are unavailable. Enter the address here.') }
  }
  const goManual = (say: string) => { manual.value = true; note.value = say }
  const postal = derived(() => {
    const f = format.value, t = addressPart(v.value, 'postalCode').trim()
    return f.postal && t && touched.value.postal && !f.postal.test(t) ? f.postalMessage : undefined
  })
  return (
    <div role="group" aria-label={label} class="stack">
      {name && <input type="hidden" name={name} value={v.value ? JSON.stringify(v.value) : ''} />}
      <div class="addr-grid">
        <CountrySelect label="Country or region" value={country} options={countries} locale={locale} onValueChange={c => { if (v.value) v.set({ ...v.value, country: c! }, 'pointer') }} />
        {format.value.fields.map(([part, title, span, auto]) => {
          const problem = derived(() => errors?.[part])
          return (
            <div key={`${country.value}:${part}`} data-span={span}>
              {part === 'line1' && provider && !manual.value
                ? <ComboField icon={PinIcon} label={title} autocomplete={auto} text={() => addressPart(v.value, 'line1')} timeout={1500} find={(q, signal) => provider.suggest(q, { country: country.value!, signal })} row={s => ({ main: s.label, sub: s.secondary, icon: PinIcon })} onText={t => write('line1', t)} onPick={s => fill(s.id)} onFail={() => goManual('Suggestions are unavailable. Enter the address here.')} />
                : <Input label={title} autocomplete={auto} icon={part === 'line1' ? 'pin' : undefined} value={addressPart(v.value, part)} error={problem.value ?? (part === 'postalCode' ? postal.value : undefined) ?? (errors ? '' : undefined)} onInput={e => write(part, e.currentTarget.value)} onBlur={part === 'postalCode' ? () => (touched.value = { ...touched.value, postal: true }) : undefined} />}
            </div>
          )
        })}
      </div>
      <p class="addr-foot">
        {provider && !manual.value && <button type="button" class="linkish" onClick={() => goManual('Manual entry.')}>Enter address manually</button>}
        {' '}<span aria-live="polite">{note.value}</span>
      </p>
    </div>
  )
}
