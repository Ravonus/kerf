const scenario = process.env.KERF_BOOT_TEST_CASE
if (scenario === 'import') throw new Error('plugin import fixture failed')

export default function explicit(app) {
  if (!scenario) return
  app.hooks.hook('close', () => console.log('explicit closed'))
  if (scenario === 'sync') throw new Error('plugin initializer fixture failed')
  if (scenario === 'hang') return new Promise(() => {})
  console.log('explicit waiting')
  return new Promise((resolve) => setTimeout(resolve, 350)).then(() => {
    if (scenario === 'reject') throw new Error('plugin rejection fixture failed')
    globalThis.kerfTestPluginOrder = ['explicit']
  })
}
