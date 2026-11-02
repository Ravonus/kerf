import { Snippet, Tabs } from '@weft/warp'
import { state } from 'weft'

const MANAGERS = [{ value: 'npm', label: 'npm' }, { value: 'pnpm', label: 'pnpm' }, { value: 'bun', label: 'bun' }] as const
const COMMAND = { npm: 'npm install @weft/warp', pnpm: 'pnpm add @weft/warp', bun: 'bun add @weft/warp' }

/* @weft visible */
/** The install line, for the reader's package manager. */
export function Install() {
  const manager = state<'npm' | 'pnpm' | 'bun'>('npm')
  return (
    <div data-site="install">
      <Tabs label="Package manager" value={manager.value} onChange={v => (manager.value = v)} options={[...MANAGERS]} variant="pill">{() => <Snippet code={COMMAND[manager.value]} />}</Tabs>
    </div>
  )
}
