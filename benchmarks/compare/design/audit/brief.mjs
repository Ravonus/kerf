/** The brief, by role and text. Each is one point; a stack that fails one still gets audited. */
export async function brief(page, url, show, settle) {
  const out = {}
  const check = async (name, fn) => {
    try {
      out[name] = !!(await fn())
    } catch {
      out[name] = false
    }
  }
  await settings(page, url, show, settle, check)
  await customers(page, url, show, settle, check)
  await pricing(page, url, show, check)
  return out
}

async function settings(page, url, show, settle, check) {
  await show(page, url, 'settings')
  await check('three links in a nav', async () => {
    for (const n of ['Settings', 'Customers', 'Pricing'])
      await page
        .getByRole('navigation')
        .getByRole('link', { name: n })
        .first()
        .waitFor({ timeout: 1500 })
    return true
  })
  await check('settings: h1', () => page.getByRole('heading', { level: 1 }).first().isVisible())
  await check('settings: fields by label', async () => {
    for (const n of ['Full name', 'Email', 'Bio'])
      await page.getByLabel(n).first().waitFor({ timeout: 1500 })
    return true
  })
  await check('settings: Role select', () => page.getByLabel('Role').first().isVisible())
  await check('settings: bad email refused', async () => {
    await page.getByLabel('Email').first().fill('nope')
    await page.getByRole('button', { name: 'Save' }).first().click()
    await settle(page)
    return page
      .getByText(/valid email/i)
      .first()
      .isVisible()
  })
  await check('settings: good save confirms', async () => {
    await page.getByLabel('Email').first().fill('ada@example.com')
    await page.getByRole('button', { name: 'Save' }).first().click()
    await settle(page)
    return page.getByText(/saved/i).first().isVisible()
  })
}

async function customers(page, url, show, settle, check) {
  await show(page, url, 'customers')
  await check('customers: 12 rows', async () => (await page.getByRole('row').count()) >= 13)
  await check('customers: search narrows', async () => {
    await page
      .getByLabel(/search/i)
      .first()
      .fill('zzzz-no-match')
    await settle(page)
    const none = await page
      .getByText(/no customers/i)
      .first()
      .isVisible()
    await page
      .getByLabel(/search/i)
      .first()
      .fill('')
    await settle(page)
    return none
  })
  await check('customers: delete asks, then removes', async () => {
    await page
      .getByRole('button', { name: /delete/i })
      .first()
      .click()
    await settle(page)
    const open = await page
      .getByRole('dialog')
      .or(page.getByRole('alertdialog'))
      .first()
      .isVisible()
    await page
      .getByRole('dialog')
      .or(page.getByRole('alertdialog'))
      .first()
      .getByRole('button', { name: /delete/i })
      .click()
    await settle(page)
    return (
      open &&
      (await page.getByRole('row').count()) >= 12 &&
      (await page.getByRole('row').count()) < 13 + 0
    )
  })
}

async function pricing(page, url, show, check) {
  await show(page, url, 'pricing')
  await check('pricing: three plans', async () => {
    for (const n of ['Starter', 'Team', 'Enterprise'])
      await page.getByRole('heading', { name: n }).first().waitFor({ timeout: 1500 })
    return true
  })
  await check('pricing: FAQ', () =>
    page
      .getByText(/frequently asked/i)
      .first()
      .isVisible(),
  )
}
