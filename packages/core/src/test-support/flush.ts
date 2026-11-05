import { flush as flushGraph } from '../index'

/** Waits for writes to reach the DOM, and for what they started to settle. */
export async function flush() {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve()
    flushGraph()
  }
}
