import { flush, render } from '@kerf/core/test'
import { AgentPlan } from '../../src/agent/AgentPlan'
import { Checkpoint } from '../../src/agent/Checkpoint'
import { ContextMeter } from '../../src/agent/ContextMeter'
import { TraceViewer } from '../../src/agent/TraceViewer'
import { wait } from '../timers.mjs'
import { button, key } from './support'

export function registerCheckpointRestoresContextMeterLevelsAnd() {
  test('Checkpoint restores; ContextMeter levels and /compact', () => {
    const restore = vi.fn(),
      compact = vi.fn()
    const { container: c } = render(() => (
      <>
        <Checkpoint label="Before" onRestore={restore} />
        <ContextMeter used={10} limit={100} />
        <ContextMeter used={80} limit={100} onCompact={compact} />
        <ContextMeter used={95} limit={100} />
      </>
    ))
    button(c, 'Restore').click()
    expect(restore).toHaveBeenCalled()
    const m = [...c.querySelectorAll<HTMLElement>('[data-scope="context-meter"]')]
    expect(m.map((x) => x.dataset.level)).toEqual([undefined, 'high', 'full'])
    expect(m[1]!.getAttribute('role')).toBe('meter')
    expect(m[1]!.getAttribute('aria-valuenow')).toBe('80')
    button(c, '/compact').click()
    expect(compact).toHaveBeenCalled()
  })
  test('AgentPlan shows each state, counts done, and removes from the queue', () => {
    const gone: string[] = []
    const { container: c } = render(() => (
      <AgentPlan
        steps={[
          { id: 'a', title: 'A', state: 'done' },
          { id: 'b', title: 'B', state: 'running' },
          { id: 'c', title: 'C', state: 'blocked' },
          { id: 'd', title: 'D', state: 'pending' },
        ]}
        queue={[{ id: 'q', text: 'later' }]}
        onRemoveQueued={(id) => gone.push(id)}
      />
    ))
    expect([...c.querySelectorAll('li')].map((l) => l.getAttribute('data-state'))).toEqual([
      'done',
      'running',
      'blocked',
      'pending',
    ])
    expect(c.querySelector('[data-part="header"]')!.textContent).toContain('1/4')
    expect(c.textContent).toContain('Waiting for your approval')
    expect(c.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('25')
    button(c, 'Remove from queue: later').click()
    expect(gone).toEqual(['q'])
  })
}

export function registerTraceViewerIsATreegridOne() {
  test('TraceViewer is a treegrid: one tab stop, arrows move and fold, Enter toggles', async () => {
    const spans = [
      {
        id: 'r',
        name: 'turn',
        start: 0,
        ms: 1000,
        tokens: 2000,
        cost: 0.01,
        children: [
          { id: 'a', name: 'a', start: 0, ms: 500 },
          { id: 'b', name: 'b', start: 500, ms: 500 },
        ],
      },
    ]
    const { container: c } = render(() => <TraceViewer spans={spans} />)
    const rows = () => [...c.querySelectorAll<HTMLElement>('[role="row"]')]
    const grid = c.querySelector('[role="treegrid"]')!
    expect(rows().length).toBe(3)
    expect(rows().filter((r) => r.tabIndex === 0).length).toBe(1)
    expect(rows()[0]!.getAttribute('aria-expanded')).toBe('true')
    expect(rows()[1]!.getAttribute('aria-level')).toBe('2')
    expect(rows()[0]!.getAttribute('aria-label')).toBe('turn, 1.0 s · 2k tok · $0.010')
    rows()[0]!.focus()
    key(rows()[0]!, 'ArrowDown')
    await flush()
    await wait(0)
    expect(document.activeElement).toBe(rows()[1])
    key(grid, 'ArrowLeft')
    await flush()
    await wait(0)
    expect(document.activeElement).toBe(rows()[0])
    key(rows()[0]!, 'ArrowLeft')
    await flush()
    expect(rows().length).toBe(1)
    expect(rows()[0]!.getAttribute('aria-expanded')).toBe('false')
    key(rows()[0]!, 'Enter')
    await flush()
    expect(rows().length).toBe(3)
  })
}
