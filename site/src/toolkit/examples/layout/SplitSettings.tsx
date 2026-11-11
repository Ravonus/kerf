import { state } from '@kerf/core'
import {
  Button,
  Heading,
  Input,
  Nav,
  Row,
  Split,
  Stack,
  Text,
} from '@kerf/veneer'
import { SECTIONS } from './shared'

export function SplitSettings() {
  const section = state('General')
  const pick = (e: Event, name: string) => {
    e.preventDefault()
    section.value = name
  }
  return (
    <Split
      width="nav"
      gap="section"
    >
      <Nav
        label="Project settings"
        axis="y"
      >
        {SECTIONS.map((name) => (
          <a
            key={name}
            href={`#${name}`}
            aria-current={
              section.value === name ? 'page' : undefined
            }
            onClick={(e: Event) => pick(e, name)}
          >
            {name}
          </a>
        ))}
      </Nav>
      <Stack gap="group">
        <Stack gap="hair">
          <Heading level={3}>{section.value}</Heading>
          <Text subtle>Settings for storefront.</Text>
        </Stack>
        <Input
          label="Project name"
          defaultValue="storefront"
        />
        <Input
          label="Production branch"
          defaultValue="main"
        />
        <Row
          justify="end"
          gap="tight"
        >
          <Button
            emphasis="ghost"
            tone="neutral"
          >
            Cancel
          </Button>
          <Button>Save changes</Button>
        </Row>
      </Stack>
    </Split>
  )
}
