// Every markup branch a component has (emphasis, icon, loading, open, sides, tones…), for test/markup.test.tsx: the
// server HTML and the client DOM after mount are pinned, so a size change can't move a part, an attribute or an
// ARIA wire without the snapshot saying so.
import { state } from '@weft-js/core'
import { Alert } from '../../src/Alert'
import { Badge } from '../../src/Badge'
import { Center, Cover, Frame, Grid, Inset, Row, Spacer, Split, Stack } from '../../src/Layout'
import { Link } from '../../src/Link'
import { Heading, Text } from '../../src/Type'
import { Button } from '../../src/Button'
import { Card } from '../../src/Card'
import { Checkbox, Segmented, Switch } from '../../src/Choice'
import { Chip } from '../../src/Chip'
import { Drawer } from '../../src/Drawer'
import { Input, Search, Textarea } from '../../src/Field'
import { Icon } from '../../src/Icon'
import { Modal } from '../../src/Modal'
import { Popover } from '../../src/Popover'
import { Progress } from '../../src/Progress'
import { Select } from '../../src/Select'
import { Skeleton } from '../../src/Skeleton'
import { Shape } from '../../src/Shape'
import { Tabs } from '../../src/Tabs'
import { Tag } from '../../src/Tag'
import { Toaster, toast } from '../../src/Toast'
import { Toggle } from '../../src/Toggle'

export function Layouts() {
  return (
    <div>
      <Stack>default</Stack>
      <Stack as="ul" gap="tight" align="center" divided>
        <li>a</li>
      </Stack>
      <Row>default</Row>
      <Row
        as="nav"
        gap="group"
        justify="between"
        align="baseline"
        wrap={false}
        reflow="tablet"
        aria-label="Pages"
      >
        <Spacer />
      </Row>
      <Grid min="xs" cols={4} gap="section">
        x
      </Grid>
      <Split side="end" width="half" at="desktop">
        <div />
        <div />
      </Split>
      <Center max="measure" gutter intrinsic>
        x
      </Center>
      <Cover gap="tight" min="fill">
        x
      </Cover>
      <Frame ratio="21:9">x</Frame>
      <Inset pad="section">x</Inset>
    </div>
  )
}
export function Type() {
  return (
    <div>
      {([1, 2, 3, 4, 5, 6] as const).map((level) => (
        <Heading key={level} level={level}>
          h
        </Heading>
      ))}
      <Heading role="display">Default level</Heading>
      <Link href="/a">Link</Link>
      <Link href="/b" subtle external>
        Away
      </Link>
      <Text>Body</Text>
      <Text role="eyebrow" inline>
        Eyebrow
      </Text>
      <Text tone="critical" faint>
        Tone
      </Text>
    </div>
  )
}

