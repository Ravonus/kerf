// The studio's control rows. Each edits one path of the config; an unset path is "auto", veneer's own value.
import { untrack, type State } from '@kerf/core'
import { Button, CompactSelect, Icon, Segmented, Slider } from '@kerf/veneer'
import { getIn, setIn, type StudioConfig } from '../../lib/studio'

export type Cfg = State<StudioConfig>
export const edit = (cfg: Cfg, path: readonly string[], v: unknown) =>
  (cfg.value = setIn(cfg.value, path, v))

/** A small "back to auto" button, shown only while the path is set. */
function Reset(props: { cfg: Cfg; path: readonly string[]; label: string }) {
  return (
    <>
      {getIn(props.cfg.value, props.path) !== undefined && (
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          aria-label={`Reset ${props.label}`}
          title="Back to auto"
          onClick={() => edit(props.cfg, props.path, undefined)}
        >
          <Icon name="undo" />
        </Button>
      )}
    </>
  )
}

const HEX = /^#[0-9a-f]{6}$/i

/** A colour: the native picker and its hex, both editable. */
export function ColourRow(props: {
  cfg: Cfg
  path: readonly string[]
  label: string
  /** Shown while unset. */
  auto: string
}) {
  const value = () => getIn(props.cfg.value, props.path) as string | undefined
  const shown = () => value() ?? props.auto
  return (
    <div data-studio="row" data-set={value() ? '' : undefined}>
      <span data-studio="label">{props.label}</span>
      <span data-studio="colour">
        <input
          type="color"
          aria-label={`${props.label} colour`}
          value={shown()}
          onInput={(e) => edit(props.cfg, props.path, e.currentTarget.value)}
        />
        <input
          data-studio="hex"
          aria-label={`${props.label} hex`}
          value={value() ?? ''}
          placeholder="auto"
          spellcheck={false}
          onChange={(e) => {
            const v = e.currentTarget.value.trim()
            if (v === '' || HEX.test(v)) edit(props.cfg, props.path, v.toLowerCase() || undefined)
            else e.currentTarget.value = value() ?? ''
          }}
        />
      </span>
      <Reset cfg={props.cfg} path={props.path} label={props.label} />
    </div>
  )
}

/** A number on a slider; `unit` is shown after it, and unset reads "auto". */
export function NumberRow(props: {
  cfg: Cfg
  path: readonly string[]
  label: string
  min: number
  max: number
  step?: number
  /** Where the thumb rests while unset: veneer's own value at the balanced stop. */
  auto: number
  unit?: string
}) {
  const value = () => getIn(props.cfg.value, props.path) as number | undefined
  return (
    <div data-studio="row" data-set={value() === undefined ? undefined : ''}>
      <Slider
        label={props.label}
        value={value() ?? props.auto}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        format={(v) => (value() === undefined ? 'auto' : `${v}${props.unit ?? ''}`)}
        onChange={(v) => edit(props.cfg, props.path, v)}
      />
      <Reset cfg={props.cfg} path={props.path} label={props.label} />
    </div>
  )
}

/** One of a few values, or auto. */
export function PickRow(props: {
  cfg: Cfg
  path: readonly string[]
  label: string
  options: { value: string; label: string }[]
}) {
  return (
    <div data-studio="row">
      <span data-studio="label">{props.label}</span>
      <CompactSelect
        label={props.label}
        value={(getIn(props.cfg.value, props.path) as string | undefined) ?? 'auto'}
        options={[{ value: 'auto', label: 'Auto' }, ...props.options]}
        onValueChange={(v) => edit(props.cfg, props.path, v === 'auto' ? undefined : v)}
      />
    </div>
  )
}

/** A dial: a segmented choice whose first option is the default, kept out of the config. */
export function DialRow(props: {
  cfg: Cfg
  dial: 'theme' | 'expression' | 'density' | 'flair'
  label: string
  options: { value: string; label: string }[]
}) {
  // a row's dial and options never change
  const [path, first] = untrack(() => [['dials', props.dial], props.options[0]!.value] as const)
  return (
    <div data-studio="row" data-dial="">
      <span data-studio="label">{props.label}</span>
      <Segmented
        size="sm"
        label={props.label}
        value={(getIn(props.cfg.value, path) as string | undefined) ?? first}
        options={props.options}
        onChange={(v) => edit(props.cfg, path, v === first ? undefined : v)}
      />
    </div>
  )
}
