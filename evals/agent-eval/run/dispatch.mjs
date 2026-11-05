// Keep backend errors out of grading and retain only the adapter's bounded receipt.
import { runCodex } from '../lib/codex.mjs'

export async function dispatch({ backend, grade }) {
  const at = Date.now()
  const result = await runCodex(backend)
  const wallMs = Date.now() - at
  if (!result.ok) return { ok: false, backend: result, passAt1: null, wallMs }
  const passed = await grade()
  return { ok: true, backend: result, passAt1: passed, wallMs }
}
