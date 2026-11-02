import { state } from '@weft-js/core'
import { AddressField, Button, Card, CardNumberText, CodeBlock, CodeInput, CountrySelect, CurrencySelect, Grid, Input, JsonEditor, KeyValueEditor, LanguageSelect, MarkdownEditor, MentionsInput, PaymentCardInput, PhoneField, PlaceLookupInput, RichTextEditor, Row, SignaturePad, Stack, Text, TimeZoneSelect, Toaster, toast } from '@weft-js/warp'
import type { Place, ProviderAppearance, ProviderField, SignatureValue } from '@weft-js/warp'
import type { E164 } from '@weft-js/warp-core'
import { PEOPLE, PROJECTS } from '../world'

/** One state in a States grid: its name, then the field. */
const Cell = (p: { name: string; children?: unknown }) => (
  <Stack gap="tight">
    <Text role="caption" subtle>{p.name}</Text>
    {p.children}
  </Stack>
)

/* ---- PhoneField ---- */

const TEAM_COUNTRIES = ['US', 'GB', 'DE', 'FR', 'SE', 'JP', 'IN', 'BR']

export function PhoneFieldBasic() {
  const phone = state<E164 | null>(null)
  return (
    <Stack gap="related">
      <PhoneField label="Mobile number" hint="We'll text you when a deploy fails." value={phone} />
      <Text subtle>{phone.value ? `Saved as ${phone.value}` : 'Not a full number yet'}</Text>
    </Stack>
  )
}

export const PhoneFieldCountries = () => <PhoneField label="Mobile number" defaultCountry="DE" countries={TEAM_COUNTRIES} defaultValue="+4915112345678" />

export const PhoneFieldStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><PhoneField label="Mobile number" /></Cell>
    <Cell name="Filled"><PhoneField label="Mobile number" defaultValue="+14155550123" /></Cell>
    <Cell name="Hint"><PhoneField label="Mobile number" hint="We'll text a code." /></Cell>
    <Cell name="Invalid"><PhoneField label="Mobile number" defaultValue="+14155550123" error="This number is already on another account." /></Cell>
    <Cell name="Disabled"><PhoneField label="Mobile number" defaultValue="+14155550123" disabled /></Cell>
    <Cell name="Read-only"><PhoneField label="Mobile number" defaultValue="+14155550123" readonly /></Cell>
  </Grid>
)

/* ---- CountrySelect, LanguageSelect, CurrencySelect, TimeZoneSelect ---- */

const NEAR_COUNTRIES = ['DE', 'FR', 'SE']
const NEAR_LANGUAGES = ['en', 'de', 'ja']
const NEAR_CURRENCIES = ['EUR', 'USD', 'GBP']
const OFFICE_ZONES = ['Europe/Stockholm', 'Europe/Berlin', 'Europe/Lisbon', 'America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'Asia/Tokyo']

export const CountrySelectBasic = () => <CountrySelect label="Country" preferred={NEAR_COUNTRIES} defaultValue="DE" />

export const CountrySelectLimited = () => <CountrySelect label="Billing country" options={NEAR_COUNTRIES} defaultValue="SE" hint="Tessel invoices in these three." />

export const CountrySelectStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><CountrySelect label="Country" /></Cell>
    <Cell name="Filled"><CountrySelect label="Country" defaultValue="DE" /></Cell>
    <Cell name="Hint"><CountrySelect label="Country" hint="Sets your tax rate." /></Cell>
    <Cell name="Invalid"><CountrySelect label="Country" error="Choose where you're based." /></Cell>
    <Cell name="Disabled"><CountrySelect label="Country" defaultValue="DE" disabled /></Cell>
    <Cell name="Read-only"><CountrySelect label="Country" defaultValue="DE" readonly /></Cell>
  </Grid>
)

export const LanguageSelectBasic = () => <LanguageSelect label="Language" preferred={NEAR_LANGUAGES} defaultValue="ja" />

