import { randomBytes } from 'node:crypto'

export const cookieHeader = (cookies) =>
  cookies?.length ? cookies.map((c) => `${c.name}=${c.value}`).join('; ') : undefined
export const randomValue = () => `v${randomBytes(5).toString('hex')}`
export const fill = (sql, value) => sql.replaceAll('$1', `'${value}'`)

/** "role:name", or a bare role. Exact names, because that's what the contract gives every stack. */
export function target(page, spec) {
  const i = spec.indexOf(':')
  return i < 0
    ? page.getByRole(spec)
    : page.getByRole(spec.slice(0, i), { name: spec.slice(i + 1), exact: true })
}

export async function centre(locator) {
  await locator.scrollIntoViewIfNeeded()
  const b = await locator.boundingBox()
  if (!b) throw new Error(`nothing to click: ${locator}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

export async function press(cdp, { x, y }) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  })
}

export async function trustedClick(cdp, locator) {
  const at = await centre(locator)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y })
  await press(cdp, at)
  return at
}
export const settled = (page) =>
  page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
