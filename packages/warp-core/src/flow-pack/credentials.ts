import { installSweep } from '../sweep'

/** Ticks once a second until zero, from the clock, so a throttled tab catches up. Countdowns are information: reduced motion keeps them. */
export function secondsClock(seconds: number, onTick: (left: number) => void, onDone?: () => void) {
  const end = Date.now() + seconds * 1000
  const id = setInterval(() => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
    onTick(left)
    if (left === 0) {
      clearInterval(id)
      onDone?.()
    }
  }, 1000)
  return () => clearInterval(id)
}

/** `0:30`. */
export const clockLabel = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** Cancelling the OS sheet is not an error (09 §2.1): nothing shows. */
export const isPasskeyCancel = (e: unknown) =>
  ['NotAllowedError', 'AbortError'].includes((e as { name?: string } | null)?.name ?? '')

/** Copy to the clipboard; a refusal stays quiet (the text is on the page to select). */
export async function copyText(doc: Document, text: string) {
  try {
    await doc.defaultView?.navigator.clipboard?.writeText(text)
    return true
  } catch {
    return false
  }
}

// ---- email and password (09 §2.3) -----------------------------------------------------------------------------------

/** A loose shape check for an email address: something, `@`, a domain with a dot. The server is the real check. */
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

/** The format message on blur: never "Invalid input". Empty says nothing until submit. */
export const emailError = (v: string) =>
  v && !isEmail(v) ? "That doesn't look like an email. Check for a typo." : undefined

/** One line of the password checklist. */
export interface PasswordRule {
  id: string
  label: string
  met: boolean
}

/** The checklist shown under a new password, each rule with whether `v` meets it. */
export const passwordRules = (v: string): PasswordRule[] => [
  { id: 'length', label: 'At least 8 characters', met: v.length >= 8 },
  { id: 'letter', label: 'One letter', met: /\p{L}/u.test(v) },
  { id: 'number', label: 'One number', met: /\d/.test(v) },
]

/** `passwordStrength`'s answer: a score from 0 to 4, its word and its tone. */
export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  tone: 'critical' | 'caution' | 'positive'
}

const STRENGTH = [
  ['Too short', 'critical'],
  ['Weak', 'critical'],
  ['Fair', 'caution'],
  ['Good', 'positive'],
  ['Strong', 'positive'],
] as const

/** A rough score: length and variety, with a repeated run or a too-short password held down. */
export function passwordStrength(v: string): PasswordStrength {
  const kinds = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter((r) => r.test(v)).length
  let score =
    v.length < 8 ? 0 : Math.min(4, kinds - 1 + (v.length >= 12 ? 1 : 0) + (v.length >= 16 ? 1 : 0))
  if (v.length >= 8) score = Math.max(1, score)
  if (/^(.)\1+$/.test(v)) score = Math.min(score, 1)
  const [label, tone] = STRENGTH[score]!
  return { score: score as PasswordStrength['score'], label, tone }
}

// ---- OTP (03 §3, 09 §2.3): one input, painted cells ----------------------------------------------------------------

/** Digits only, cut to `length`: what a pasted or typed code becomes. */
export const otpClean = (v: string, length: number) => v.replace(/\D/g, '').slice(0, length)

/** Options for the OTP input action. */
export interface OtpOptions {
  length: number
  invalid: boolean
  success: boolean
  onValue(code: string): void
  onComplete(code: string): void
}

/**
 * `[data-scope="otp"]`: paints the one real input into its cells, holds the active cell's sweep, takes a pasted code
 * whatever its spacing. A wrong code pins every cell critical, clears the input and returns focus to it; an accepted
 * one pins them all so the positive sweep cascades.
 */
export function otpInput(el: HTMLElement, opts: OtpOptions) {
  let o = opts
  const input = el.querySelector<HTMLInputElement>(':scope > input')!
  const cells = [...el.querySelectorAll<HTMLElement>('[data-part="cell"]')]
  const doc = el.ownerDocument
  const m = installSweep(doc)
  const paint = () => {
    const v = (input.value = otpClean(input.value, o.length))
    const at = Math.min(v.length, o.length - 1),
      focused = doc.activeElement === input
    cells.forEach((c, i) => {
      c.querySelector('[data-part="char"]')!.textContent = v[i] ?? ''
      m.pin(c, o.invalid || o.success || (focused && i === at))
    })
    return v
  }
  const changed = () => {
    const v = paint()
    o.onValue(v)
    if (v.length === o.length) o.onComplete(v)
  }
  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text')
    if (text === undefined) return
    e.preventDefault()
    input.value = otpClean(text, o.length)
    input.setSelectionRange?.(input.value.length, input.value.length)
    changed()
  }
  const passive = ['focus', 'blur', 'keyup', 'click', 'select']
  input.addEventListener('input', changed)
  input.addEventListener('paste', onPaste)
  for (const t of passive) input.addEventListener(t, paint)
  paint()
  return {
    update(next: OtpOptions) {
      const wrong = next.invalid && !o.invalid,
        won = next.success && !o.success
      o = next
      if (wrong) {
        input.value = ''
        o.onValue('')
        input.focus({ preventScroll: true })
      }
      if (won) input.blur()
      paint()
    },
    destroy() {
      input.removeEventListener('input', changed)
      input.removeEventListener('paste', onPaste)
      for (const t of passive) input.removeEventListener(t, paint)
    },
  }
}