export const LanguageSelectStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><LanguageSelect label="Language" /></Cell>
    <Cell name="Filled"><LanguageSelect label="Language" defaultValue="de" /></Cell>
    <Cell name="Hint"><LanguageSelect label="Language" hint="Used in emails and on invoices." /></Cell>
    <Cell name="Invalid"><LanguageSelect label="Language" error="Choose a language." /></Cell>
    <Cell name="Disabled"><LanguageSelect label="Language" defaultValue="de" disabled /></Cell>
    <Cell name="Read-only"><LanguageSelect label="Language" defaultValue="de" readonly /></Cell>
  </Grid>
)

/** Only the languages the docs are written in. */
export const LanguageSelectLimited = () => <LanguageSelect label="Docs language" options={['en', 'de', 'ja', 'pt-BR']} defaultValue="pt-BR" hint="We translate the docs into these four." />

/** `locale` names every language in the page's language; `endonyms={false}` drops each one's own name. */
export const LanguageSelectLocale = () => (
  <Stack gap="group">
    <LanguageSelect label="Sprache" locale="de" preferred={NEAR_LANGUAGES} defaultValue="ja" />
    <LanguageSelect label="Language" preferred={NEAR_LANGUAGES} defaultValue="ja" endonyms={false} />
  </Stack>
)

const HELLO: Record<string, string> = { en: 'Your deploy finished.', de: 'Dein Deploy ist fertig.', ja: 'デプロイが完了しました。', 'pt-BR': 'Seu deploy terminou.' }
const TRANSLATED = Object.keys(HELLO)

/** What a notification will say: the language changes the preview as you pick. */
export function LanguageSelectPreview() {
  const lang = state<string | null>('de')
  return (
    <Stack gap="group">
      <LanguageSelect label="Email language" options={TRANSLATED} value={lang} />
      <Card>
        <Stack gap="tight">
          <Text role="caption" subtle>Preview</Text>
          <Text lang={lang.value ?? 'en'}>{HELLO[lang.value ?? 'en']}</Text>
        </Stack>
      </Card>
    </Stack>
  )
}

export const CurrencySelectBasic = () => <CurrencySelect label="Currency" preferred={NEAR_CURRENCIES} defaultValue="EUR" />

export const CurrencySelectStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><CurrencySelect label="Currency" /></Cell>
    <Cell name="Filled"><CurrencySelect label="Currency" defaultValue="EUR" /></Cell>
    <Cell name="Hint"><CurrencySelect label="Currency" hint="Applies from the next invoice." /></Cell>
    <Cell name="Invalid"><CurrencySelect label="Currency" error="Choose a billing currency." /></Cell>
    <Cell name="Disabled"><CurrencySelect label="Currency" defaultValue="EUR" disabled /></Cell>
    <Cell name="Read-only"><CurrencySelect label="Currency" defaultValue="EUR" readonly /></Cell>
  </Grid>
)

export const TimeZoneSelectBasic = () => <TimeZoneSelect label="Time zone" defaultValue="Europe/Stockholm" hint="Deploy windows follow this zone." />

export const TimeZoneSelectOffices = () => <TimeZoneSelect label="Office" zones={OFFICE_ZONES} defaultValue="Asia/Tokyo" />

export const TimeZoneSelectStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><TimeZoneSelect label="Time zone" /></Cell>
    <Cell name="Filled"><TimeZoneSelect label="Time zone" defaultValue="Europe/Berlin" /></Cell>
    <Cell name="Hint"><TimeZoneSelect label="Time zone" hint="Deploy windows follow this zone." /></Cell>
    <Cell name="Invalid"><TimeZoneSelect label="Time zone" error="Choose a time zone." /></Cell>
    <Cell name="Disabled"><TimeZoneSelect label="Time zone" defaultValue="Europe/Berlin" disabled /></Cell>
    <Cell name="Read-only"><TimeZoneSelect label="Time zone" defaultValue="Europe/Berlin" readonly /></Cell>
  </Grid>
)

