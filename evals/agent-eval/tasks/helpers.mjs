// Shared by the hidden tests: nothing here may know a stack.
export async function until(what, test, ms = 4000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    try {
      last = await test()
      if (last) return last
    } catch (e) {
      last = e.message
    }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`${what}: gave up (last: ${String(last).slice(0, 120)})`)
}
export const same = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want))
    throw new Error(`${what}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`)
}
