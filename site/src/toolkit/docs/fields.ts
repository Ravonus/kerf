import type { DocGroup } from '../types.ts'

const shell = { label: 'The visible name, and what screen readers announce.', hint: 'A short line of help under the field.', error: 'Replaces the hint and marks the field invalid.', name: 'Posts the value with a form.', disabled: 'Can\'t be focused or changed.' }
const picker = { ...shell, value: 'The code, or a `State` to bind.', defaultValue: 'The first value, when you don\'t hold it yourself.', onValueChange: 'Hears the new value and why it changed.', preferred: 'Codes pinned to the top of the list.', options: 'Limits the list to these codes.', locale: 'The language names are shown in. Follows the page otherwise.' }
const listKeys: [string, string][] = [['Enter Space', 'Opens the list'], ['↑ ↓', 'Moves through the results'], ['Enter', 'Picks the highlighted row'], ['Esc', 'Closes and returns focus']]

export const fields: DocGroup = {
  file: 'fields',
  title: 'Rich fields',
  intro: 'Phones, addresses, cards, code, signatures and text editors.',
  pack: true,
  docs: [
    {
      component: 'PhoneField',
      summary: 'A phone number with a country picker. Formats as people type and stores the full international number.',
      use: { when: ['Any phone number you plan to call or text'], instead: [{ name: 'Input', why: 'it\'s an extension or an internal number' }] },
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'PhoneFieldBasic', title: 'Watch the value', note: 'Type a US number. The value stays empty until the number is complete.', stage: 'narrow', height: 180 },
          { id: 'PhoneFieldCountries', title: 'A short country list', note: '`countries` limits the list. A pasted `+49…` picks its country.', stage: 'narrow', height: 280 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'PhoneFieldStates', title: 'Every state', stage: 'fill', height: 320 }] },
      ],
      keyboard: [['Tab', 'Moves from the country button to the number']],
      a11yNotes: ['A native `tel` input, so phones show the keypad and SMS autofill works.', 'The field says how many digits are missing when people leave it.'],
      propDocs: { ...shell, value: 'The number as `+14155550123`, or null until it\'s complete. Can be a `State`.', country: 'The selected country, when you hold it yourself.', defaultCountry: 'The first country. Follows the page\'s locale otherwise.', countries: 'Limits the list to these countries.', onCountryChange: 'Hears the new country.' },
      related: ['AddressField', 'CountrySelect', 'Input'],
    },
    {
      component: 'CountrySelect',
      summary: 'Pick a country from a searchable list, named in the reader\'s language.',
      use: { when: ['Countries, for tax, billing or shipping'], instead: [{ name: 'AddressField', why: 'you need the whole address' }] },
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'CountrySelectBasic', title: 'Pin the likely ones', note: '`preferred` puts these first. Search covers the rest.', stage: 'narrow', height: 340 },
          { id: 'CountrySelectLimited', title: 'A short list', note: '`options` limits it.', stage: 'narrow', height: 280 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'CountrySelectStates', title: 'Every state', stage: 'fill', height: 320 }] },
      ],
      keyboard: listKeys,
      propDocs: picker,
      related: ['LanguageSelect', 'CurrencySelect', 'AddressField', 'Select'],
    },
    {
      component: 'LanguageSelect',
      summary: 'Pick a language. Each one also shows its own name, so people can find theirs.',
      sections: [
        { kind: 'variants', title: 'Examples', examples: [{ id: 'LanguageSelectBasic', title: 'Pin the likely ones', note: 'Search for `日本語` or `Japanese`: both find it.', stage: 'narrow', height: 340 }] },
        { kind: 'states', title: 'States', examples: [{ id: 'LanguageSelectStates', title: 'Every state', stage: 'fill', height: 320 }] },
      ],
      keyboard: listKeys,
      propDocs: { ...picker, endonyms: 'Shows each language\'s own name beside it.' },
      related: ['CountrySelect', 'TimeZoneSelect'],
    },
    {
      component: 'CurrencySelect',
      summary: 'Pick a currency by name, code or symbol.',
      sections: [
        { kind: 'variants', title: 'Examples', examples: [{ id: 'CurrencySelectBasic', title: 'Pin the likely ones', note: 'Each row shows the name, code and symbol.', stage: 'narrow', height: 340 }] },
        { kind: 'states', title: 'States', examples: [{ id: 'CurrencySelectStates', title: 'Every state', stage: 'fill', height: 320 }] },
      ],
      keyboard: listKeys,
      propDocs: picker,
      related: ['CountrySelect', 'NumberField'],
    },
    {
      component: 'TimeZoneSelect',
      summary: 'Pick a time zone by city or offset. The reader\'s own zone comes first.',
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'TimeZoneSelectBasic', title: 'Every zone', note: 'Search by city, zone or an offset like `+5:30`.', stage: 'narrow', height: 360 },
          { id: 'TimeZoneSelectOffices', title: 'A short list', note: '`zones` limits it to the ones you use.', stage: 'narrow', height: 340 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'TimeZoneSelectStates', title: 'Every state', stage: 'fill', height: 320 }] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'FormWorkspaceRegion', title: 'Workspace region form', note: 'All four pickers, posting with a plain form.', stage: 'fill', height: 320 }] },
      ],
      keyboard: listKeys,
      propDocs: { ...picker, value: 'The IANA zone, like `Europe/Berlin`. Can be a `State`.', zones: 'Limits the list to these zones.', showOffset: 'Shows each zone\'s offset from UTC.', referenceDate: 'The date offsets are worked out for, since they change with daylight saving.' },
      related: ['CountrySelect', 'LanguageSelect', 'DateTimeField'],
    },
    {
      component: 'AddressField',
      summary: 'A postal address whose fields, order and labels follow the country.',
      use: { when: ['Billing and shipping addresses'], instead: [{ name: 'PlaceLookupInput', why: 'you want a place on a map, not a postal address' }] },
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'AddressFieldBasic', title: 'Follows the country', note: 'Change the country and the fields change with it.', stage: 'fill', height: 340 },
          { id: 'AddressFieldLookup', title: 'With suggestions', note: 'Type `market` in the street field. A `provider` adds suggestions, and people can always type it by hand.', stage: 'fill', height: 360 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'AddressFieldErrors', title: 'An error on one line', note: '`errors` is keyed by line. Its value posts as JSON through `name`.', stage: 'fill', height: 360 }] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'FormBilling', title: 'Billing details form', stage: 'fill', height: 620 }] },
      ],
      a11yNotes: ['Each line is a labelled input with the right `autocomplete`, so browsers can fill it.', 'If the provider fails or takes over 1.5 seconds, it falls back to typing by hand.'],
      propDocs: { label: 'The name of the whole group, for screen readers.', value: 'The address, or a `State` to bind.', defaultValue: 'The first address.', onValueChange: 'Hears the new address and why it changed.', provider: 'Where suggestions come from: `suggest` and `resolve`. warp ships none.', countries: 'Limits the country list.', defaultCountry: 'The country to start on.', errors: 'A message per line, keyed `line1`, `postalCode` and so on.', name: 'Posts the address as JSON.' },
      related: ['PlaceLookupInput', 'CountrySelect', 'PhoneField'],
    },
    {
      component: 'PlaceLookupInput',
      summary: 'Find a place, like a city or an airport, through your own search.',
      use: { when: ['A location, not somewhere to send a letter'], instead: [{ name: 'AddressField', why: 'you need a postal address' }] },
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'PlaceLookupInputBasic', title: 'With filters', note: '`biases` adds chips that are passed to your `search`.', stage: 'narrow', height: 320 },
          { id: 'PlaceLookupInputPicked', title: 'Use what was picked', note: 'The value is the whole place, coordinates and time zone included.', stage: 'narrow', height: 300 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'PlaceLookupInputStates', title: 'Every state', stage: 'fill', height: 340 }] },
      ],
      keyboard: [['↑ ↓', 'Moves through the results'], ['Enter', 'Picks the highlighted place'], ['Esc', 'Closes the list']],
      propDocs: { ...shell, search: 'Your geocoder. warp ships none. Gets the text, the filters and an abort signal.', biases: 'Filter chips: `{ id, label, default }`.', minChars: 'How many letters before it searches.', value: 'The place, or a `State` to bind.', onValueChange: 'Hears the new place and why it changed.' },
      related: ['AddressField', 'Combobox'],
    },
    {
      component: 'PaymentCardInput',
      summary: 'A frame around your payment provider\'s card field, so it matches the rest of the form.',
      use: { when: ['Taking a card with Stripe, Adyen or similar'], instead: [{ name: 'CardNumberText', why: 'you\'re showing a card already saved' }] },
      sections: [
        { kind: 'variants', title: 'Examples', examples: [{ id: 'PaymentCardInputBasic', title: 'A hosted field', note: 'This one is a stand-in that sends nothing anywhere. Use a test number like the one shown. Your `mount` gets warp\'s colours and fonts to pass to the provider.', stage: 'narrow', height: 180 }] },
        { kind: 'states', title: 'States', examples: [{ id: 'PaymentCardInputStates', title: 'Empty, hint and invalid', note: 'Errors come from the provider\'s `change` event.', stage: 'fill', height: 220 }] },
      ],
      a11yNotes: ['warp never draws an input for a real card number. The number stays inside the provider\'s frame.'],
      propDocs: { ...shell, mount: 'Mounts the provider\'s field in the element it\'s given, and returns its `on` and `destroy`.' },
      related: ['CardNumberText', 'Input'],
    },
    {
      component: 'CardNumberText',
      summary: 'Shows a saved card safely: its brand, last four digits and expiry.',
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'CardNumberTextBasic', title: 'Brand and expiry', note: 'The brand comes from `bin`, the first digits.' },
          { id: 'CardNumberTextBrands', title: 'Brands', note: 'American Express groups its digits its own way. Pass `brand` if you only have the name.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'CardNumberTextSaved', title: 'Saved cards', stage: 'narrow', height: 240 }] },
      ],
      a11yNotes: ['Reads as "Visa ending 4242", not as a row of dots.'],
      propDocs: { last4: 'The last four digits.', bin: 'The first digits, used to work out the brand.', brand: 'The brand\'s name, when you already know it.', expiry: '`{ month, year }`, shown as MM/YY.' },
      related: ['PaymentCardInput'],
    },
    {
      component: 'CodeInput',
      summary: 'A code field with colours, line numbers and Tab that indents.',
      use: { when: ['A script, a command or a config people edit by hand'], instead: [{ name: 'JsonEditor', why: 'it\'s JSON and should be checked' }, { name: 'CodeBlock', why: 'it\'s only for reading' }] },
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'CodeInputBasic', title: 'A hook', note: 'Tab indents. Press Esc, then Tab, to leave the field.', stage: 'fill', height: 260 },
          { id: 'CodeInputWrap', title: 'Wrapped lines', note: '`wrap` soft-wraps long lines, and line numbers step aside.', stage: 'narrow', height: 180 },
          { id: 'CodeInputErrorLine', title: 'Mark a line', note: '`errorLine` marks it in the gutter.', stage: 'fill', height: 280 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'CodeInputStates', title: 'Every state', stage: 'fill', height: 420 }] },
      ],
      keyboard: [['Tab', 'Indents'], ['⇧ Tab', 'Outdents'], ['Esc then Tab', 'Leaves the field']],
      a11yNotes: ['A real `<textarea>`, so screen readers, undo and paste work as usual.', 'The hint tells keyboard users how to leave the field, since Tab is taken.'],
      propDocs: { ...shell, language: 'What to colour it as.', lineNumbers: 'Draws the line numbers.', tabSize: '2 or 4 spaces.', wrap: 'Soft-wraps long lines. Line numbers then step aside.', rows: 'The height in lines.', errorLine: 'The line to mark in the gutter.', onReset: 'Called after a form\'s reset.' },
      related: ['JsonEditor', 'CodeBlock'],
    },
    {
      component: 'JsonEditor',
      summary: 'A code field for JSON that points to the line with the mistake.',
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'JsonEditorBasic', title: 'A config', note: 'The hint counts the keys, and Format tidies it.', stage: 'fill', height: 260 },
          { id: 'JsonEditorBroken', title: 'A parse error', note: 'Delete the trailing comma and the error goes.', stage: 'fill', height: 220 },
          { id: 'JsonEditorSchema', title: 'Your own check', note: '`schema` gets the parsed value and returns a message. Change the value to `3`.', stage: 'fill', height: 260 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'JsonEditorStates', title: 'Every state', stage: 'fill', height: 440 }] },
      ],
      keyboard: [['Tab', 'Indents'], ['Esc then Tab', 'Leaves the field']],
      propDocs: { ...shell, schema: 'Checks the parsed value. What it returns shows as the error.', tabSize: '2 or 4 spaces, used by Format too.', rows: 'The height in lines.' },
      related: ['CodeInput', 'KeyValueEditor'],
    },
    {
      component: 'KeyValueEditor',
      summary: 'A small table of names and values, like environment variables or headers.',
      use: { when: ['Pairs people add and remove by hand'], instead: [{ name: 'JsonEditor', why: 'values nest' }] },
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'KeyValueEditorEnv', title: 'Environment variables', note: 'Add a row, type, remove it. Focus lands somewhere sensible each time.', stage: 'fill', height: 300 },
          { id: 'KeyValueEditorJson', title: 'Form or JSON', note: '`json` adds a switch. Both views edit the same value.', stage: 'fill', height: 280 },
          { id: 'KeyValueEditorDuplicate', title: 'A repeated key', note: 'A warning, not a block: the last one wins.', stage: 'fill', height: 320 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'KeyValueEditorStates', title: 'Empty, filled, hint and invalid', stage: 'fill', height: 460 }] },
      ],
      keyboard: [['Tab', 'Moves from cell to cell'], ['Enter', 'On Add row, adds one and moves to it']],
      propDocs: { ...shell, value: 'The rows as `{ key, value }`, or a `State` to bind.', onValueChange: 'Hears the new rows and why they changed.', keyLabel: 'The first column\'s heading.', valueLabel: 'The second column\'s heading.', json: 'Adds a switch to a JSON view of the same value.' },
      related: ['JsonEditor', 'Table'],
    },
    {
      component: 'MentionsInput',
      summary: 'A text box where @ tags people and # links projects.',
      use: { when: ['Comments and notes that mention people or things'], instead: [{ name: 'RichTextEditor', why: 'people also need formatting' }] },
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'MentionsInputBasic', title: 'Two triggers', note: 'Each key in `triggers` is a character and its search.', stage: 'narrow', height: 300 },
          { id: 'MentionsInputComment', title: 'Post a comment', note: 'People see names. The value keeps a token, shown here after you post.', stage: 'narrow', height: 320 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'MentionsInputStates', title: 'Every state', stage: 'fill', height: 360 }] },
      ],
      keyboard: [['↑ ↓', 'Moves through the list'], ['Enter Tab', 'Inserts the highlighted one'], ['Esc', 'Closes the list']],
      a11yNotes: ['A plain textarea, so paste, autofill and spellcheck still work.', 'Each insertion is announced.'],
      propDocs: { ...shell, triggers: 'A character and its search, like `{ \'@\': findPeople }`. Superseded searches are aborted.', value: 'The text with tokens like `@[Ada](user:ada)`. Can be a `State`.', rows: 'The starting height in lines.' },
      related: ['Textarea', 'RichTextEditor', 'Combobox'],
    },
    {
      component: 'RichTextEditor',
      summary: 'Formatted text with a toolbar, Markdown shortcuts and / for blocks.',
      use: { when: ['Long notes, articles, descriptions with structure'], instead: [{ name: 'MarkdownEditor', why: 'people prefer to see the source' }, { name: 'Textarea', why: 'plain text will do' }] },
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'RichTextEditorBasic', title: 'Release notes', note: 'Try `/` on an empty line, `@`, or `#` and a space.', stage: 'fill', height: 300 },
          { id: 'RichTextEditorBubble', title: 'A bubble toolbar', note: '`toolbar="bubble"` shows it over a selection.', stage: 'narrow', height: 200 },
          { id: 'RichTextEditorLimited', title: 'Fewer tools', note: '`marks` and `blocks` choose the buttons.', stage: 'narrow', height: 200 },
          { id: 'RichTextEditorMarkdown', title: 'Store Markdown', note: '`format="markdown"` reads and writes Markdown. People still see formatted text.', stage: 'fill', height: 360 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'RichTextEditorStates', title: 'Empty, filled, hint and invalid', stage: 'fill', height: 360 }] },
      ],
      keyboard: [['⌘ B', 'Bold'], ['⌘ I', 'Italic'], ['⌘ K', 'Link'], ['/', 'Opens the block list on an empty line'], ['← →', 'Moves along the toolbar']],
      a11yNotes: ['The toolbar is one Tab stop, with arrow keys inside it.', 'Everything that enters the editor, a value or a paste, is cleaned first.'],
      propDocs: { ...shell, format: '`html` or `markdown`, for what `value` holds.', toolbar: '`fixed`, `bubble` or `none`. A phone docks it above the keyboard.', marks: 'Which inline tools to show.', blocks: 'Which block tools to show.', commands: 'What `/` offers.', mentions: 'Turns on `@`: `{ search }`.', placeholder: 'Shown while it\'s empty.', minRows: 'The least height in lines.', maxRows: 'The most height before it scrolls.' },
      related: ['MarkdownEditor', 'MentionsInput', 'Textarea'],
    },
    {
      component: 'MarkdownEditor',
      summary: 'Write Markdown beside a live preview.',
      use: { when: ['READMEs, changelogs, docs: people who like seeing the source'], instead: [{ name: 'RichTextEditor', why: 'people shouldn\'t need to know Markdown' }] },
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'MarkdownEditorBasic', title: 'A README', note: 'Side by side when there\'s room, tabs when there isn\'t.', stage: 'fill', height: 380 },
          { id: 'MarkdownEditorShort', title: 'A short entry', stage: 'fill', height: 240 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'MarkdownEditorStates', title: 'Every state', stage: 'fill', height: 900 }] },
      ],
      keyboard: [['⌘ B', 'Wraps the selection in bold'], ['⌘ I', 'Wraps it in italics'], ['⌘ K', 'Wraps it in a link'], ['← →', 'Moves between Write and Preview on the tabs']],
      propDocs: { ...shell, value: 'The Markdown, or a `State` to bind.', rows: 'The height in lines.' },
      related: ['RichTextEditor', 'Markdown', 'Textarea'],
    },
    {
      component: 'SignaturePad',
      summary: 'Sign by drawing or by typing a name.',
      sections: [
        { kind: 'variants', title: 'Examples', examples: [
          { id: 'SignaturePadBasic', title: 'Draw to sign', note: 'Draw with a mouse, a finger or a pen. Undo takes back one stroke.', stage: 'narrow', height: 340 },
          { id: 'SignaturePadTyped', title: 'Type to sign', note: 'Always on offer, for people who can\'t draw.', stage: 'narrow', height: 320 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'SignaturePadStates', title: 'Empty, hint and invalid', stage: 'fill', height: 360 }] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'FormDataAgreement', title: 'Sign an agreement', note: 'Press the button without signing.', stage: 'narrow', height: 460 }] },
      ],
      a11yNotes: ['Typing a name is always available, so keyboard and switch users can sign.', 'The status under the pad is announced.'],
      propDocs: { ...shell, value: 'The signature with its strokes or text and an SVG, or a `State` to bind.', onValueChange: 'Hears the new signature and why it changed.' },
      related: ['Input', 'Canvas'],
    },
  ],
}
