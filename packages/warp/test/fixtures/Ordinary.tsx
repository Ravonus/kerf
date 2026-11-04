import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Grid,
  Heading,
  Input,
  Kbd,
  Link,
  Progress,
  Radio,
  Row,
  Search,
  Segmented,
  Select,
  Skeleton,
  Slider,
  Split,
  Spinner,
  Stack,
  Switch,
  Table,
  Tabs,
  Tag,
  Text,
  Textarea,
} from '../../src/index'

const rows = [
  { id: 1, name: 'Ada', delta: 'up 4%' },
  { id: 2, name: 'Grace', delta: 'down 2%' },
]

/** A page of ordinary components, in the states a server renders. */
export function Ordinary() {
  return (
    <Stack gap="section">
      <Heading level={1}>Everything</Heading>
      <Text role="lede" subtle>
        Some words, and a <Link href="/x">link</Link>.
      </Text>
      <Split>
        <Stack>
          <Input label="Name" hint="As on your card" />
          <Input label="Filled" value="Ada" error="Too short" />
          <Input label="Float" variant="floating" />
          <Search label="Find" />
          <Textarea label="Notes" />
          <Textarea label="Notes filled" value="Hello" counter />
          <Select
            label="Status"
            options={[
              { value: 'a', label: 'Open' },
              { value: 'b', label: 'Shut' },
            ]}
            value="b"
          />
          <Select label="Empty" placeholder="Choose" options={[{ value: 'a', label: 'Open' }]} />
          <Slider label="Volume" value={3} min={0} max={10} />
        </Stack>
        <Stack>
          <Checkbox hint="Read them">
            I agree to the <a href="/terms">terms</a>
          </Checkbox>
          <Checkbox checked={true} error="Needed">
            Ticked
          </Checkbox>
          <Radio name="r" checked={true}>
            One
          </Radio>
          <Radio name="r" hint="Two is more">
            Two
          </Radio>
          <Switch checked={true} hint="Now">
            On
          </Switch>
          <Switch size="sm">Off</Switch>
          <Segmented
            label="View"
            value="a"
            onChange={() => {}}
            options={[
              { value: 'a', label: 'List' },
              { value: 'b', label: 'Board' },
            ]}
          />
        </Stack>
      </Split>
      <Row wrap>
        <Button>Solid</Button>
        <Button emphasis="soft">Soft</Button>
        <Button emphasis="ghost">Ghost</Button>
        <Button emphasis="frame">Frame</Button>
        <Button emphasis="frame" tone="critical">
          Frame
        </Button>
        <Button disabled>Off</Button>
        <Chip>Chip</Chip>
        <Tag>Tag</Tag>
        <Badge>New</Badge>
        <Kbd>K</Kbd>
        <Spinner />
      </Row>
      <Grid min="sm">
        <Card eyebrow="Eyebrow" title="Title">
          Body
        </Card>
        <Card href="/card" title="Linked">
          Body
        </Card>
        <Alert tone="caution" title="Careful">
          Said
        </Alert>
      </Grid>
      <Tabs
        label="Pick"
        value="a"
        onChange={() => {}}
        options={[
          { value: 'a', label: 'First' },
          { value: 'b', label: 'Second' },
        ]}
      >
        {(v: string) => <p>Panel {v}</p>}
      </Tabs>
      <Accordion
        defaultOpen={['a']}
        items={[
          { value: 'a', title: 'Open', content: 'Shown' },
          { value: 'b', title: 'Shut', content: 'Hidden' },
        ]}
      />
      <Table
        caption="People"
        rows={rows}
        columns={[
          { id: 'name', header: 'Name', cell: (r: any) => r.name, sort: true },
          { id: 'delta', header: 'Change', cell: (r: any) => r.delta },
        ]}
      />
      <Progress value={40} label="Loading" />
      <Skeleton />
    </Stack>
  )
}
