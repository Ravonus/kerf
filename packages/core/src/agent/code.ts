import type { Target, Query, Step, CodeOptions } from './types'

const q = (t: Query | Target): string => {
  const s = JSON.stringify
  if (typeof t === 'string')
    return `/* ${t}: no role, label or text identifies it; give it an accessible name */ screen.getByRole('generic')`
  if ('by' in t) {
    if (t.by === 'role')
      return `screen.getByRole(${s(t.role)}${t.name ? `, { name: ${s(t.name)} }` : ''})`
    if (t.by === 'label') return `screen.getByLabelText(${s(t.label)})`
    if (t.by === 'text') return `screen.getByText(${s(t.text)})`
    return `/* @${t.ref}: no role, label or text identifies it; give it an accessible name */ screen.getByRole('generic')`
  }
  if ('role' in t)
    return `screen.getByRole(${s(t.role)}${t.name ? `, { name: ${s(t.name)} }` : ''})`
  if ('label' in t) return `screen.getByLabelText(${s(t.label)})`
  return `screen.getByText(${s(t.text)})`
}

/** The recorded steps as a `@kerf/core/test` test: role/label/text queries, user actions, clock and net, real assertions. */
export function buildCode(steps: Step[], o: CodeOptions = {}) {
  const comp = o.component ?? 'App'
  const used = new Set(['render', 'screen'])
  const body: string[] = []
  let first = true
  let asserts = 0
  const get = (t: Query | Target) => {
    const g = q(t)
    if (!first || g.startsWith('/*')) return g
    first = false
    return `await ${g.replace('screen.getBy', 'screen.findBy')}` // the first query waits for the app to load
  }
  for (const st of steps) {
    if (st.kind === 'act') {
      used.add('user')
      const el = get(st.target)
      const v = JSON.stringify(st.value ?? '')
      if (st.action === 'fill')
        body.push(`await user.clear(${el})`, `await user.type(${q(st.target)}, ${v})`)
      else if (st.action === 'press')
        body.push(
          el.startsWith('await') ? `${el.replace(/^await /, '(await ')}).focus()` : `${el}.focus()`,
          `await user.keyboard(${v})`,
        )
      else if (st.action === 'select') body.push(`await user.selectOptions(${el}, ${v})`)
      else if (st.action === 'type') body.push(`await user.type(${el}, ${v})`)
      else if (st.action === 'check' || st.action === 'uncheck' || st.action === 'click')
        body.push(`await user.click(${el})`)
      else if (st.action === 'dblclick') body.push(`await user.dblClick(${el})`)
      else if (st.action === 'hover') body.push(`await user.hover(${el})`)
      else if (st.action === 'clear') body.push(`await user.clear(${el})`)
      else if (st.action === 'focus') body.push(`${el}.focus()`)
    } else if (st.kind === 'assert') {
      asserts++
      const e = st.expectation
      const el = get(st.target)
      const one = el.startsWith('await') ? `(${el})` : el
      const all = q(st.target).replace('screen.getBy', 'screen.queryAllBy')
      if ('absent' in e)
        body.push(`expect(${q(st.target).replace('screen.getBy', 'screen.queryBy')}).toBeNull()`)
      else if ('count' in e) body.push(`expect(${all}).toHaveLength(${e.count})`)
      else if ('visible' in e) body.push(`expect(${one}).toBeTruthy()`)
      else if ('text' in e)
        body.push(`expect(${one}.textContent).toContain(${JSON.stringify(e.text)})`)
      else if ('exactText' in e)
        body.push(`expect(${one}.textContent?.trim()).toBe(${JSON.stringify(e.exactText)})`)
      else if ('value' in e)
        body.push(`expect((${one} as HTMLInputElement).value).toBe(${JSON.stringify(e.value)})`)
      else if ('checked' in e || 'unchecked' in e)
        body.push(`expect((${one} as HTMLInputElement).checked).toBe(${'checked' in e})`)
      else if ('disabled' in e || 'enabled' in e)
        body.push(`expect((${one} as HTMLButtonElement).disabled).toBe(${'disabled' in e})`)
      else if ('focused' in e) body.push(`expect(document.activeElement).toBe(${one})`)
    } else if (st.kind === 'clock') {
      used.add('clock')
      if (st.op === 'install') body.push('clock.install()')
      else if (st.op === 'advance') body.push(`await clock.advance(${st.ms})`)
    } else if (st.kind === 'net') {
      used.add('net')
      body.push(`await net.${st.op}()`)
    } else if (st.kind === 'note') body.push(`// ${st.text}`)
  }
  return finishCode({ steps, o, comp, used, body, asserts })
}

function finishCode({
  steps,
  o,
  comp,
  used,
  body,
  asserts,
}: {
  steps: Step[]
  o: CodeOptions
  comp: string
  used: Set<string>
  body: string[]
  asserts: number
}) {
  // Paused from the start (`record start` with the clock paused): install before render, like the page did.
  const renderAt = body[0] === 'clock.install()' && steps[0]?.kind === 'clock' ? 1 : 0
  body.splice(renderAt, 0, `render(${comp}${o.props ? `, ${o.props}` : ''})`)
  const lines = [
    `import { expect, test } from 'vitest'`,
    `import { ${[...used].sort().join(', ')} } from '@kerf/core/test'`,
    `import { ${comp} } from ${JSON.stringify(o.from ?? `./${comp}`)}`,
    ...(o.imports ?? []),
    '',
    `test(${JSON.stringify(o.name ?? `recorded: ${location.pathname}`)}, async () => {`,
    ...body.map((l) => `  ${l}`),
    ...(asserts
      ? []
      : [
          '  // T001: nothing was asserted while recording. Add what the user should see, or the gate rejects this test',
        ]),
    '})',
    '',
  ]
  return { code: lines.join('\n'), steps: steps.length, asserts }
}
