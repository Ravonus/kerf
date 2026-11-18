import { address, assertNoMarkup, go, open, operationAttacks, tamper } from './shell.browser.setup'

export function testHostileShellOperations() {
  test.each(operationAttacks)(
    'refuses hostile %s data from queries, mutations, SSE and channel messages',
    async (attack) => {
      const { page } = await open()
      await page.addInitScript((probe) => {
        sessionStorage.operationAttack = probe
        sessionStorage.peer = 'b'
      }, attack)
      await page.routeWebSocket(/\/_kerf\/ws$/, (route) => {
        const server = route.connectToServer()
        server.onMessage((message) => {
          if (typeof message !== 'string') return
          const frame = JSON.parse(message)
          route.send(
            frame.value[0] === 'm' && frame.value[3] === 'notice' ? tamper(frame, attack) : message,
          )
        })
      })
      try {
        await go(page, '/critic', 'Release text')
        await page.locator('[data-stream-error]').getByText('invalid').waitFor()
        await page.locator('[data-channel]').getByText('open').waitFor()
        await page.getByRole('button', { name: 'Request channel message' }).click()
        await page.locator('[data-channel-error]').getByText('invalid').waitFor()
        await page.getByRole('button', { name: 'Read server function' }).click()
        await page.locator('[data-query]').getByText('invalid').waitFor()
        await page.getByRole('button', { name: 'Read through own transport' }).click()
        await page.locator('[data-direct]').getByText('invalid').waitFor()
        await page.getByRole('button', { name: 'Submit server form' }).click()
        await page.locator('[data-action]').getByText('invalid').waitFor()
        for (const attr of ['data-form', 'data-notice', 'data-stream'])
          expect(await page.locator('[' + attr + ']').textContent()).toBe('')
        expect(await page.getByText('PEER_PRIVATE_ERROR').count()).toBe(0)
        await assertNoMarkup(page)
      } finally {
        await page.close()
      }
    },
  )

  test.each(operationAttacks)(
    'refuses hostile bootstrap %s before any route renders and recovers with Retry',
    async (attack) => {
      const { page, documents } = await open()
      await page.addInitScript((probe) => {
        sessionStorage.bootstrapAttack = probe
      }, attack)
      try {
        await go(page, '/', 'Release bootstrap failed')
        expect(await page.getByRole('heading', { name: 'Release home' }).count()).toBe(0)
        expect(await page.getByText('PEER_PRIVATE_ERROR').count()).toBe(0)
        await assertNoMarkup(page)
        await page.evaluate(() => {
          delete sessionStorage.bootstrapAttack
        })
        await page.getByRole('button', { name: 'Retry bootstrap' }).click()
        await page.getByRole('heading', { name: 'Release home' }).waitFor()
        expect(documents).toEqual([address + '/'])
      } finally {
        await page.close()
      }
    },
  )
}