export function FormWorkspaceRegion() {
  const save = (e: Event) => {
    e.preventDefault()
    toast.show({ title: 'Workspace updated', description: 'New invoices use these settings.' })
  }
  return (
    <>
      <Stack as="form" gap="group" onSubmit={save}>
        <Text role="heading">Workspace region</Text>
        <Grid cols={2} gap="group">
          <CountrySelect label="Country" name="country" preferred={NEAR_COUNTRIES} defaultValue="SE" />
          <LanguageSelect label="Language" name="language" preferred={NEAR_LANGUAGES} defaultValue="en" />
          <CurrencySelect label="Currency" name="currency" preferred={NEAR_CURRENCIES} defaultValue="EUR" />
          <TimeZoneSelect label="Time zone" name="zone" zones={OFFICE_ZONES} defaultValue="Europe/Stockholm" />
        </Grid>
        <Row justify="end"><Button type="submit">Save changes</Button></Row>
      </Stack>
      <Toaster />
    </>
  )
}

/** Only the currencies you can bill in. */
export const CurrencySelectLimited = () => <CurrencySelect label="Billing currency" options={['EUR', 'USD', 'GBP', 'SEK']} defaultValue="SEK" hint="Stripe pays out in these four." />

/** `locale` names the currencies in another language: Japanese here. */
export const CurrencySelectLocale = () => <CurrencySelect label="通貨" locale="ja" preferred={['JPY', 'USD', 'EUR']} defaultValue="JPY" />

/** The same plan, priced in the chosen currency. */
const PLAN_PRICE: Record<string, number> = { EUR: 20, USD: 22, GBP: 17, SEK: 229, JPY: 3300 }
const PRICED = Object.keys(PLAN_PRICE)

export function CurrencySelectPrice() {
  const cur = state<string | null>('EUR')
  const price = () => new Intl.NumberFormat('en', { style: 'currency', currency: cur.value ?? 'EUR', maximumFractionDigits: 0 }).format(PLAN_PRICE[cur.value ?? 'EUR']!)
  return (
    <Stack gap="group">
      <CurrencySelect label="Pay in" options={PRICED} value={cur} />
      <Row justify="between">
        <Text>Team plan, per seat</Text>
        <Row gap="tight" align="baseline"><Text role="heading">{price()}</Text><Text subtle>a month</Text></Row>
      </Row>
    </Stack>
  )
}

/* ---- AddressField ---- */

const OFFICE = { country: 'DE', lines: ['Torstraße 140'], locality: 'Berlin', postalCode: '10119' }

const STREETS = [
  { id: 'a', label: '548 Market Street', secondary: 'San Francisco, CA 94104', address: { country: 'US', lines: ['548 Market Street'], locality: 'San Francisco', region: 'CA', postalCode: '94104' } },
  { id: 'b', label: '1 Infinite Loop', secondary: 'Cupertino, CA 95014', address: { country: 'US', lines: ['1 Infinite Loop'], locality: 'Cupertino', region: 'CA', postalCode: '95014' } },
  { id: 'c', label: '350 Fifth Avenue', secondary: 'New York, NY 10118', address: { country: 'US', lines: ['350 Fifth Avenue'], locality: 'New York', region: 'NY', postalCode: '10118' } },
]
const streetProvider = {
  suggest: (q: string) => Promise.resolve(STREETS.filter(s => s.label.toLowerCase().includes(q.toLowerCase()))),
  resolve: (id: string) => Promise.resolve(STREETS.find(s => s.id === id)!.address),
}

export const AddressFieldBasic = () => <AddressField label="Billing address" defaultValue={OFFICE} />

export const AddressFieldLookup = () => <AddressField label="Shipping address" provider={streetProvider} countries={['US', 'CA']} />

export const AddressFieldErrors = () => <AddressField label="Billing address" defaultValue={OFFICE} errors={{ postalCode: 'This postal code doesn\'t match Berlin.' }} />

