import { state } from '@weft-js/core'
import { Prompt, Stack, Text } from '@weft-js/warp'
import type { PromptFile } from '@weft-js/warp'
import { COMMANDS, CONTEXT, MENTIONS, MODELS } from '../../world'

export function PromptComposer() {
  const sent = state('')
  const files = state<PromptFile[]>([])
  const web = state(false)
  return (
    <Stack gap="related">
      <Text role="caption" subtle>
        {sent.value ? `Sent: ${sent.value}` : 'Type / for commands or @ for people.'}
      </Text>
      <Prompt
        placeholder="Ask about a deploy"
        tools={['attach', 'slash', 'web']}
        models={MODELS}
        model="swift"
        commands={COMMANDS}
        mentions={MENTIONS}
        context={CONTEXT}
        files={files.value}
        web={web.value}
        onWebChange={(on) => (web.value = on)}
        onAttach={(list) =>
          (files.value = [...files.value, ...list.map((f) => ({ id: f.name, name: f.name }))])
        }
        onRemoveFile={(id) => (files.value = files.value.filter((f) => f.id !== id))}
        onSubmit={(text) => (sent.value = text)}
      />
    </Stack>
  )
}
