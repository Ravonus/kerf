// The studio's open end: any part in any state, any `--veneer-*` token, and the whole config as JSON.
import { derived, state, untrack, watch } from '@kerf/core'
import { Button, CompactSelect, JsonEditor } from '@kerf/veneer'
import { allParts, propsOf, statesOf, type PartProp } from '@kerf/veneer/theme-parts'
import { compile, configJson, TOKEN_NAMES, type StudioConfig } from '../../lib/studio'
import { edit, type Cfg } from './rows'

const PARTS = new Map(allParts())
const PART_OPTIONS = [...PARTS.keys()].map((p) => ({ value: p, label: p }))
const HINT: Record<PartProp['kind'], string> = {
  color: 'a colour name, a veneer colour (accent-text) or #hex',
  length: 'px, or any CSS length',
  space: 'px, or a step: related, group, page',
  radius: 'px, or control, surface, pill, none',
  time: 'ms',
  shadow: 'sm, md, lg, none, or a box-shadow',
  ease: 'in, out, spring, or a cubic-bezier()',
  font: 'sans, display, mono, or a font name',
  plain: 'a CSS value',
}
const num = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v)

/** Every leaf under `node` as a path and its value. */
function leaves(node: unknown, at: string[] = []): [string[], unknown][] {
  if (node === null || typeof node !== 'object') return [[at, node]]
  return Object.entries(node).flatMap(([k, v]) => leaves(v, [...at, k]))
}

function Rules(props: { cfg: Cfg; root: 'parts' | 'tokens' }) {
  const rows = () => leaves(props.cfg.value[props.root] ?? {}).filter(([p]) => p.length)
  return (
    <>
      {rows().length > 0 && (
        <ul data-studio="rules">
          {rows().map(([path, value]) => (
            <li key={path.join('.')}>
              <code>
                {path.join('.')}: {String(value)}
              </code>
              <Button
                emphasis="ghost"
                tone="neutral"
                size="sm"
                icon="x"
                aria-label={`Remove ${path.join('.')}`}
                onClick={() => edit(props.cfg, [props.root, ...path], undefined)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** Pick a part, a state and a property, give it a value: one row of `parts`. */
export function PartsEditor(props: { cfg: Cfg }) {
  const part = state('button')
  const at = state('rest')
  const prop = state('bg')
  const value = state('')
  const spec = () => PARTS.get(part.value)!
  const table = () => propsOf(spec())
  const stateOptions = derived(() => [
    { value: 'rest', label: 'at rest' },
    ...statesOf(spec()).map((s) => ({ value: s, label: s })),
  ])
  const propOptions = derived(() => Object.keys(table()).map((p) => ({ value: p, label: p })))
  const kind = () => table()[prop.value]?.kind ?? 'plain'
  const add = () => {
    if (!value.value.trim()) return
    const path = [
      'parts',
      ...part.value.split('.'),
      ...(at.value === 'rest' ? [] : [at.value]),
      prop.value,
    ]
    edit(props.cfg, path, num(value.value.trim()))
    value.value = ''
  }
  return (
    <section data-studio="group">
      <h3>Parts</h3>
      <p data-studio="hint">Restyle any piece of any component, at rest or in one state.</p>
      <div data-studio="pick">
        <CompactSelect
          label="Part"
          value={part.value}
          searchable
          options={PART_OPTIONS}
          onValueChange={(v) => {
            part.value = v
            if (!statesOf(PARTS.get(v)!).includes(at.value)) at.value = 'rest'
            if (!propsOf(PARTS.get(v)!)[prop.value])
              prop.value = Object.keys(propsOf(PARTS.get(v)!))[0]!
          }}
        />
        <CompactSelect
          label="State"
          value={at.value}
          options={stateOptions.value}
          onValueChange={(v) => (at.value = v)}
        />
        <CompactSelect
          label="Property"
          value={prop.value}
          searchable
          options={propOptions.value}
          onValueChange={(v) => (prop.value = v)}
        />
      </div>
      <form
        data-studio="row"
        data-add=""
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          aria-label="Value"
          placeholder={HINT[kind()]}
          value={value.value}
          onInput={(e) => (value.value = e.currentTarget.value)}
        />
        <Button type="submit" size="sm" emphasis="soft" tone="neutral" icon="plus">
          Add
        </Button>
      </form>
      <Rules cfg={props.cfg} root="parts" />
    </section>
  )
}

/** Any token veneer declares, set to any value: the escape hatch under everything else. */
export function TokensEditor(props: { cfg: Cfg }) {
  const name = state('')
  const value = state('')
  return (
    <section data-studio="group">
      <h3>Tokens</h3>
      <p data-studio="hint">
        Any of veneer's {TOKEN_NAMES.length} tokens. Colours take #rrggbb or oklch().
      </p>
      <datalist id="studio-tokens">
        {TOKEN_NAMES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <form
        data-studio="row"
        data-add=""
        data-token=""
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.value || !value.value) return
          edit(props.cfg, ['tokens', name.value.trim()], value.value.trim())
          name.value = value.value = ''
        }}
      >
        <input
          aria-label="Token"
          list="studio-tokens"
          placeholder="--veneer-…"
          value={name.value}
          onInput={(e) => (name.value = e.currentTarget.value)}
        />
        <input
          aria-label="Token value"
          placeholder="value"
          value={value.value}
          onInput={(e) => (value.value = e.currentTarget.value)}
        />
        <Button type="submit" size="sm" emphasis="soft" tone="neutral" icon="plus">
          Add
        </Button>
      </form>
      <Rules cfg={props.cfg} root="tokens" />
    </section>
  )
}

/** The whole config as JSON: typing applies it as soon as it reads and compiles. */
export function JsonPanel(props: { cfg: Cfg }) {
  const text = state(untrack(() => configJson(props.cfg.value)))
  let mine = false
  watch(
    () => props.cfg.value,
    (c) => {
      if (!mine) text.value = configJson(c)
      mine = false
    },
  )
  const problem = (v: unknown) => {
    const e = compile(v as StudioConfig).error
    return e && `${e.path ? `${e.path}: ` : ''}${e.message}`
  }
  return (
    <JsonEditor
      label="veneer() config"
      value={text.value}
      schema={problem}
      onValueChange={(v) => {
        text.value = v
        try {
          const parsed = JSON.parse(v) as StudioConfig
          if (!compile(parsed).error) {
            mine = true
            props.cfg.value = parsed
          }
        } catch {
          // mid-edit: the editor shows where it stops reading
        }
      }}
    />
  )
}
