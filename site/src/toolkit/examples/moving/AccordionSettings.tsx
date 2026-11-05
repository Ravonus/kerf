import {
  Accordion,
  Input,
  Stack,
  Switch,
} from '@weft-js/warp'

export const AccordionSettings = () => (
  <Accordion
    variant="line"
    defaultOpen={['general']}
    items={[
      {
        value: 'general',
        title: 'General',
        content: (
          <Input
            label="Project name"
            defaultValue="storefront"
          />
        ),
      },
      {
        value: 'build',
        title: 'Build',
        content: (
          <Stack gap="related">
            <Input
              label="Build command"
              defaultValue="npm run build"
            />
            <Switch defaultChecked>
              Cache dependencies
            </Switch>
          </Stack>
        ),
      },
      {
        value: 'alerts',
        title: 'Alerts',
        content: (
          <Switch>Tell me when a deploy fails</Switch>
        ),
      },
    ]}
  />
)
