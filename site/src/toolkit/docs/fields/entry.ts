import type { Doc } from '../../types.ts'
import { shell } from './shared.ts'

export const fieldsEntry: Doc[] = [
  {
    component: 'AddressField',
    summary: 'A postal address whose fields, order and labels follow the country.',
    use: {
      when: ['Billing and shipping addresses'],
      instead: [
        { name: 'PlaceLookupInput', why: 'you want a place on a map, not a postal address' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'AddressFieldBasic',
            title: 'Follows the country',
            note: 'Change the country and the fields change with it.',
            stage: 'fill',
            height: 340,
          },
          {
            id: 'AddressFieldLookup',
            title: 'With suggestions',
            note: 'Type `market` in the street field. A `provider` adds suggestions, and people can always type it by hand.',
            stage: 'fill',
            height: 360,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'AddressFieldErrors',
            title: 'An error on one line',
            note: '`errors` is keyed by line. Its value posts as JSON through `name`.',
            stage: 'fill',
            height: 360,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'FormBilling',
            title: 'Billing details form',
            note: 'Use `AddressField`, `PhoneField` and `CurrencySelect` together in one form for billing details.',
            stage: 'fill',
            height: 620,
          },
        ],
      },
    ],
    a11yNotes: [
      'Each line is a labelled input with the right `autocomplete`, so browsers can fill it.',
      'If the provider fails or takes over 1.5 seconds, it falls back to typing by hand.',
    ],
    propDocs: {
      label: 'The name of the whole group, for screen readers.',
      value: 'The address, or a `State` to bind.',
      defaultValue: 'The first address.',
      onValueChange: 'Hears the new address and why it changed.',
      provider: 'Where suggestions come from: `suggest` and `resolve`. Veneer ships none.',
      countries: 'Limits the country list.',
      defaultCountry: 'The country to start on.',
      errors: 'A message per line, keyed `line1`, `postalCode` and so on.',
      name: 'Posts the address as JSON.',
    },
    related: ['PlaceLookupInput', 'CountrySelect', 'PhoneField'],
  },
  {
    component: 'PlaceLookupInput',
    summary: 'Find a place, like a city or an airport, through your own search.',
    use: {
      when: ['A location, not somewhere to send a letter'],
      instead: [{ name: 'AddressField', why: 'you need a postal address' }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'PlaceLookupInputBasic',
            title: 'With filters',
            note: '`biases` adds chips that are passed to your `search`.',
            stage: 'narrow',
            height: 320,
          },
          {
            id: 'PlaceLookupInputPicked',
            title: 'Use what was picked',
            note: 'The value is the whole place, coordinates and time zone included.',
            stage: 'narrow',
            height: 300,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'PlaceLookupInputStates',
            title: 'Every state',
            note: 'A place lookup can show a `hint` or an `error`, and can be `disabled` or `readonly`.',
            stage: 'fill',
            height: 340,
          },
        ],
      },
    ],
    keyboard: [
      ['↑ ↓', 'Moves through the results'],
      ['Enter', 'Picks the highlighted place'],
      ['Esc', 'Closes the list'],
    ],
    propDocs: {
      ...shell,
      search: 'Your geocoder. Veneer ships none. Gets the text, the filters and an abort signal.',
      biases: 'Filter chips: `{ id, label, default }`.',
      minChars: 'How many letters before it searches.',
      value: 'The place, or a `State` to bind.',
      onValueChange: 'Hears the new place and why it changed.',
    },
    related: ['AddressField', 'Combobox'],
  },
  {
    component: 'PaymentCardInput',
    summary:
      "A frame around your payment provider's card field, so it matches the rest of the form.",
    use: {
      when: ['Taking a card with Stripe, Adyen or similar'],
      instead: [{ name: 'CardNumberText', why: "you're showing a card already saved" }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'PaymentCardInputBasic',
            title: 'A hosted field',
            note: "This one is a stand-in that sends nothing anywhere. Use a test number like the one shown. Your `mount` gets Veneer's colours and fonts to pass to the provider.",
            stage: 'narrow',
            height: 180,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'PaymentCardInputStates',
            title: 'Empty, hint and invalid',
            note: "Errors come from the provider's `change` event.",
            stage: 'fill',
            height: 220,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'PaymentCardInputCheckout',
            title: "A checkout's card step",
            note: "Listen to the provider's `change` event in your `mount`: Pay waits until it says the card is `complete`.",
            stage: 'narrow',
            height: 340,
          },
        ],
      },
    ],
    a11yNotes: [
      "Veneer never draws an input for a real card number. The number stays inside the provider's frame.",
    ],
    propDocs: {
      ...shell,
      mount:
        "Mounts the provider's field in the element it's given, and returns its `on` and `destroy`.",
    },
    related: ['CardNumberText', 'Input'],
  },
  {
    component: 'CardNumberText',
    summary: 'Shows a saved card safely: its brand, last four digits and expiry.',
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'CardNumberTextBasic',
            title: 'Brand and expiry',
            note: 'The brand comes from `bin`, the first digits.',
          },
          {
            id: 'CardNumberTextBrands',
            title: 'Brands',
            note: 'American Express groups its digits its own way. Pass `brand` if you only have the name.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CardNumberTextSaved',
            title: 'Saved cards',
            note: 'Use `last4`, `bin` and `expiry` to show a saved card without its full number.',
            stage: 'narrow',
            height: 240,
          },
        ],
      },
    ],
    a11yNotes: ['Reads as "Visa ending 4242", not as a row of dots.'],
    propDocs: {
      last4: 'The last four digits.',
      bin: 'The first digits, used to work out the brand.',
      brand: "The brand's name, when you already know it.",
      expiry: '`{ month, year }`, shown as MM/YY.',
    },
    related: ['PaymentCardInput'],
  },
  {
    component: 'CodeInput',
    tile: 'CodeInputWrap',
    summary: 'A code field with colours, line numbers and Tab that indents.',
    use: {
      when: ['A script, a command or a config people edit by hand'],
      instead: [
        { name: 'JsonEditor', why: "it's JSON and should be checked" },
        { name: 'CodeBlock', why: "it's only for reading" },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'CodeInputBasic',
            title: 'A hook',
            note: 'Tab indents. Press Esc, then Tab, to leave the field.',
            stage: 'fill',
            height: 260,
          },
          {
            id: 'CodeInputWrap',
            title: 'Wrapped lines',
            note: '`wrap` soft-wraps long lines, and line numbers step aside.',
            stage: 'narrow',
            height: 180,
          },
          {
            id: 'CodeInputErrorLine',
            title: 'Mark a line',
            note: '`errorLine` marks it in the gutter.',
            stage: 'fill',
            height: 280,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'CodeInputStates',
            title: 'Every state',
            note: 'A code input can show a `hint` or an `error`, and can be `disabled` or `readonly`.',
            stage: 'fill',
            height: 420,
          },
        ],
      },
    ],
    keyboard: [
      ['Tab', 'Indents'],
      ['⇧ Tab', 'Outdents'],
      ['Esc then Tab', 'Leaves the field'],
    ],
    a11yNotes: [
      'A real `<textarea>`, so screen readers, undo and paste work as usual.',
      'The hint tells keyboard users how to leave the field, since Tab is taken.',
    ],
    propDocs: {
      ...shell,
      language: 'What to colour it as.',
      lineNumbers: 'Draws the line numbers.',
      tabSize: '2 or 4 spaces.',
      wrap: 'Soft-wraps long lines. Line numbers then step aside.',
      rows: 'The height in lines.',
      errorLine: 'The line to mark in the gutter.',
      onReset: "Called after a form's reset.",
    },
    related: ['JsonEditor', 'CodeBlock'],
  },
]