export function FormBilling() {
  const pay = (e: Event) => {
    e.preventDefault()
    toast.show({ title: 'Billing details saved' })
  }
  return (
    <>
      <Stack as="form" gap="group" onSubmit={pay}>
        <Text role="heading">Billing details</Text>
        <Input label="Company" autocomplete="organization" defaultValue="Tessel GmbH" />
        <AddressField label="Billing address" name="address" defaultValue={OFFICE} />
        <Grid cols={2} gap="group">
          <PhoneField label="Phone" name="phone" defaultCountry="DE" countries={TEAM_COUNTRIES} />
          <CurrencySelect label="Currency" name="currency" preferred={NEAR_CURRENCIES} defaultValue="EUR" />
        </Grid>
        <Row justify="end"><Button type="submit">Save details</Button></Row>
      </Stack>
      <Toaster />
    </>
  )
}

/* ---- PlaceLookupInput ---- */

const PLACES: Place[] = [
  { id: 'sto', displayName: 'Stockholm, Sweden', category: 'City', lat: 59.3293, lng: 18.0686, timezone: 'Europe/Stockholm' },
  { id: 'ber', displayName: 'Berlin, Germany', category: 'City', lat: 52.52, lng: 13.405, timezone: 'Europe/Berlin' },
  { id: 'lis', displayName: 'Lisbon, Portugal', category: 'City', lat: 38.7223, lng: -9.1393, timezone: 'Europe/Lisbon' },
  { id: 'lim', displayName: 'Lima, Peru', category: 'City', lat: -12.0464, lng: -77.0428, timezone: 'America/Lima' },
  { id: 'tok', displayName: 'Tokyo, Japan', category: 'City', lat: 35.6762, lng: 139.6503, timezone: 'Asia/Tokyo' },
  { id: 'arn', displayName: 'Stockholm Arlanda Airport', category: 'Airport', lat: 59.6498, lng: 17.9238, timezone: 'Europe/Stockholm' },
  { id: 'lhr', displayName: 'London Heathrow Airport', category: 'Airport', lat: 51.47, lng: -0.4543, timezone: 'Europe/London' },
]
const PLACE_KINDS = [{ id: 'city', label: 'Cities', default: true }, { id: 'air', label: 'Airports' }]

const findPlace = async (q: string, o: { bias: Record<string, boolean> }) => {
  await new Promise(done => { setTimeout(done, 200) })
  const kinds = [o.bias.city && 'City', o.bias.air && 'Airport']
  return PLACES.filter(p => kinds.includes(p.category) && p.displayName.toLowerCase().includes(q.toLowerCase()))
}

export const PlaceLookupInputBasic = () => <PlaceLookupInput label="Office location" hint="Try Stockholm or Lima." search={findPlace} biases={PLACE_KINDS} />

export function PlaceLookupInputPicked() {
  const place = state<Place | null>(PLACES[0] ?? null)
  return (
    <Stack gap="related">
      <PlaceLookupInput label="Nearest office" search={findPlace} value={place} />
      <Text subtle>{place.value ? `New deploys run close to ${place.value.displayName}.` : 'Pick a place from the list.'}</Text>
    </Stack>
  )
}

export const PlaceLookupInputStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><PlaceLookupInput label="Office location" search={findPlace} /></Cell>
    <Cell name="Filled"><PlaceLookupInput label="Office location" search={findPlace} defaultValue={PLACES[1]!} /></Cell>
    <Cell name="Hint"><PlaceLookupInput label="Office location" search={findPlace} hint="Used to pick a region." /></Cell>
    <Cell name="Invalid"><PlaceLookupInput label="Office location" search={findPlace} error="Pick a place from the list." /></Cell>
    <Cell name="Disabled"><PlaceLookupInput label="Office location" search={findPlace} defaultValue={PLACES[1]!} disabled /></Cell>
    <Cell name="Read-only"><PlaceLookupInput label="Office location" search={findPlace} defaultValue={PLACES[1]!} readonly /></Cell>
  </Grid>
)

/* ---- PaymentCardInput and CardNumberText ---- */

