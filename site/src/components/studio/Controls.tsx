// The studio's guided controls, a section per family of tokens. Everything they set is a `warp()` key; what they
// can't reach, the parts and tokens editors and the JSON can.
import { state } from '@weft-js/core'
import { Button, Icon } from '@weft-js/warp'
import { ColourRow, DialRow, edit, NumberRow, PickRow, type Cfg } from './rows'

const FONTS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Space Grotesk', label: 'Space Grotesk' },
  { value: 'IBM Plex Mono', label: 'IBM Plex Mono' },
  { value: 'system-ui, -apple-system, "Segoe UI", sans-serif', label: 'System' },
  { value: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif', label: 'Rounded' },
  { value: 'Georgia, "Iowan Old Style", "Times New Roman", serif', label: 'Serif' },
  { value: 'ui-monospace, "SF Mono", Menlo, monospace', label: 'Monospace' },
]
const EASES = [
  { value: 'cubic-bezier(0.2, 0, 0, 1)', label: 'Smooth' },
  { value: 'cubic-bezier(0.34, 1.56, 0.64, 1)', label: 'Bouncy' },
  { value: 'linear', label: 'Linear' },
  { value: 'cubic-bezier(0.7, 0, 0.3, 1)', label: 'Sharp' },
]

function Group(props: { title: string; children?: unknown }) {
  return (
    <section data-studio="group">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  )
}

/** Named colours: each becomes --warp-color-<name>, a tone (tone="name") and a value parts can use. */
function NamedColours(props: { cfg: Cfg }) {
  const name = state('')
  const names = () => Object.keys(props.cfg.value.colors ?? {})
  const add = () => {
    const n = name.value.trim().toLowerCase()
    if (!n) return
    edit(props.cfg, ['colors', n], '#7048e8')
    name.value = ''
  }
  return (
    <>
      {names().map((n) => (
        <ColourRow key={n} cfg={props.cfg} path={['colors', n]} label={n} auto="#000000" />
      ))}
      <form
        data-studio="row"
        data-add=""
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          aria-label="New colour name"
          placeholder="name a colour (brand)"
          value={name.value}
          onInput={(e) => (name.value = e.currentTarget.value)}
        />
        <Button type="submit" size="sm" emphasis="soft" tone="neutral" icon="plus">
          Add
        </Button>
      </form>
    </>
  )
}

export function ColourControls(props: { cfg: Cfg }) {
  return (
    <Group title="Colour">
      <ColourRow cfg={props.cfg} path={['seed', 'accent']} label="Accent" auto="#2f9e6a" />
      <ColourRow cfg={props.cfg} path={['seed', 'neutral']} label="Greys tint" auto="#808080" />
      <NamedColours cfg={props.cfg} />
    </Group>
  )
}

export function DialControls(props: { cfg: Cfg }) {
  const c = props.cfg
  return (
    <Group title="Character">
      <DialRow
        cfg={c}
        dial="theme"
        label="Mode"
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
      <DialRow
        cfg={c}
        dial="expression"
        label="Expression"
        options={[
          { value: 'balanced', label: 'Balanced' },
          { value: 'quiet', label: 'Quiet' },
          { value: 'vivid', label: 'Vivid' },
        ]}
      />
      <DialRow
        cfg={c}
        dial="density"
        label="Density"
        options={[
          { value: 'cozy', label: 'Cozy' },
          { value: 'compact', label: 'Compact' },
          { value: 'comfortable', label: 'Roomy' },
        ]}
      />
      <DialRow
        cfg={c}
        dial="flair"
        label="Sweep"
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'sweep', label: 'All' },
          { value: 'none', label: 'None' },
        ]}
      />
    </Group>
  )
}

