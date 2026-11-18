export function startup() {
  if (!process.env.KERF_BOOT_TEST_CASE) return
  const { kerfTestPluginOrder } = globalThis as typeof globalThis & {
    kerfTestPluginOrder: string[]
  }
  if (kerfTestPluginOrder.join(',') !== 'explicit,discovered')
    throw new Error('Unexpected plugin order')
  if (process.env.KERF_BOOT_TEST_CASE === 'app') throw new Error('app startup fixture failed')
  if (process.env.KERF_BOOT_TEST_CASE === 'crash')
    setTimeout(() => {
      void Promise.reject(new Error('production fixture timer rejection'))
    }, 300)
  return () => console.log('application closed')
}