/** Stands in for Stripe Elements or Adyen: you mount their field and pass on its events. Nothing here leaves the page. */
function testProvider(el: HTMLElement, look: ProviderAppearance): ProviderField {
  const input = el.ownerDocument.createElement('input')
  input.inputMode = 'numeric'
  input.setAttribute('aria-label', 'Test card number')
  Object.assign(input.style, { all: 'unset', width: '100%', font: `${look.fontSize} ${look.fontFamily}`, color: look.color })
  input.onfocus = () => (input.placeholder = '4242 4242 4242 4242')
  input.onblur = () => (input.placeholder = '')
  el.append(input)
  return {
    on(event, send) {
      if (event !== 'change') return input.addEventListener(event, () => send({}))
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\s/g, '')
        send({ complete: digits.length === 16, error: /\D/.test(digits) ? 'A card number only has digits.' : undefined })
      })
    },
    destroy: () => input.remove(),
  }
}

const failedProvider = (el: HTMLElement, look: ProviderAppearance) => {
  const field = testProvider(el, look)
  return { ...field, on: (event: Parameters<ProviderField['on']>[0], send: Parameters<ProviderField['on']>[1]) => (event === 'change' ? queueMicrotask(() => send({ error: 'This card was declined.' })) : field.on(event, send)) }
}

export const PaymentCardInputBasic = () => <PaymentCardInput label="Card details" mount={testProvider} />

export const PaymentCardInputStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><PaymentCardInput label="Card details" mount={testProvider} /></Cell>
    <Cell name="Hint"><PaymentCardInput label="Card details" mount={testProvider} hint="Charged on the 1st of each month." /></Cell>
    <Cell name="Invalid"><PaymentCardInput label="Card details" mount={failedProvider} /></Cell>
  </Grid>
)

/** A test provider that says when the number is whole, so Pay waits for a complete card. */
function watchedProvider(done: (complete: boolean) => void) {
  return (el: HTMLElement, look: ProviderAppearance): ProviderField => {
    const field = testProvider(el, look)
    return { ...field, on: (event, send) => field.on(event, event === 'change' ? e => { done(!!e.complete); send(e) } : send) }
  }
}

/** A checkout's card step: Pay stays off until the provider says the card is complete. */
export function PaymentCardInputCheckout() {
  const complete = state(false)
  const paid = state(false)
  return (
    <Stack as="form" gap="group" onSubmit={(e: Event) => { e.preventDefault(); paid.value = true }}>
      <Text role="heading">Pay for Team</Text>
      <Input label="Name on card" autocomplete="cc-name" defaultValue="Mara Lindqvist" />
      <PaymentCardInput label="Card details" hint="Try 4242 4242 4242 4242." mount={watchedProvider(c => (complete.value = c))} />
      <Row justify="between">
        <Text subtle role="caption">{paid.value ? 'Paid. A receipt is on its way.' : '$160 today, then monthly.'}</Text>
        <Button type="submit" aria-disabled={complete.value ? undefined : 'true'}>Pay $160</Button>
      </Row>
    </Stack>
  )
}

const CARDS = [
  { last4: '4242', bin: '424242', month: 9, year: 2028, note: 'Default' },
  { last4: '4444', bin: '555555', month: 3, year: 2027, note: 'Backup' },
  { last4: '0005', bin: '378282', month: 11, year: 2026, note: 'Expires soon' },
]

export const CardNumberTextBasic = () => <CardNumberText last4="4242" bin="424242" expiry={{ month: 9, year: 2028 }} />

export const CardNumberTextBrands = () => (
  <Stack gap="tight">
    <CardNumberText last4="4242" bin="424242" />
    <CardNumberText last4="4444" bin="555555" />
    <CardNumberText last4="0005" bin="378282" />
    <CardNumberText last4="1117" brand="Discover" />
  </Stack>
)

export function CardNumberTextSaved() {
  const main = state('4242')
  return (
    <Stack gap="related" divided>
      {CARDS.map(c => (
        <Row key={c.last4} justify="between" gap="group">
          <Stack gap="hair">
            <CardNumberText last4={c.last4} bin={c.bin} expiry={c} />
            <Text role="caption" subtle>{main.value === c.last4 ? 'Default' : c.note === 'Default' ? 'Saved' : c.note}</Text>
          </Stack>
          <Button size="sm" emphasis="ghost" tone="neutral" aria-disabled={main.value === c.last4 ? 'true' : undefined} onClick={() => (main.value = c.last4)}>Make default</Button>
        </Row>
      ))}
    </Stack>
  )
}

