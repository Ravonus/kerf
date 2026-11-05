import { state } from '@weft-js/core'
import {
  Card,
  CurrencySelect,
  Grid,
  LanguageSelect,
  Stack,
  Text,
  TimeZoneSelect,
} from '@weft-js/warp'
import { Cell } from '../../world'
import {
  NEAR_LANGUAGES,
  NEAR_CURRENCIES,
  OFFICE_ZONES,
} from './phone-country'

export const LanguageSelectStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Empty">
      <LanguageSelect label="Language" />
    </Cell>
    <Cell name="Filled">
      <LanguageSelect
        label="Language"
        defaultValue="de"
      />
    </Cell>
    <Cell name="Hint">
      <LanguageSelect
        label="Language"
        hint="Used in emails and on invoices."
      />
    </Cell>
    <Cell name="Invalid">
      <LanguageSelect
        label="Language"
        error="Choose a language."
      />
    </Cell>
    <Cell name="Disabled">
      <LanguageSelect
        label="Language"
        defaultValue="de"
        disabled
      />
    </Cell>
    <Cell name="Read-only">
      <LanguageSelect
        label="Language"
        defaultValue="de"
        readonly
      />
    </Cell>
  </Grid>
)

/** Only the languages the docs are written in. */
export const LanguageSelectLimited = () => (
  <LanguageSelect
    label="Docs language"
    options={['en', 'de', 'ja', 'pt-BR']}
    defaultValue="pt-BR"
    hint="We translate the docs into these four."
  />
)

/**
 * `locale` names every language in the page's
 * language; `endonyms={false}` drops each one's own
 * name.
 */
export const LanguageSelectLocale = () => (
  <Stack gap="group">
    <LanguageSelect
      label="Sprache"
      locale="de"
      preferred={NEAR_LANGUAGES}
      defaultValue="ja"
    />
    <LanguageSelect
      label="Language"
      preferred={NEAR_LANGUAGES}
      defaultValue="ja"
      endonyms={false}
    />
  </Stack>
)

const HELLO: Record<string, string> = {
  en: 'Your deploy finished.',
  de: 'Dein Deploy ist fertig.',
  ja: 'デプロイが完了しました。',
  'pt-BR': 'Seu deploy terminou.',
}

const TRANSLATED = Object.keys(HELLO)

/**
 * What a notification will say: the language
 * changes the preview as you pick.
 */
export function LanguageSelectPreview() {
  const lang = state<string | null>('de')
  return (
    <Stack gap="group">
      <LanguageSelect
        label="Email language"
        options={TRANSLATED}
        value={lang}
      />
      <Card>
        <Stack gap="tight">
          <Text
            role="caption"
            subtle
          >
            Preview
          </Text>
          <Text lang={lang.value ?? 'en'}>
            {HELLO[lang.value ?? 'en']}
          </Text>
        </Stack>
      </Card>
    </Stack>
  )
}

export const CurrencySelectBasic = () => (
  <CurrencySelect
    label="Currency"
    preferred={NEAR_CURRENCIES}
    defaultValue="EUR"
  />
)

export const CurrencySelectStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Empty">
      <CurrencySelect label="Currency" />
    </Cell>
    <Cell name="Filled">
      <CurrencySelect
        label="Currency"
        defaultValue="EUR"
      />
    </Cell>
    <Cell name="Hint">
      <CurrencySelect
        label="Currency"
        hint="Applies from the next invoice."
      />
    </Cell>
    <Cell name="Invalid">
      <CurrencySelect
        label="Currency"
        error="Choose a billing currency."
      />
    </Cell>
    <Cell name="Disabled">
      <CurrencySelect
        label="Currency"
        defaultValue="EUR"
        disabled
      />
    </Cell>
    <Cell name="Read-only">
      <CurrencySelect
        label="Currency"
        defaultValue="EUR"
        readonly
      />
    </Cell>
  </Grid>
)

export const TimeZoneSelectBasic = () => (
  <TimeZoneSelect
    label="Time zone"
    defaultValue="Europe/Stockholm"
    hint="Deploy windows follow this zone."
  />
)

export const TimeZoneSelectOffices = () => (
  <TimeZoneSelect
    label="Office"
    zones={OFFICE_ZONES}
    defaultValue="Asia/Tokyo"
  />
)
