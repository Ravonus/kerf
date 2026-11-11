import { PinIcon } from '@kerf/veneer-icons'
import {
  addressFormat,
  addressPart,
  formReset,
  withAddressPart,
  type Address,
  type AddressPart,
  type TimeZoneId,
} from '@kerf/veneer-core'
import { derived, state, untrack } from '@kerf/core'
import { Chip } from './Chip'
import { ComboField } from './Combobox'
import { Input } from './Field'
import { bindable, type Bindable, type RichFieldProps } from './Picker'
import { CountrySelect } from './RichSelect'
import { use } from '@kerf/veneer-core/kerf'
import '@kerf/veneer-core/styles/rich/address.css'

/** A place a lookup returned. */
export type Place = {
  displayName: string
  lat: number
  lng: number
  timezone?: TimeZoneId
  category?: string
  id?: string
}
/** A filter chip that nudges a place lookup. */
export type PlaceBias = { id: string; label: string; default?: boolean }

/** Props for PlaceLookupInput. */
export type PlaceLookupInputProps = RichFieldProps &
  Bindable<Place | null> & {
    search: (
      q: string,
      o: { bias: Record<string, boolean>; signal: AbortSignal },
    ) => Promise<Place[]>
    biases?: PlaceBias[]
    minChars?: number
  }

