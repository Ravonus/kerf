export default function discovered(app) {
  if (!process.env.KERF_BOOT_TEST_CASE) return
  globalThis.kerfTestPluginOrder.push('discovered')
  app.hooks.hook('close', () => {
    if (process.env.KERF_BOOT_TEST_CASE === 'cleanup') throw new Error('Nitro close fixture failed')
    console.log('discovered closed')
  })
}
