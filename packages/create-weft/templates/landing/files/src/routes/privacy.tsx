import type { Meta } from '@weft-js/start'
import { Center, Heading, Stack, Text } from '@weft-js/warp'

export const meta: Meta = { title: 'Privacy', description: 'What Emberline collects, why, and how to have it removed.' }
export const prerender = true

const sections = [
  { title: 'What we collect', body: 'The waitlist stores your email address and the time you joined. This site sets no cookies and runs no analytics.' },
  { title: 'Why we collect it', body: 'We use your address to tell you when your place in line comes up, and for nothing else. We send no newsletters.' },
  { title: 'Who sees it', body: 'Only the people who run Emberline, and the database host that stores it on our behalf. We don\'t sell or share addresses.' },
  { title: 'How long we keep it', body: 'Until the waitlist closes or you ask us to remove it, whichever comes first.' },
  { title: 'Removing your address', body: 'Reply to any message from us and we\'ll delete your address within seven days.' },
]

export default function Privacy() {
  return (
    <section class="page-head">
      <Center max="measure" gutter>
        <Stack gap="section">
          <Stack gap="related">
            <Heading level={1} role="display">Privacy</Heading>
            <Text subtle>Last updated 1 November 2026</Text>
          </Stack>
          {sections.map(section => (
            <Stack as="section" gap="related" key={section.title}>
              <Heading level={2} role="title">{section.title}</Heading>
              <Text>{section.body}</Text>
            </Stack>
          ))}
        </Stack>
      </Center>
    </section>
  )
}
