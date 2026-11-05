import { state } from '@weft-js/core'
import {
  Grid,
  JsonEditor,
  KeyValueEditor,
  MentionsInput,
  Stack,
  Text,
} from '@weft-js/warp'
import { PEOPLE, PROJECTS, Cell } from '../../world'

import { checkConfig } from './code-json'

export const JsonEditorStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Empty">
      <JsonEditor
        label="weft.json"
        rows={3}
      />
    </Cell>
    <Cell name="Filled">
      <JsonEditor
        label="weft.json"
        rows={3}
        defaultValue={'{ "copies": 3 }'}
      />
    </Cell>
    <Cell name="Invalid">
      <JsonEditor
        label="weft.json"
        rows={3}
        defaultValue={'{ "copies": 0 }'}
        schema={checkConfig}
      />
    </Cell>
    <Cell name="Disabled">
      <JsonEditor
        label="weft.json"
        rows={3}
        defaultValue={'{ "copies": 3 }'}
        disabled
      />
    </Cell>
    <Cell name="Read-only">
      <JsonEditor
        label="weft.json"
        rows={3}
        defaultValue={'{ "copies": 3 }'}
        readonly
      />
    </Cell>
  </Grid>
)

/* ---- KeyValueEditor ---- */

const ENV = [
  { key: 'NODE_ENV', value: 'production' },
  { key: 'API_URL', value: 'https://api.weft.dev' },
  { key: 'LOG_LEVEL', value: 'info' },
]

const HEADERS = [
  { key: 'Cache-Control', value: 'max-age=30' },
  { key: 'X-Frame-Options', value: 'DENY' },
]

export function KeyValueEditorEnv() {
  const env = state(ENV)
  return (
    <Stack gap="related">
      <KeyValueEditor
        label="Environment variables"
        keyLabel="Name"
        value={env}
      />
      <Text subtle>
        {env.value.filter((r) => r.key).length} variables
        reach the next deploy.
      </Text>
    </Stack>
  )
}

export const KeyValueEditorJson = () => (
  <KeyValueEditor
    label="Response headers"
    keyLabel="Header"
    json
    defaultValue={HEADERS}
  />
)

export const KeyValueEditorDuplicate = () => (
  <KeyValueEditor
    label="Environment variables"
    keyLabel="Name"
    defaultValue={[
      ...ENV,
      { key: 'LOG_LEVEL', value: 'debug' },
    ]}
  />
)

export const KeyValueEditorStates = () => (
  <Grid
    cols={2}
    gap="group"
  >
    <Cell name="Empty">
      <KeyValueEditor label="Response headers" />
    </Cell>
    <Cell name="Filled">
      <KeyValueEditor
        label="Response headers"
        defaultValue={HEADERS}
      />
    </Cell>
    <Cell name="Hint">
      <KeyValueEditor
        label="Response headers"
        hint="Added to every response."
        defaultValue={HEADERS}
      />
    </Cell>
    <Cell name="Invalid">
      <KeyValueEditor
        label="Response headers"
        error={
          "X-Frame-Options can't be changed " +
          'on this plan.'
        }
        defaultValue={HEADERS}
      />
    </Cell>
  </Grid>
)

/* ---- MentionsInput ---- */

export const MEMBERS = PEOPLE.map(
  ({ id, name, team }) => ({
    id,
    label: name,
    meta: team,
  }),
)

const REPOS = PROJECTS.map(({ id, name, region }) => ({
  id,
  label: name,
  meta: region,
  kind: 'project',
}))

export const matching = (
  list: typeof MEMBERS,
  q: string,
) =>
  list
    .filter((i) =>
      i.label.toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 5)

export const MENTIONS = {
  '@': (q: string) =>
    Promise.resolve(matching(MEMBERS, q)),
  '#': (q: string) => Promise.resolve(matching(REPOS, q)),
}

export const MentionsInputBasic = () => (
  <MentionsInput
    label="Comment"
    hint="Type @ for people, # for projects."
    triggers={MENTIONS}
  />
)
