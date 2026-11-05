import { state } from '@weft-js/core'
import { Stack, Segmented, CodeBlock } from '@weft-js/warp'
import { WAYS, STACKS } from './code-data'

export function CodeBlockChooser() {
  const way = state('ts')
  return (
    <Stack gap="related">
      <Segmented
        label="How to deploy"
        size="sm"
        value={way.value}
        onChange={(v) => (way.value = v)}
        options={WAYS}
      />
      {way.value === 'ts' && <CodeBlock code={STACKS.ts} language="ts" />}
      {way.value === 'sh' && <CodeBlock code={STACKS.sh} language="sh" />}
      {way.value === 'json' && <CodeBlock code={STACKS.json} language="json" />}
    </Stack>
  )
}
