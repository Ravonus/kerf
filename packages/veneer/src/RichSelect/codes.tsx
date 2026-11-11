import '@kerf-js/veneer-core/styles/rich/listbox.css'
import '@kerf-js/veneer-core/styles/rich/timezone.css'
import '@kerf-js/veneer-core/styles/rich/phone.css'
import type { RichFieldProps, Bindable, Openable } from '../Picker'
import type { Row } from './list'
import {
  regionCodes,
  displayName,
  languageCodes,
  currencyCodes,
  currencySymbol,
} from '@kerf-js/veneer-core'
import { ListField } from './list'
import { GlobeIcon } from '@kerf-js/veneer-icons'

export type CodeSelectProps = RichFieldProps &
  Bindable<string | null> &
  Openable & { options?: string[] | undefined; preferred?: string[] }

const pinned = (list: string[], first?: string[]) =>
  first ? [...first, ...list.filter((c) => !first.includes(c))] : list

/** CountrySelect (04 §3): names from Intl.DisplayNames in the UI locale; `preferred` pins items. */
export function CountrySelect({ options, preferred, ...props }: CodeSelectProps) {
  const rows = (locale: string): Row[] =>
    pinned(options ?? regionCodes(), preferred).map((c) => {
      const main = displayName('region', c, locale)
      return { key: c, code: c, main, search: `${main} ${c}`.toLowerCase() }
    })
  return (
    <ListField
      icon={GlobeIcon}
      title="Choose a country"
      search="Search countries"
      text={(v, l) => displayName('region', v, l)}
      rows={rows}
      {...props}
    />
  )
}

/** LanguageSelect (04 §3): each language with its endonym, because people look for their own language in their own script. */
export function LanguageSelect({
  options,
  preferred,
  endonyms = true,
  ...props
}: CodeSelectProps & { endonyms?: boolean }) {
  const rows = (locale: string): Row[] =>
    pinned(options ?? languageCodes(), preferred).map((c) => {
      const main = displayName('language', c, locale),
        own = displayName('language', c, c)
      return {
        key: c,
        main,
        sub: endonyms && own !== main ? `· ${own}` : undefined,
        search: `${main} ${own} ${c}`.toLowerCase(),
      }
    })
  return (
    <ListField
      icon={GlobeIcon}
      title="Choose a language"
      search="Search languages"
      text={(v, l) => displayName('language', v, l)}
      rows={rows}
      {...props}
    />
  )
}

/** CurrencySelect (04 §3): "Euro · EUR · €". */
export function CurrencySelect({ options, preferred, ...props }: CodeSelectProps) {
  const rows = (locale: string): Row[] =>
    pinned(options ?? currencyCodes(), preferred).map((c) => {
      const main = displayName('currency', c, locale)
      return {
        key: c,
        main,
        sub: `· ${c}`,
        meta: currencySymbol(c, locale),
        search: `${main} ${c}`.toLowerCase(),
      }
    })
  return (
    <ListField
      title="Choose a currency"
      search="Search currencies"
      text={(v, l) => `${displayName('currency', v, l)} · ${v}`}
      rows={rows}
      {...props}
    />
  )
}