/* ---- CodeInput ---- */

const SCRIPT = `export async function onDeploy(ctx) {
  const health = await ctx.fetch('/health')
  if (health.status !== 200) {
    return ctx.rollback('Health check failed')
  }
  await ctx.notify('#deploys', ctx.commit)
}
`

export const CodeInputBasic = () => <CodeInput label="Post-deploy hook" language="ts" defaultValue={SCRIPT} rows={8} />

export const CodeInputWrap = () => <CodeInput label="Run command" language="sh" wrap rows={3} defaultValue="node --max-old-space-size=4096 server.js --port $PORT --region $REGION --log-level info" />

export const CodeInputErrorLine = () => <CodeInput label="Post-deploy hook" language="ts" defaultValue={SCRIPT} rows={8} errorLine={3} error="Line 3: health.status is a string here." />

export const CodeInputStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><CodeInput label="Run command" language="sh" rows={3} /></Cell>
    <Cell name="Filled"><CodeInput label="Run command" language="sh" rows={3} defaultValue="node server.js" /></Cell>
    <Cell name="Hint"><CodeInput label="Run command" language="sh" rows={3} hint="Runs once in every copy." /></Cell>
    <Cell name="Invalid"><CodeInput label="Run command" language="sh" rows={3} defaultValue="node" error="Name the file to run." /></Cell>
    <Cell name="Disabled"><CodeInput label="Run command" language="sh" rows={3} defaultValue="node server.js" disabled /></Cell>
    <Cell name="Read-only"><CodeInput label="Run command" language="sh" rows={3} defaultValue="node server.js" readonly /></Cell>
  </Grid>
)

/* ---- JsonEditor ---- */

const CONFIG = `{
  "region": "eu-west",
  "copies": 3,
  "healthCheck": "/health"
}`

const BAD_CONFIG = CONFIG.replace('3', '"three"')
const checkConfig = (v: unknown) => (typeof v === 'object' && v !== null && 'copies' in v && typeof v.copies === 'number' && v.copies > 0 ? null : '"copies" must be a number above zero.')

export const JsonEditorBasic = () => <JsonEditor label="tessel.json" defaultValue={CONFIG} rows={7} />

export const JsonEditorSchema = () => <JsonEditor label="tessel.json" defaultValue={BAD_CONFIG} rows={7} schema={checkConfig} />

export const JsonEditorBroken = () => <JsonEditor label="tessel.json" defaultValue={'{\n  "region": "eu-west",\n  "copies": 3,\n}'} rows={5} />

export const JsonEditorStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><JsonEditor label="tessel.json" rows={3} /></Cell>
    <Cell name="Filled"><JsonEditor label="tessel.json" rows={3} defaultValue={'{ "copies": 3 }'} /></Cell>
    <Cell name="Invalid"><JsonEditor label="tessel.json" rows={3} defaultValue={'{ "copies": 0 }'} schema={checkConfig} /></Cell>
    <Cell name="Disabled"><JsonEditor label="tessel.json" rows={3} defaultValue={'{ "copies": 3 }'} disabled /></Cell>
    <Cell name="Read-only"><JsonEditor label="tessel.json" rows={3} defaultValue={'{ "copies": 3 }'} readonly /></Cell>
  </Grid>
)

/* ---- KeyValueEditor ---- */

const ENV = [{ key: 'NODE_ENV', value: 'production' }, { key: 'API_URL', value: 'https://api.tessel.dev' }, { key: 'LOG_LEVEL', value: 'info' }]
const HEADERS = [{ key: 'Cache-Control', value: 'max-age=30' }, { key: 'X-Frame-Options', value: 'DENY' }]

export function KeyValueEditorEnv() {
  const env = state(ENV)
  return (
    <Stack gap="related">
      <KeyValueEditor label="Environment variables" keyLabel="Name" value={env} />
      <Text subtle>{env.value.filter(r => r.key).length} variables reach the next deploy.</Text>
    </Stack>
  )
}

export const KeyValueEditorJson = () => <KeyValueEditor label="Response headers" keyLabel="Header" json defaultValue={HEADERS} />

