import { Text } from '@weft-js/warp'

export const TextPlay = (p: {
  children: string
  role: 'body' | 'display' | 'title' | 'heading' | 'label' | 'caption' | 'eyebrow' | 'code'
  subtle: boolean
  faint: boolean
  tone: 'none' | 'accent' | 'positive' | 'caution' | 'critical' | 'info'
}) => (
  <Text
    role={p.role}
    subtle={p.subtle}
    faint={p.faint}
    tone={p.tone === 'none' ? undefined : p.tone}
  >
    {p.children}
  </Text>
)
