import { state } from '@weft-js/core'
import {
  Button,
  CodeBlock,
  Grid,
  MentionsInput,
  RichTextEditor,
  Row,
  Stack,
  Text,
} from '@weft-js/warp'
import { Cell } from '../../world'
import {
  MENTIONS,
  matching,
  MEMBERS,
} from './json-key-value'

export function MentionsInputComment() {
  const text = state(
    'Can @[Jun Tanaka](user:jun) look at ' +
      '#[mobile-bff](project:mobile-bff) ' +
      'before the release? ',
  )
  const said = state<string[]>([])
  const post = (e: Event) => {
    e.preventDefault()
    said.value = [...said.value, text.value]
    text.value = ''
  }
  return (
    <Stack
      as="form"
      gap="related"
      onSubmit={post}
    >
      <MentionsInput
        label="Comment"
        triggers={MENTIONS}
        value={text}
      />
      <Row justify="end">
        <Button type="submit">Comment</Button>
      </Row>
      {said.value.map((s) => (
        <Text
          key={s}
          role="code"
          subtle
        >
          {s}
        </Text>
      ))}
    </Stack>
  )
}

export const MentionsInputStates = () => (
  <Grid
    cols={3}
    gap="group"
  >
    <Cell name="Empty">
      <MentionsInput
        label="Comment"
        triggers={MENTIONS}
      />
    </Cell>
    <Cell name="Filled">
      <MentionsInput
        label="Comment"
        triggers={MENTIONS}
        defaultValue="Thanks @[Priya Raman](user:priya)!"
      />
    </Cell>
    <Cell name="Hint">
      <MentionsInput
        label="Comment"
        triggers={MENTIONS}
        hint="Type @ to tag someone."
      />
    </Cell>
    <Cell name="Invalid">
      <MentionsInput
        label="Comment"
        triggers={MENTIONS}
        defaultValue="ok"
        error="Say a little more."
      />
    </Cell>
    <Cell name="Disabled">
      <MentionsInput
        label="Comment"
        triggers={MENTIONS}
        defaultValue="Thanks @[Priya Raman](user:priya)!"
        disabled
      />
    </Cell>
    <Cell name="Read-only">
      <MentionsInput
        label="Comment"
        triggers={MENTIONS}
        defaultValue="Thanks @[Priya Raman](user:priya)!"
        readonly
      />
    </Cell>
  </Grid>
)

/* ---- RichTextEditor ---- */

const NOTES =
  '<h2>October release</h2><p>Product images now ' +
  'come from the <strong>edge</strong>, about 40% ' +
  'faster.</p><ul><li>Apple Pay on the last checkout ' +
  'step</li><li>A shorter stale window</li></ul>'

const NOTES_MD =
  '## October release\n\nProduct images now ' +
  'come from the **edge**.\n\n- Apple Pay at checkout' +
  '\n- A shorter stale window\n'

export const people = {
  search: (q: string) =>
    Promise.resolve(matching(MEMBERS, q)),
}

export const RichTextEditorBasic = () => (
  <RichTextEditor
    label="Release notes"
    defaultValue={NOTES}
    mentions={people}
  />
)

export const RichTextEditorBubble = () => (
  <RichTextEditor
    label="Release notes"
    toolbar="bubble"
    defaultValue={
      '<p>Select some of this text to see ' +
      'the toolbar.</p>'
    }
  />
)

export const RichTextEditorLimited = () => (
  <RichTextEditor
    label="Comment"
    marks={['bold', 'italic', 'link']}
    blocks={['ul']}
    placeholder="Leave a comment"
  />
)

export function RichTextEditorMarkdown() {
  const text = state(NOTES_MD)
  return (
    <Stack gap="related">
      <RichTextEditor
        label="Release notes"
        format="markdown"
        value={text}
      />
      <CodeBlock
        code={text.value}
        language="markdown"
      />
    </Stack>
  )
}