export const KeyValueEditorDuplicate = () => <KeyValueEditor label="Environment variables" keyLabel="Name" defaultValue={[...ENV, { key: 'LOG_LEVEL', value: 'debug' }]} />

export const KeyValueEditorStates = () => (
  <Grid cols={2} gap="group">
    <Cell name="Empty"><KeyValueEditor label="Response headers" /></Cell>
    <Cell name="Filled"><KeyValueEditor label="Response headers" defaultValue={HEADERS} /></Cell>
    <Cell name="Hint"><KeyValueEditor label="Response headers" hint="Added to every response." defaultValue={HEADERS} /></Cell>
    <Cell name="Invalid"><KeyValueEditor label="Response headers" error="X-Frame-Options can't be changed on this plan." defaultValue={HEADERS} /></Cell>
  </Grid>
)

/* ---- MentionsInput ---- */

const MEMBERS = PEOPLE.map(p => ({ id: p.id, label: p.name, meta: p.team }))
const REPOS = PROJECTS.map(p => ({ id: p.id, label: p.name, meta: p.region, kind: 'project' }))
const matching = (list: typeof MEMBERS, q: string) => list.filter(i => i.label.toLowerCase().includes(q.toLowerCase())).slice(0, 5)
const MENTIONS = { '@': (q: string) => Promise.resolve(matching(MEMBERS, q)), '#': (q: string) => Promise.resolve(matching(REPOS, q)) }

export const MentionsInputBasic = () => <MentionsInput label="Comment" hint="Type @ for people, # for projects." triggers={MENTIONS} />

export function MentionsInputComment() {
  const text = state('Can @[Jun Tanaka](user:jun) look at #[mobile-bff](project:mobile-bff) before the release? ')
  const said = state<string[]>([])
  const post = (e: Event) => {
    e.preventDefault()
    said.value = [...said.value, text.value]
    text.value = ''
  }
  return (
    <Stack as="form" gap="related" onSubmit={post}>
      <MentionsInput label="Comment" triggers={MENTIONS} value={text} />
      <Row justify="end"><Button type="submit">Comment</Button></Row>
      {said.value.map(s => <Text key={s} role="code" subtle>{s}</Text>)}
    </Stack>
  )
}

export const MentionsInputStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><MentionsInput label="Comment" triggers={MENTIONS} /></Cell>
    <Cell name="Filled"><MentionsInput label="Comment" triggers={MENTIONS} defaultValue="Thanks @[Priya Raman](user:priya)!" /></Cell>
    <Cell name="Hint"><MentionsInput label="Comment" triggers={MENTIONS} hint="Type @ to tag someone." /></Cell>
    <Cell name="Invalid"><MentionsInput label="Comment" triggers={MENTIONS} defaultValue="ok" error="Say a little more." /></Cell>
    <Cell name="Disabled"><MentionsInput label="Comment" triggers={MENTIONS} defaultValue="Thanks @[Priya Raman](user:priya)!" disabled /></Cell>
    <Cell name="Read-only"><MentionsInput label="Comment" triggers={MENTIONS} defaultValue="Thanks @[Priya Raman](user:priya)!" readonly /></Cell>
  </Grid>
)

/* ---- RichTextEditor ---- */

const NOTES = '<h2>October release</h2><p>Product images now come from the <strong>edge</strong>, about 40% faster.</p><ul><li>Apple Pay on the last checkout step</li><li>A shorter stale window</li></ul>'
const NOTES_MD = '## October release\n\nProduct images now come from the **edge**.\n\n- Apple Pay at checkout\n- A shorter stale window\n'
const people = { search: (q: string) => Promise.resolve(matching(MEMBERS, q)) }

export const RichTextEditorBasic = () => <RichTextEditor label="Release notes" defaultValue={NOTES} mentions={people} />

export const RichTextEditorBubble = () => <RichTextEditor label="Release notes" toolbar="bubble" defaultValue="<p>Select some of this text to see the toolbar.</p>" />

