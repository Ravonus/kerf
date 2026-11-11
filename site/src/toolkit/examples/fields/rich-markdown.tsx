import { state } from '@kerf-js/core'
import {
  Grid,
  MarkdownEditor,
  RichTextEditor,
  SignaturePad,
  Stack,
  Text,
} from '@kerf-js/veneer'
import type { SignatureValue } from '@kerf-js/veneer'
import { Cell } from '../../world'
import { people } from './mentions-rich-text'

export const RichTextEditorStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Empty">
      <RichTextEditor
        label="Notes"
        toolbar="none"
      />
    </Cell>
    <Cell name="Filled">
      <RichTextEditor
        label="Notes"
        toolbar="none"
        defaultValue={
          '<p>Shipped on <strong>Friday</strong>.</p>'
        }
      />
    </Cell>
    <Cell name="Hint">
      <RichTextEditor
        label="Notes"
        toolbar="none"
        hint="Type / for blocks, @ to tag someone."
        mentions={people}
      />
    </Cell>
    <Cell name="Invalid">
      <RichTextEditor
        label="Notes"
        toolbar="none"
        error="Write something before you publish."
      />
    </Cell>
  </Grid>
)

/* ---- MarkdownEditor ---- */

const README = `# storefront

The public shop, served from the **edge**.

## Run it

- \`npm install\`
- \`npm run dev\`

See [the deploy guide](https://kerf.dev/docs) for more.
`

export const MarkdownEditorBasic = () => (
  <MarkdownEditor
    label="README"
    defaultValue={README}
  />
)

export const MarkdownEditorShort = () => (
  <MarkdownEditor
    label="Changelog entry"
    rows={5}
    defaultValue={
      '**Fixed:** retries on timed out calls.'
    }
    hint="⌘B and ⌘I wrap the selection."
  />
)

export const MarkdownEditorStates = () => (
  <Stack gap="group">
    <Cell name="Empty">
      <MarkdownEditor
        label="Changelog entry"
        rows={3}
      />
    </Cell>
    <Cell name="Filled">
      <MarkdownEditor
        label="Changelog entry"
        rows={3}
        defaultValue="**Fixed:** retries."
      />
    </Cell>
    <Cell name="Hint">
      <MarkdownEditor
        label="Changelog entry"
        rows={3}
        hint="⌘B and ⌘I wrap the selection."
      />
    </Cell>
    <Cell name="Invalid">
      <MarkdownEditor
        label="Changelog entry"
        rows={3}
        defaultValue="tbd"
        error="Say what changed."
      />
    </Cell>
    <Cell name="Disabled">
      <MarkdownEditor
        label="Changelog entry"
        rows={3}
        defaultValue="**Fixed:** retries."
        disabled
      />
    </Cell>
    <Cell name="Read-only">
      <MarkdownEditor
        label="Changelog entry"
        rows={3}
        defaultValue="**Fixed:** retries."
        readonly
      />
    </Cell>
  </Stack>
)

/* ---- SignaturePad ---- */

export function SignaturePadBasic() {
  const signature = state<SignatureValue | null>(null)
  return (
    <Stack gap="related">
      <SignaturePad
        label="Signature"
        value={signature}
      />
      <Text subtle>
        {signature.value
          ? `Signed: ${signature.value.method}`
          : 'Not signed yet'}
      </Text>
    </Stack>
  )
}

export const SignaturePadTyped = () => (
  <SignaturePad
    label="Signature"
    defaultValue={{
      method: 'typed',
      text: 'Mara Lindqvist',
      svg: '',
    }}
  />
)
