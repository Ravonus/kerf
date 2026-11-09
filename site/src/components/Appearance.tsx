import { getDial, getPalette, Icon, setDial, setPalette, Popover, Segmented } from '@weft-js/warp'
import { onMount, state } from '@weft-js/core'
import { shownExpression } from '../lib/dial'
import { PALETTES } from '../lib/palettes'

type Theme = 'auto' | 'light' | 'dark'
type Stop = 'quiet' | 'balanced' | 'vivid'
type Motion = 'auto' | 'full' | 'reduce'

/** Warp's dials as a menu: every control in it writes one attribute on the root, and the page follows from tokens. */
export function Appearance() {
  const theme = state<Theme>('auto')
  const expression = state<Stop>(shownExpression())
  const motion = state<Motion>('auto')
  onMount(() => {
    theme.value = getDial('theme')
    expression.value = getDial('expression')
    motion.value = getDial('motion')
  })
  return (
    <Popover
      align="end"
      label={<Icon name="palette" />}
      title="Appearance"
      trigger={{ emphasis: 'ghost', tone: 'neutral', size: 'sm', 'aria-label': 'Appearance' }}
    >
      <div data-site="dials">
        <div data-part="row">
          <span>Theme</span>
          <Segmented
            size="sm"
            label="Theme"
            value={theme.value}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => {
              theme.value = v
              setDial('theme', v, { persist: true })
            }}
          />
        </div>
        <div data-part="row" data-dial="expression">
          <span>Expression</span>
          <Segmented
            size="sm"
            label="Expression"
            value={expression.value}
            options={[
              { value: 'quiet', label: 'Quiet' },
              { value: 'balanced', label: 'Balanced' },
              { value: 'vivid', label: 'Vivid' },
            ]}
            onChange={(v) => {
              expression.value = v
              setDial('expression', v, { persist: true })
            }}
          />
        </div>
        <div data-part="row">
          <span>Motion</span>
          <Segmented
            size="sm"
            label="Motion"
            value={motion.value}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'full', label: 'Full' },
              { value: 'reduce', label: 'Reduced' },
            ]}
            onChange={(v) => {
              motion.value = v
              setDial('motion', v, { persist: true })
            }}
          />
        </div>
        <PaletteRow />
      </div>
    </Popover>
  )
}

/** The site's named themes (src/lib/palettes.ts); "weft" is the default look, so it clears the attribute. */
function PaletteRow() {
  const palette = state('weft')
  onMount(() => {
    const p = getPalette()
    palette.value = p === 'auto' ? 'weft' : p
  })
  return (
    <div data-part="row">
      <span>Palette</span>
      <Segmented
        size="sm"
        label="Palette"
        value={palette.value}
        options={PALETTES.map((p) => ({ value: p.name, label: p.label }))}
        onChange={(v) => {
          palette.value = v
          setPalette(v === 'weft' ? 'auto' : v, { persist: true })
        }}
      />
    </div>
  )
}
