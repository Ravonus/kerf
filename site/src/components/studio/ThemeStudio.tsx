// The theme studio: edit a `veneer()` config, see real components take it, copy it into kerf.config.ts.
import { derived, onMount, state, watch } from '@kerf/core'
import { Button, Tabs } from '@kerf/veneer'
import { compile, configSource, STUDIO_PALETTE, type StudioConfig } from '../../lib/studio'
import { ratio } from '../../lib/contrast'
import { keepConfig, loadConfig, shareLink } from '../../lib/studio-store'
import { JsonPanel, PartsEditor, TokensEditor } from './Advanced'
import {
  ColourControls,
  DialControls,
  MotionControls,
  ShapeControls,
  SpaceControls,
  TypeControls,
} from './Controls'
import type { Cfg } from './rows'
import { Presets, WearIt } from './Presets'
import { Specimen } from './Specimen'
import '../../styles/studio.css'

type Panel = 'guided' | 'parts' | 'json'
const copyText = (text: string) => navigator.clipboard.writeText(text)

/** Accent text on the page and ink on a solid button, measured as the preview draws them. */
function Contrast(props: { stage: () => HTMLElement | undefined; look: string }) {
  const read = state<[string, number][]>([])
  const measure = () => {
    const el = props.stage()
    if (!el) return
    // a token's own text is unresolved (light-dark, calc): an element using it gets the colour the page draws
    const probe = el.appendChild(document.createElement('i'))
    const v = (token: string) => {
      probe.style.color = `var(${token})`
      return getComputedStyle(probe).color
    }
    read.value = [
      ['Text on page', ratio(v('--veneer-color-text'), v('--veneer-color-page'))],
      ['Accent text', ratio(v('--veneer-color-accent-text'), v('--veneer-color-page'))],
      ['Ink on accent', ratio(v('--veneer-color-accent-on-solid'), v('--veneer-color-accent-solid'))],
    ]
    probe.remove()
  }
  onMount(() => void requestAnimationFrame(measure))
  watch(
    () => props.look,
    () => void requestAnimationFrame(measure),
  )
  return (
    <ul data-studio="contrast" aria-label="Contrast">
      {read.value.map(([name, r]) => (
        <li key={name} data-low={r < 4.5 ? '' : undefined}>
          <span>{name}</span>
          <b>{r.toFixed(1)}:1</b>
        </li>
      ))}
    </ul>
  )
}

function Output(props: { cfg: Cfg }) {
  const done = state('')
  const flash = (what: string) => {
    done.value = what
    setTimeout(() => (done.value = ''), 1400)
  }
  return (
    <section data-studio="output" aria-label="Your theme">
      <header>
        <h2>kerf.config.ts</h2>
        <Button
          size="sm"
          emphasis="soft"
          tone="neutral"
          icon={done.value === 'code' ? 'copy-check' : 'copy'}
          onClick={() => void copyText(configSource(props.cfg.value)).then(() => flash('code'))}
        >
          Copy
        </Button>
        <Button
          size="sm"
          emphasis="soft"
          tone="neutral"
          icon={done.value === 'link' ? 'copy-check' : 'link'}
          onClick={() => void copyText(shareLink(props.cfg.value)).then(() => flash('link'))}
        >
          Share link
        </Button>
        <Button
          size="sm"
          emphasis="ghost"
          tone="neutral"
          icon="rotate-ccw"
          onClick={() => (props.cfg.value = {})}
        >
          Start over
        </Button>
      </header>
      <pre data-scope="code">
        <code>{configSource(props.cfg.value)}</code>
      </pre>
    </section>
  )
}

/** The controls: presets, then the guided rows, parts and tokens, or the raw JSON. */
function ControlsPanel(props: { cfg: Cfg }) {
  const cfg = props.cfg
  const panel = state<Panel>('guided')
  return (
    <aside data-studio="controls" aria-label="Theme controls">
      <Presets cfg={cfg} />
      <Tabs
        label="Controls"
        variant="pill"
        value={panel.value}
        onChange={(v) => (panel.value = v)}
        options={[
          { value: 'guided', label: 'Guided' },
          { value: 'parts', label: 'Parts and tokens' },
          { value: 'json', label: 'JSON' },
        ]}
      >
        {(v) =>
          v === 'guided' ? (
            <>
              <ColourControls cfg={cfg} />
              <DialControls cfg={cfg} />
              <ShapeControls cfg={cfg} />
              <TypeControls cfg={cfg} />
              <SpaceControls cfg={cfg} />
              <MotionControls cfg={cfg} />
            </>
          ) : v === 'parts' ? (
            <>
              <PartsEditor cfg={cfg} />
              <TokensEditor cfg={cfg} />
            </>
          ) : (
            <JsonPanel cfg={cfg} />
          )
        }
      </Tabs>
    </aside>
  )
}

/** The theme studio. */
export function ThemeStudio() {
  const cfg = state<StudioConfig>({})
  const built = derived(() => compile(cfg.value))
  let stage: HTMLElement | undefined
  onMount(() => {
    const kept = loadConfig()
    if (kept) cfg.value = kept
    watch(() => cfg.value, keepConfig)
  })
  const dial = (k: keyof NonNullable<StudioConfig['dials']>) => cfg.value.dials?.[k]
  return (
    <div data-site="studio" id="studio">
      <style>{built.value.css}</style>
      <ControlsPanel cfg={cfg} />
      <div data-studio="main">
        <div data-studio="bar">
          <WearIt />
        </div>
        {built.value.error && (
          <p data-studio="problem" role="status">
            <b>{built.value.error.path || 'config'}</b> {built.value.error.message}
          </p>
        )}
        {built.value.contrast.map((c) => (
          <p key={c} data-studio="problem" role="status">
            {c}
          </p>
        ))}
        <div
          ref={(n) => (stage = n)}
          data-studio="stage"
          data-palette={STUDIO_PALETTE}
          data-theme={dial('theme') ?? 'light'}
          data-expression={dial('expression') ?? 'balanced'}
          data-density={dial('density') ?? 'cozy'}
          data-flair={dial('flair')}
        >
          <Contrast
            stage={() => stage}
            look={built.value.css + JSON.stringify(cfg.value.dials ?? {})}
          />
          <Specimen tones={Object.keys(cfg.value.colors ?? {})} />
        </div>
        <Output cfg={cfg} />
      </div>
    </div>
  )
}