export function ShapeControls(props: { cfg: Cfg }) {
  const c = props.cfg
  return (
    <Group title="Shape">
      <NumberRow
        cfg={c}
        path={['system', 'radius', 'control']}
        label="Controls"
        min={0}
        max={24}
        auto={4}
        unit="px"
      />
      <NumberRow
        cfg={c}
        path={['system', 'radius', 'surface']}
        label="Surfaces"
        min={0}
        max={32}
        auto={5}
        unit="px"
      />
      <NumberRow
        cfg={c}
        path={['system', 'radius', 'mark']}
        label="Checkboxes"
        min={0}
        max={10}
        step={0.5}
        auto={2.5}
        unit="px"
      />
      <NumberRow
        cfg={c}
        path={['system', 'border', 'hairline']}
        label="Hairline"
        min={0.5}
        max={3}
        step={0.5}
        auto={1}
        unit="px"
      />
      <NumberRow
        cfg={c}
        path={['system', 'border', 'emphasis']}
        label="Emphasis"
        min={1}
        max={4}
        step={0.5}
        auto={1.5}
        unit="px"
      />
    </Group>
  )
}

export function TypeControls(props: { cfg: Cfg }) {
  const c = props.cfg
  return (
    <Group title="Type">
      <PickRow cfg={c} path={['system', 'font', 'sans']} label="Body" options={FONTS} />
      <PickRow cfg={c} path={['system', 'font', 'display']} label="Headings" options={FONTS} />
      <PickRow cfg={c} path={['system', 'font', 'mono']} label="Code" options={FONTS} />
      <NumberRow
        cfg={c}
        path={['system', 'text', 'body', 'size']}
        label="Body size"
        min={12}
        max={20}
        auto={14}
        unit="px"
      />
      <NumberRow
        cfg={c}
        path={['system', 'text', 'heading', 'weight']}
        label="Head weight"
        min={300}
        max={800}
        step={50}
        auto={500}
      />
      <PickRow
        cfg={c}
        path={['system', 'text', 'button', 'case']}
        label="Button case"
        options={[
          { value: 'none', label: 'As written' },
          { value: 'uppercase', label: 'Uppercase' },
        ]}
      />
    </Group>
  )
}

export function SpaceControls(props: { cfg: Cfg }) {
  const c = props.cfg
  return (
    <Group title="Space">
      <NumberRow
        cfg={c}
        path={['system', 'space', 'related']}
        label="Small gap"
        min={2}
        max={16}
        auto={8}
        unit="px"
      />
      <NumberRow
        cfg={c}
        path={['system', 'space', 'group']}
        label="Group gap"
        min={6}
        max={40}
        auto={14}
        unit="px"
      />
      <NumberRow
        cfg={c}
        path={['system', 'pad', 'control']}
        label="Control pad"
        min={4}
        max={28}
        auto={10}
        unit="px"
      />
      <NumberRow
        cfg={c}
        path={['system', 'pad', 'surface']}
        label="Surface pad"
        min={8}
        max={48}
        auto={17}
        unit="px"
      />
      <NumberRow
        cfg={c}
        path={['system', 'control', 'md']}
        label="Height"
        min={24}
        max={56}
        auto={34}
        unit="px"
      />
    </Group>
  )
}

export function MotionControls(props: { cfg: Cfg }) {
  const c = props.cfg
  return (
    <Group title="Motion">
      <NumberRow
        cfg={c}
        path={['system', 'duration', 'fast']}
        label="Hover"
        min={0}
        max={400}
        step={10}
        auto={120}
        unit="ms"
      />
      <NumberRow
        cfg={c}
        path={['system', 'duration', 'base']}
        label="Popovers"
        min={0}
        max={600}
        step={10}
        auto={200}
        unit="ms"
      />
      <NumberRow
        cfg={c}
        path={['system', 'duration', 'slow']}
        label="Dialogs"
        min={0}
        max={900}
        step={10}
        auto={320}
        unit="ms"
      />
      <PickRow cfg={c} path={['system', 'ease', 'out']} label="Easing" options={EASES} />
      <p data-studio="hint">
        <Icon name="sparkle" /> Hover the buttons and fields in the preview to feel it.
      </p>
    </Group>
  )
}