/** PlaceLookupInput (04 §3): "a place", not a postal address. Veneer ships no geocoder: the app supplies `search()`. */
export function PlaceLookupInput({
  value,
  defaultValue,
  onValueChange,
  search,
  biases,
  minChars = 2,
  label,
  hint,
  ...rest
}: PlaceLookupInputProps) {
  const v = bindable<Place | null>(
    () => value,
    () => defaultValue,
    null,
    () => onValueChange,
  )
  const text = state(untrack(() => v.value?.displayName ?? ''))
  const bias = state<Record<string, boolean>>(
    untrack(() => Object.fromEntries((biases ?? []).map((b) => [b.id, !!b.default]))),
  )
  const list = derived(() => biases ?? [])
  const chosen = derived(() => {
    const p = v.value
    return p
      ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}${p.timezone ? ` · ${p.timezone}` : ''}`
      : undefined
  })
  let box: HTMLDivElement | undefined
  const reset = () => {
    v.reset()
    text.value = v.value?.displayName ?? ''
    box!.querySelector('input')!.value = text.value // the native reset emptied it, and the text may not have changed
  }
  return (
    <div ref={(n) => (box = n)} class="stack">
      <ComboField
        icon={PinIcon}
        {...rest}
        reset={reset}
        label={label}
        hint={hint}
        minChars={minChars}
        text={() => text.value}
        status={() => chosen.value}
        find={(q, signal) => search(q, { bias: untrack(() => bias.value), signal })}
        row={(p: Place) => ({
          main: p.displayName,
          sub: p.category,
          meta: `${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`,
        })}
        onText={(t) => {
          text.value = t
          if (v.value) v.set(null, 'keyboard')
        }}
        onPick={(p: Place) => {
          text.value = p.displayName
          v.set(p, 'keyboard')
        }}
      />
      {list.value.length > 0 && (
        <div class="chips" role="group" aria-label="Prefer">
          {list.value.map((b) => (
            <Chip
              key={b.id}
              pressed={!!(bias.get(b.id) as boolean | undefined)}
              onClick={() => (bias.value = { ...bias.value, [b.id]: !bias.value[b.id] })}
            >
              {b.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}

/** What an address lookup needs from a provider. */
export interface AddressProvider {
  suggest(
    q: string,
    o: { country?: string; signal: AbortSignal },
  ): Promise<Array<{ id: string; label: string; secondary?: string }>>
  resolve(id: string): Promise<Address>
}
/** Props for AddressField. */
export type AddressFieldProps = Bindable<Address | null> & {
  label?: string | undefined
  provider?: AddressProvider | undefined
  countries?: string[] | undefined
  defaultCountry?: string
  locale?: string | undefined
  name?: string | undefined
  errors?: Partial<Record<AddressPart, string>> | undefined
}

function addressState({
  value,
  defaultValue,
  onValueChange,
  defaultCountry,
  provider,
  root,
}: {
  value: () => AddressFieldProps['value']
  defaultValue: () => AddressFieldProps['defaultValue']
  onValueChange: () => AddressFieldProps['onValueChange']
  defaultCountry: () => string
  provider: () => AddressProvider | undefined
  root: () => HTMLDivElement | undefined
}) {
  const v = bindable<Address | null>(value, defaultValue, null, onValueChange)
  const country = state<string | null>(untrack(() => v.value?.country ?? defaultCountry()))
  const format = derived(() => addressFormat(country.value!))
  const manual = state(false)
  const note = state('')
  const touched = state<Record<string, boolean>>({})
  const address = () => v.value ?? { country: country.value!, lines: [] }
  const write = (part: AddressPart, text: string) =>
    v.set(withAddressPart(address(), part, text), 'keyboard')
  const fill = async (id: string) => {
    try {
      const a = await provider()!.resolve(id)
      country.value = a.country
      v.set(a, 'keyboard')
      note.value = 'Filled from suggestion. Check line 2.'
    } catch {
      goManual('Suggestions are unavailable. Enter the address here.')
    }
  }
  const goManual = (say: string) => {
    manual.value = true
    note.value = say
  }
  const zip = derived(() => {
    const f = format.value,
      t = addressPart(v.value, 'postalCode').trim()
    return f.postal && t && touched.value.postal && !f.postal.test(t) ? f.postalMessage : undefined
  })
  use(formReset, root, () => () => {
    v.reset()
    country.value = v.value?.country ?? defaultCountry()
    manual.value = false
    note.value = ''
    touched.value = {}
  })
  return { v, country, format, manual, note, touched, write, fill, goManual, zip }
}

function postalBlur(part: AddressPart, touched: ReturnType<typeof state<Record<string, boolean>>>) {
  return part === 'postalCode'
    ? () => (touched.value = { ...touched.value, postal: true })
    : undefined
}

function setAddressCountry(v: ReturnType<typeof bindable<Address | null>>, country: string | null) {
  if (v.value) v.set({ ...v.value, country: country! }, 'pointer')
}

/**
 * AddressField (04 §3): the country comes first and decides the fields. Line 1 is a combobox when there is a `provider`;
 * manual entry is one click away, and automatic when the provider fails or takes over 1.5s.
 */
export function AddressField({
  value,
  defaultValue,
  onValueChange,
  label = 'Address',
  provider,
  countries,
  defaultCountry = 'US',
  locale,
  name,
  errors,
}: AddressFieldProps) {
  let root: HTMLDivElement | undefined
  const { v, country, format, manual, note, touched, write, fill, goManual, zip } = addressState({
    value: () => value,
    defaultValue: () => defaultValue,
    onValueChange: () => onValueChange,
    defaultCountry: () => defaultCountry,
    provider: () => provider,
    root: () => root,
  })
  return (
    <div ref={(n) => (root = n)} role="group" aria-label={label} class="stack">
      {name && <input type="hidden" name={name} value={v.value ? JSON.stringify(v.value) : ''} />}
      <div class="addr-grid">
        <CountrySelect
          label="Country or region"
          value={country}
          options={countries}
          locale={locale}
          onValueChange={(c) => setAddressCountry(v, c)}
        />
        {format.value.fields.map(([part, title, span, auto]) => {
          const problem = derived(() => errors?.[part])
          return (
            <div key={`${country.value}:${part}`} data-span={span}>
              {part === 'line1' && provider && !manual.value ? (
                <ComboField
                  icon={PinIcon}
                  label={title}
                  autocomplete={auto}
                  text={() => addressPart(v.value, 'line1')}
                  timeout={1500}
                  find={(q, signal) => provider.suggest(q, { country: country.value!, signal })}
                  row={(s) => ({ main: s.label, sub: s.secondary, icon: PinIcon })}
                  onText={(t) => write('line1', t)}
                  onPick={(s) => fill(s.id)}
                  onFail={() => goManual('Suggestions are unavailable. Enter the address here.')}
                />
              ) : (
                <Input
                  label={title}
                  autocomplete={auto}
                  icon={part === 'line1' ? 'pin' : undefined}
                  value={addressPart(v.value, part)}
                  error={
                    problem.value ??
                    (part === 'postalCode' ? zip.value : undefined) ??
                    (errors ? '' : undefined)
                  }
                  onInput={(e) => write(part, e.currentTarget.value)}
                  onBlur={postalBlur(part, touched)}
                />
              )}
            </div>
          )
        })}
      </div>
      <p class="addr-foot">
        {provider && !manual.value && (
          <button type="button" class="linkish" onClick={() => goManual('Manual entry.')}>
            Enter address manually
          </button>
        )}{' '}
        <span aria-live="polite">{note.value}</span>
      </p>
    </div>
  )
}
