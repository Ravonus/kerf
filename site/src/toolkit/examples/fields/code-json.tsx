import { CodeInput, Grid, JsonEditor } from '@weft-js/warp'
import { Cell } from '../../world'
import { SCRIPT } from './payment-card-code'

export const CodeInputWrap = () => (
  <CodeInput
    label="Run command"
    language="sh"
    wrap
    rows={3}
    defaultValue="node --max-old-space-size=4096 server.js --port $PORT --region $REGION --log-level info"
  />
)

export const CodeInputErrorLine = () => (
  <CodeInput
    label="Post-deploy hook"
    language="ts"
    defaultValue={SCRIPT}
    rows={8}
    errorLine={3}
    error="Line 3: health.status is a string here."
  />
)

export const CodeInputStates = () => (
  <Grid cols={3} gap="group">
    <Cell name="Empty">
      <CodeInput label="Run command" language="sh" rows={3} />
    </Cell>
    <Cell name="Filled">
      <CodeInput label="Run command" language="sh" rows={3} defaultValue="node server.js" />
    </Cell>
    <Cell name="Hint">
      <CodeInput label="Run command" language="sh" rows={3} hint="Runs once in every copy." />
    </Cell>
    <Cell name="Invalid">
      <CodeInput
        label="Run command"
        language="sh"
        rows={3}
        defaultValue="node"
        error="Name the file to run."
      />
    </Cell>
    <Cell name="Disabled">
      <CodeInput
        label="Run command"
        language="sh"
        rows={3}
        defaultValue="node server.js"
        disabled
      />
    </Cell>
    <Cell name="Read-only">
      <CodeInput
        label="Run command"
        language="sh"
        rows={3}
        defaultValue="node server.js"
        readonly
      />
    </Cell>
  </Grid>
)

/* ---- JsonEditor ---- */

const CONFIG = `{
  "region": "eu-west",
  "copies": 3,
  "healthCheck": "/health"
}`

const BAD_CONFIG = CONFIG.replace('3', '"three"')

export const checkConfig = (v: unknown) =>
  typeof v === 'object' &&
  v !== null &&
  'copies' in v &&
  typeof v.copies === 'number' &&
  v.copies > 0
    ? null
    : '"copies" must be a number above zero.'

export const JsonEditorBasic = () => <JsonEditor label="weft.json" defaultValue={CONFIG} rows={7} />

export const JsonEditorSchema = () => (
  <JsonEditor label="weft.json" defaultValue={BAD_CONFIG} rows={7} schema={checkConfig} />
)

export const JsonEditorBroken = () => (
  <JsonEditor
    label="weft.json"
    defaultValue={'{\n  "region": "eu-west",\n  "copies": 3,\n}'}
    rows={5}
  />
)
