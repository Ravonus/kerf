// The data behind the identity inputs (04 §3): time zones, regions, languages and currencies from Intl, and phone
// formatting from a small per-country table (the specimen's: pattern, national trunk prefix, national length).
import { offsetName, todayIso } from './temporal'

export type CountryCode = string
export type E164 = `+${number}`
export interface PhoneCountry { code: CountryCode; dial: string; pattern: string; trunk: string | null; len: number }

export const PHONE_COUNTRIES: PhoneCountry[] = ([
  ['US', '1', '(###) ###-####', null, 10], ['CA', '1', '(###) ###-####', null, 10], ['GB', '44', '##### ######', '0', 11],
  ['DE', '49', '#### ########', '0', 12], ['FR', '33', '## ## ## ## ##', '0', 10], ['ES', '34', '### ## ## ##', null, 9],
  ['NL', '31', '## ########', '0', 10], ['SE', '46', '###-### ## ##', '0', 10], ['IN', '91', '##### #####', null, 10],
  ['JP', '81', '###-####-####', '0', 11], ['KR', '82', '###-####-####', '0', 11], ['AU', '61', '#### ### ###', '0', 10],
  ['BR', '55', '(##) #####-####', null, 11], ['MX', '52', '## #### ####', null, 10], ['NG', '234', '#### ### ####', '0', 11],
] as const).map(([code, dial, pattern, trunk, len]) => ({ code, dial, pattern, trunk, len }))

export const digitsOf = (s: string) => s.replace(/\D/g, '')
const apply = (pattern: string, d: string) => {
  let out = '', i = 0
  for (const ch of pattern) {
    if (i >= d.length) break
    if (ch === '#') out += d[i++]
    else out += ch
  }
  return out + d.slice(i)
}
export const nationalLength = (c: PhoneCountry) => (c.trunk ? c.len - 1 : c.len)
/** What the input shows for typed digits, and the national digits it holds. */
export function formatPhone(input: string, c: PhoneCountry) {
  let d = digitsOf(input)
  if (c.trunk === null && d.length > c.len) d = d.slice(0, c.len)
  const trunked = !!c.trunk && d.startsWith(c.trunk)
  d = d.slice(0, (c.trunk && !trunked ? c.len - 1 : c.len) + 2)
  const shown = c.trunk && !trunked ? apply(c.pattern, c.trunk + d).slice(1).trimStart() : apply(c.pattern, d)
  return { shown, national: trunked ? d.slice(1) : d }
}
/** The caret after a reformat: behind the same number of digits it was (04 §1.3). */
export function caretAfter(shown: string, digitsBefore: number) {
  let pos = 0, seen = 0
  while (pos < shown.length && seen < digitsBefore) { if (/\d/.test(shown[pos]!)) seen++; pos++ }
  return pos
}
/** The country a pasted `+…` number belongs to: the longest dial code, the current country winning a tie. */
export function inferCountry(text: string, current: PhoneCountry, list = PHONE_COUNTRIES) {
  const d = digitsOf(text)
  return list.filter(c => d.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length || (a === current ? -1 : b === current ? 1 : 0))[0]
}

export interface ZoneRow { zone: string; city: string; region: string; offset: string; search: string }

const LEGACY: Record<string, string> = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires', 'Atlantic/Faeroe': 'Atlantic/Faroe' }
export const localZone = () => { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; return LEGACY[z] ?? z }
const zoneNames = (locale: string, zone: string, date: string) => (['long', 'short'] as const).map(timeZoneName => new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName }).formatToParts(new Date(`${date}T12:00:00Z`)).find(p => p.type === 'timeZoneName')?.value ?? '')
export const zoneCity = (zone: string) => zone.split('/').pop()!.replace(/_/g, ' ')

/** Every zone with its offset at `date` (offsets change with DST), as current IANA names rather than legacy links. */
export function zoneRows(locale: string, date = todayIso(), zones?: string[]): ZoneRow[] {
  const list = zones ?? [...new Set([...Intl.supportedValuesOf('timeZone').map(z => LEGACY[z] ?? z), localZone()])]
  return list.map(zone => {
    const offset = offsetName(zone, date)
    const [long, short] = zoneNames(locale, zone, date)
    const city = zoneCity(zone)
    const search = `${zone} ${city} ${long} ${short} ${offset}`.toLowerCase().replace(/[_\s]/g, '')
    return { zone, city, region: zone.includes('/') ? zone.split('/')[0]! : '', offset, search }
  })
}
/** Search: city, zone, Intl names, abbreviations, and offsets typed like `+5:30`. */
export function matchZone(row: ZoneRow, query: string) {
  const q = query.toLowerCase().replace(/[_\s]/g, '')
  if (!q) return true
  const off = /^[+-]?(\d{1,2})(?::?(\d{2}))?$/.exec(q)
  if (off) return row.offset.slice(3).replace(/^[+-]/, '').startsWith(`${off[1]!.padStart(2, '0')}:${off[2] ?? ''}`) && (q[0] !== '-' || row.offset[3] === '-') && (q[0] !== '+' || row.offset[3] === '+')
  return row.search.includes(q)
}