export const RichTextEditorLimited = () => <RichTextEditor label="Comment" marks={['bold', 'italic', 'link']} blocks={['ul']} placeholder="Leave a comment" />

export function RichTextEditorMarkdown() {
  const text = state(NOTES_MD)
  return (
    <Stack gap="related">
      <RichTextEditor label="Release notes" format="markdown" value={text} />
      <CodeBlock code={text.value} language="markdown" />
    </Stack>
  )
}

export const RichTextEditorStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><RichTextEditor label="Notes" toolbar="none" /></Cell>
    <Cell name="Filled"><RichTextEditor label="Notes" toolbar="none" defaultValue="<p>Shipped on <strong>Friday</strong>.</p>" /></Cell>
    <Cell name="Hint"><RichTextEditor label="Notes" toolbar="none" hint="Type / for blocks, @ to tag someone." mentions={people} /></Cell>
    <Cell name="Invalid"><RichTextEditor label="Notes" toolbar="none" error="Write something before you publish." /></Cell>
  </Grid>
)

/* ---- MarkdownEditor ---- */

const README = `# storefront

The public shop, served from the **edge**.

## Run it

- \`npm install\`
- \`npm run dev\`

See [the deploy guide](https://tessel.dev/docs) for more.
`

export const MarkdownEditorBasic = () => <MarkdownEditor label="README" defaultValue={README} />

export const MarkdownEditorShort = () => <MarkdownEditor label="Changelog entry" rows={5} defaultValue={'**Fixed:** retries on timed out calls.'} hint="⌘B and ⌘I wrap the selection." />

export const MarkdownEditorStates = () => (
  <Stack gap="group">
    <Cell name="Empty"><MarkdownEditor label="Changelog entry" rows={3} /></Cell>
    <Cell name="Filled"><MarkdownEditor label="Changelog entry" rows={3} defaultValue="**Fixed:** retries." /></Cell>
    <Cell name="Hint"><MarkdownEditor label="Changelog entry" rows={3} hint="⌘B and ⌘I wrap the selection." /></Cell>
    <Cell name="Invalid"><MarkdownEditor label="Changelog entry" rows={3} defaultValue="tbd" error="Say what changed." /></Cell>
    <Cell name="Disabled"><MarkdownEditor label="Changelog entry" rows={3} defaultValue="**Fixed:** retries." disabled /></Cell>
    <Cell name="Read-only"><MarkdownEditor label="Changelog entry" rows={3} defaultValue="**Fixed:** retries." readonly /></Cell>
  </Stack>
)

/* ---- SignaturePad ---- */

export function SignaturePadBasic() {
  const signature = state<SignatureValue | null>(null)
  return (
    <Stack gap="related">
      <SignaturePad label="Signature" value={signature} />
      <Text subtle>{signature.value ? `Signed: ${signature.value.method}` : 'Not signed yet'}</Text>
    </Stack>
  )
}

export const SignaturePadTyped = () => <SignaturePad label="Signature" defaultValue={{ method: 'typed', text: 'Mara Lindqvist', svg: '' }} />

export const SignaturePadStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty"><SignaturePad label="Signature" /></Cell>
    <Cell name="Hint"><SignaturePad label="Signature" hint="Sign as Mara Lindqvist, Owner." /></Cell>
    <Cell name="Invalid"><SignaturePad label="Signature" error="Sign before you continue." /></Cell>
  </Grid>
)

export function FormDataAgreement() {
  const signature = state<SignatureValue | null>(null)
  const tried = state(false)
  const done = state(false)
  const submit = (e: Event) => {
    e.preventDefault()
    tried.value = true
    if (signature.value) done.value = true
  }
  return (
    <Stack as="form" gap="group" onSubmit={submit}>
      <Stack gap="hair">
        <Text role="heading">Data processing agreement</Text>
        <Text subtle>Tessel GmbH will process logs only to run your deploys.</Text>
      </Stack>
      <SignaturePad label="Signature" value={signature} error={tried.value && !signature.value ? 'Sign before you continue.' : undefined} />
      <Button type="submit" full>{done.value ? 'Signed' : 'Sign agreement'}</Button>
    </Stack>
  )
}
