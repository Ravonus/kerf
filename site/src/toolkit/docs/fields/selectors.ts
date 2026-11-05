import type { Doc } from '../../types.ts'
import { shell, picker, listKeys } from './shared.ts'

export const fieldsSelectors: Doc[] = [
  {
    component: 'PhoneField',
    summary:
      'A phone number with a country picker. Formats as people type and stores the full international number.',
    use: {
      when: ['Any phone number you plan to call or text'],
      instead: [{ name: 'Input', why: "it's an extension or an internal number" }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'PhoneFieldBasic',
            title: 'Watch the value',
            note: 'Type a US number. The value stays empty until the number is complete.',
            stage: 'narrow',
            height: 180,
          },
          {
            id: 'PhoneFieldCountries',
            title: 'A short country list',
            note: '`countries` limits the list. A pasted `+49…` picks its country.',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'PhoneFieldStates',
            title: 'Every state',
            note: 'For a number people can see but not change, show a read-only Input.',
            stage: 'fill',
            height: 320,
          },
        ],
      },
    ],
    keyboard: [['Tab', 'Moves from the country button to the number']],
    a11yNotes: [
      'A native `tel` input, so phones show the keypad and SMS autofill works.',
      'The field says how many digits are missing when people leave it.',
    ],
    propDocs: {
      ...shell,
      value: "The number as `+14155550123`, or null until it's complete. Can be a `State`.",
      country: 'The selected country, when you hold it yourself.',
      defaultCountry: "The first country. Follows the page's locale otherwise.",
      countries: 'Limits the list to these countries.',
      onCountryChange: 'Hears the new country.',
    },
    related: ['AddressField', 'CountrySelect', 'Input'],
  },
  {
    component: 'CountrySelect',
    summary: "Pick a country from a searchable list, named in the reader's language.",
    use: {
      when: ['Countries, for tax, billing or shipping'],
      instead: [{ name: 'AddressField', why: 'you need the whole address' }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'CountrySelectBasic',
            title: 'Pin the likely ones',
            note: '`preferred` puts these first. Search covers the rest.',
            stage: 'narrow',
            height: 340,
          },
          {
            id: 'CountrySelectLimited',
            title: 'A short list',
            note: '`options` limits it.',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'CountrySelectStates',
            title: 'Every state',
            note: 'Read-only also needs `open={false}`, which keeps the list shut.',
            stage: 'fill',
            height: 320,
          },
        ],
      },
    ],
    keyboard: listKeys,
    propDocs: picker,
    related: ['LanguageSelect', 'CurrencySelect', 'AddressField', 'Select'],
  },
  {
    component: 'LanguageSelect',
    summary: 'Pick a language. Each one also shows its own name, so people can find theirs.',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'LanguageSelectBasic',
            title: 'Pin the likely ones',
            note: 'Search for `日本語` or `Japanese`: both find it.',
            stage: 'narrow',
            height: 340,
          },
          {
            id: 'LanguageSelectLimited',
            title: 'Only some languages',
            note: '`options` limits the list to the codes you support, regional ones like `pt-BR` included.',
            stage: 'narrow',
            height: 200,
          },
          {
            id: 'LanguageSelectLocale',
            title: 'Names in another language',
            note: "`locale` names the languages in German here. `endonyms={false}` leaves out each language's own name.",
            stage: 'narrow',
            height: 260,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'LanguageSelectStates',
            title: 'Every state',
            note: 'Read-only also needs `open={false}`, which keeps the list shut.',
            stage: 'fill',
            height: 320,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'LanguageSelectPreview',
            title: 'Preview a notification',
            note: 'The value is a language code, ready for `lang` and your own translations.',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
    ],
    keyboard: listKeys,
    propDocs: { ...picker, endonyms: "Shows each language's own name beside it." },
    related: ['CountrySelect', 'TimeZoneSelect'],
  },
  {
    component: 'CurrencySelect',
    summary: 'Pick a currency by name, code or symbol.',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'CurrencySelectBasic',
            title: 'Pin the likely ones',
            note: 'Each row shows the name, code and symbol.',
            stage: 'narrow',
            height: 340,
          },
          {
            id: 'CurrencySelectLimited',
            title: 'Only some currencies',
            note: '`options` limits the list to the codes you can bill in.',
            stage: 'narrow',
            height: 200,
          },
          {
            id: 'CurrencySelectLocale',
            title: 'Names in another language',
            note: '`locale` names the currencies in Japanese here. The value is still the code.',
            stage: 'narrow',
            height: 200,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'CurrencySelectStates',
            title: 'Every state',
            note: 'Read-only also needs `open={false}`, which keeps the list shut.',
            stage: 'fill',
            height: 320,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CurrencySelectPrice',
            title: 'Price in the chosen currency',
            note: 'The value is an ISO code, so `Intl.NumberFormat` can format the price with it.',
            stage: 'narrow',
            height: 240,
          },
        ],
      },
    ],
    keyboard: listKeys,
    propDocs: picker,
    related: ['CountrySelect', 'NumberField'],
  },
  {
    component: 'TimeZoneSelect',
    summary: "Pick a time zone by city or offset. The reader's own zone comes first.",
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'TimeZoneSelectBasic',
            title: 'Every zone',
            note: 'Search by city, zone or an offset like `+5:30`.',
            stage: 'narrow',
            height: 360,
          },
          {
            id: 'TimeZoneSelectOffices',
            title: 'A short list',
            note: '`zones` limits it to the ones you use.',
            stage: 'narrow',
            height: 340,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'TimeZoneSelectStates',
            title: 'Every state',
            note: 'Read-only also needs `open={false}`, which keeps the list shut.',
            stage: 'fill',
            height: 320,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'FormWorkspaceRegion',
            title: 'Workspace region form',
            note: 'All four pickers, posting with a plain form.',
            stage: 'fill',
            height: 320,
          },
        ],
      },
    ],
    keyboard: listKeys,
    propDocs: {
      ...picker,
      value: 'The IANA zone, like `Europe/Berlin`. Can be a `State`.',
      zones: 'Limits the list to these zones.',
      showOffset: "Shows each zone's offset from UTC.",
      referenceDate: 'The date offsets are worked out for, since they change with daylight saving.',
    },
    related: ['CountrySelect', 'LanguageSelect', 'DateTimeField'],
  },
]