const REGIONS = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
export const regionCodes = () => REGIONS.split(' ')
const LANGUAGES = 'ar bn cs da de el en es fa fi fr he hi hu id it ja ko ms nl no pl pt ro ru sv sw ta th tr uk ur vi zh'
export const languageCodes = () => LANGUAGES.split(' ')
export const currencyCodes = () => Intl.supportedValuesOf('currency')
export const displayName = (type: Intl.DisplayNamesType, code: string, locale: string) => { try { return new Intl.DisplayNames(locale, { type }).of(code) ?? code } catch { return code } }
export const currencySymbol = (code: string, locale: string) => new Intl.NumberFormat(locale, { style: 'currency', currency: code }).formatToParts(0).find(p => p.type === 'currency')?.value ?? code

/** The list of a card number's display (04 §5): the last four, grouped 4-4-4-4 or Amex 4-6-5. */
export const cardBrand = (bin: string) => (/^3[47]/.test(bin) ? 'American Express' : bin.startsWith('4') ? 'Visa' : /^(5[1-5]|2[2-7])/.test(bin) ? 'Mastercard' : /^6(011|5)/.test(bin) ? 'Discover' : 'Card')
export const cardMask = (last4: string, brand = '') => (/american/i.test(brand) ? `•••• •••••• •${last4}` : `•••• ${last4}`)

/** AddressField (04 §3): the country decides the fields, their order, labels and postal rule. */
export interface Address { country: string; lines: string[]; locality?: string; dependentLocality?: string; region?: string | undefined; postalCode?: string; sortingCode?: string; organization?: string; recipient?: string }
export type AddressPart = 'line1' | 'line2' | 'locality' | 'region' | 'postalCode'
export interface AddressFormat { fields: [part: AddressPart, label: string, span: number, autocomplete: string][]; postal?: RegExp; postalMessage?: string }

const line1 = (label: string): AddressFormat['fields'][number] => ['line1', label, 6, 'address-line1']
const line2 = (label: string): AddressFormat['fields'][number] => ['line2', label, 6, 'address-line2']
const city = (label: string, span: number): AddressFormat['fields'][number] => ['locality', label, span, 'address-level2']
const zip = (label: string, span: number): AddressFormat['fields'][number] => ['postalCode', label, span, 'postal-code']
const FORMATS: Record<string, AddressFormat> = {
  US: { fields: [line1('Street address'), line2('Apt, suite (optional)'), city('City', 2), ['region', 'State', 2, 'address-level1'], zip('ZIP code', 2)], postal: /^\d{5}(-\d{4})?$/, postalMessage: 'A ZIP code is 5 digits, like 94107.' },
  GB: { fields: [line1('Address line 1'), line2('Address line 2 (optional)'), city('Town or city', 4), zip('Postcode', 2)], postal: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, postalMessage: 'A postcode looks like SW1A 1AA.' },
  IE: { fields: [line1('Address line 1'), line2('Address line 2 (optional)'), city('Town or city', 4), zip('Eircode', 2)], postal: /^[A-Z\d]{3} ?[A-Z\d]{4}$/i, postalMessage: 'An Eircode looks like D02 AF30.' },
  JP: { fields: [zip('Postal code 〒', 2), ['region', 'Prefecture', 4, 'address-level1'], city('City, ward', 6), line1('Town, block, number'), line2('Building, room (optional)')], postal: /^\d{3}-?\d{4}$/, postalMessage: 'A postal code is 7 digits, like 100-0001.' },
  DE: { fields: [line1('Street and number'), line2('Address supplement (optional)'), zip('PLZ', 2), city('City', 4)], postal: /^\d{5}$/, postalMessage: 'A PLZ is 5 digits, like 10115.' },
}
const WORLD: AddressFormat = { fields: [line1('Address line 1'), line2('Address line 2 (optional)'), city('City', 3), ['region', 'Region', 3, 'address-level1'], zip('Postal code', 6)] }
export const addressFormat = (country: string) => FORMATS[country] ?? WORLD
export const addressPart = (a: Address | null, p: AddressPart) => (p === 'line1' ? a?.lines[0] : p === 'line2' ? a?.lines[1] : a?.[p]) ?? ''
export const withAddressPart = (a: Address, p: AddressPart, v: string): Address => (p === 'line1' ? { ...a, lines: [v, a.lines[1] ?? ''] } : p === 'line2' ? { ...a, lines: [a.lines[0] ?? '', v] } : { ...a, [p]: v })