export function Buttons() {
  return (
    <div>
      <Button>Solid</Button>
      <Button emphasis="soft" tone="accent">
        Soft
      </Button>
      <Button emphasis="outline" size="sm">
        Outline
      </Button>
      <Button emphasis="ghost" size="lg" full>
        Ghost
      </Button>
      <Button emphasis="link">Link</Button>
      <Button emphasis="frame">Frame</Button>
      <Button emphasis="frame" fill icon="check">
        Frame fill
      </Button>
      <Button icon="search">With icon</Button>
      <Button
        emphasis="ghost"
        tone="neutral"
        icon="x"
        label="Close"
        data-part="close"
        data-close=""
      />
      <Button loading={false}>Can load</Button>
      <Button loading icon="check">
        Loading
      </Button>
      <Button emphasis="outline" loading>
        Outline loading
      </Button>
      <Button type="submit" id="b1" aria-controls="x">
        Submit
      </Button>
    </div>
  )
}
export function Icons() {
  return (
    <div>
      {(
        ['x', 'check', 'search', 'down', 'alert', 'alert-circle', 'info', 'check-circle'] as const
      ).map((n) => (
        <Icon key={n} name={n} />
      ))}
      <Icon name="x" data-part="icon" />
    </div>
  )
}
export function Toggles() {
  return (
    <div>
      <Toggle pressed={false}>Off</Toggle>
      <Toggle pressed icon="check" size="sm">
        On
      </Toggle>
      <Toggle pressed={false} icon="search" label="Search" />
    </div>
  )
}
export function Fields() {
  return (
    <div>
      <Input label="Name" />
      <Input
        label="Email address"
        hint="Never shared."
        icon="search"
        prefix="@"
        suffix=".com"
        clearable
        value="a"
        size="sm"
      />
      <Input
        label="Code"
        error="Required"
        variant="classic"
        appearance="line"
        disabled
        readonly
        size="lg"
        placeholder="X"
      />
      <Search label="Search" />
      <Textarea label="Note" counter={40} rows={4} />
      <Select
        label="Sort"
        placeholder="Pick"
        options={[
          { value: 'a', label: 'A' },
          { group: 'More', options: [{ value: 'b', label: 'B', disabled: true }] },
        ]}
      />
    </div>
  )
}
export function Choices() {
  const v = state<'a' | 'b'>('b')
  return (
    <div>
      <Checkbox>Agree</Checkbox>
      <Checkbox indeterminate hint="Some" error="Pick one">
        Mixed
      </Checkbox>
      <Switch hint="On the go" size="sm" placement="start" checked>
        Wi-Fi
      </Switch>
      <Segmented
        label="View"
        value={v.value}
        onChange={(x) => (v.value = x)}
        size="sm"
        name="view"
        options={[
          { value: 'a', label: 'A', icon: 'check', count: 3 },
          { value: 'b', label: 'B', disabled: true },
        ]}
      />
      <Chip>Plain</Chip>
      <Chip pressed count={4}>
        Pressed
      </Chip>
      <Chip icon="search">Icon</Chip>
    </div>
  )
}
export function Surfaces() {
  return (
    <div>
      <Card title="Static">x</Card>
      <Card eyebrow="E" title="Link" href="/x">
        y
      </Card>
      <Card title="Press" onClick={() => {}}>
        z
      </Card>
      <Card sweep={false}>none</Card>
      <Badge>New</Badge>
      <Badge tone="positive" emphasis="solid" dot srText="unread">
        3
      </Badge>
      <Badge emphasis="outline" count>
        9
      </Badge>
      <Tag>plain</Tag>
      <Tag tone="accent" swatch onRemove={() => {}}>
        fruit
      </Tag>
      <Progress label="Upload" value={40} />
      <Progress label="Wait" />
      <Progress label="Ring" shape="circle" value={70} tone="positive" />
      <Progress label="Ring" shape="circle" showValue={false} />
      <Skeleton />
      <Skeleton shape="circle" width="2rem" height="2rem" />
      <Skeleton lines={2} />
      <Shape kind="text" lines={2} />
      <Shape kind="list" rows={1} label="Loading people" />
      <Shape kind="table" rows={1} cols={2} />
    </div>
  )
}
export function Alerts() {
  return (
    <div>
      {(['info', 'neutral', 'accent', 'positive', 'caution', 'critical'] as const).map((t) => (
        <Alert key={t} tone={t} title={t}>
          Body
        </Alert>
      ))}
      <Alert
        live
        tone="critical"
        title="Failed"
        actions={<Button size="sm">Retry</Button>}
        onDismiss={() => {}}
      >
        Try again.
      </Alert>
      <Alert>Only body</Alert>
    </div>
  )
}
export function Tabbed() {
  const v = state<'a' | 'b'>('a')
  return (
    <div>
      <Tabs
        label="T"
        value={v.value}
        onChange={(x) => (v.value = x)}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
        ]}
      >
        {(x) => <p>{x}</p>}
      </Tabs>
      <Tabs
        label="P"
        variant="pill"
        value={v.value}
        onChange={(x) => (v.value = x)}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      >
        {(x) => <p>{x}</p>}
      </Tabs>
    </div>
  )
}
export function Overlays() {
  const a = state(true),
    b = state(false),
    c = state(true),
    d = state(false)
  return (
    <div>
      <Popover label="Plain">body</Popover>
      <Popover
        label="Titled"
        title="T"
        description="D"
        side="top"
        align="end"
        trigger={{ emphasis: 'soft', icon: 'search', size: 'sm' }}
      >
        body
      </Popover>
      <Modal
        open={a}
        title="Open"
        description="Desc"
        footer={<Button data-close="">OK</Button>}
        size="sm"
        tone="critical"
      >
        x
      </Modal>
      <Modal open={b} title="Alert" alert size="lg">
        y
      </Modal>
      <Drawer open={c} title="Side" description="D" footer={<Button>Go</Button>} side="left">
        z
      </Drawer>
      <Drawer open={d} title="Auto">
        w
      </Drawer>
      <Drawer open={d} title="Bottom" side="bottom">
        v
      </Drawer>
    </div>
  )
}
export function Toasts() {
  return <Toaster />
}
/** Toasts of every shape, shown before <Toasts /> renders (fixed ids: the uid counter stays the component's). */
export function seedToasts() {
  toast.show({ id: 't1', title: 'Saved', tone: 'positive' })
  toast.show({
    id: 't2',
    title: 'Failed',
    description: 'Try later.',
    tone: 'critical',
    action: { label: 'Retry', onClick() {} },
  })
  toast.show({ id: 't3', title: 'Plain', duration: 0 })
}
