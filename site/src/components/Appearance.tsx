import { getDial, Icon, setDial, Popover, Segmented } from '@weft-js/warp'
import { onMount, state } from '@weft-js/core'

type Theme = 'auto' | 'light' | 'dark'
type Stop = 'quiet' | 'balanced' | 'vivid'
type Motion = 'auto' | 'full' | 'reduce'

/** warp's dials as a menu: every control in it writes one attribute on the root, and the page follows from tokens. */
export function Appearance() {
  const theme = state<Theme>('auto')
  const expression = state<Stop>('balanced')
  const motion = state<Motion>('auto')
  onMount(() => {
    theme.value = getDial('theme')
    expression.value = getDial('expression')
    motion.value = getDial('motion')
  })
  return (
    <Popover align="end" label={<Icon name="palette" />} title="Appearance" trigger={{ emphasis: 'ghost', tone: 'neutral', size: 'sm', 'aria-label': 'Appearance' }}>
      <div data-site="dials">
        <div data-part="row"><span>Theme</span><Segmented size="sm" label="Theme" value={theme.value} options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} onChange={v => { theme.value = v; setDial('theme', v, { persist: true }) }} /></div>
        <div data-part="row"><span>Expression</span><Segmented size="sm" label="Expression" value={expression.value} options={[{ value: 'quiet', label: 'Quiet' }, { value: 'balanced', label: 'Balanced' }, { value: 'vivid', label: 'Vivid' }]} onChange={v => { expression.value = v; setDial('expression', v, { persist: true }) }} /></div>
        <div data-part="row"><span>Motion</span><Segmented size="sm" label="Motion" value={motion.value} options={[{ value: 'auto', label: 'Auto' }, { value: 'full', label: 'Full' }, { value: 'reduce', label: 'Reduced' }]} onChange={v => { motion.value = v; setDial('motion', v, { persist: true }) }} /></div>
      </div>
    </Popover>
  )
}
