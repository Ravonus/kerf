import { NATIVE, NATIVE_TYPES, addImport } from './rules.mjs'

export function checkNativeControls({ el, f, report, localComponents }) {
  const typed = (el.name === 'input' || el.name === 'Input') && NATIVE_TYPES[el.attr('type')?.value]
  if (typed && !el.attr('hidden') && !el.attr('data-part'))
    report(
      'D005',
      el.start,
      el.tagEnd,
      `\`type="${el.attr('type').value}"\` is painted by the browser: <${typed}> is veneer's.`,
    )
  if (/^[a-z]/.test(el.name) && el.name !== 'iframe' && el.attr('title'))
    report(
      'D005',
      el.start,
      el.tagEnd,
      'A `title` tooltip: the browser paints it, late, and never on touch or keyboard. Use <Tooltip>, or `aria-label` for a name.',
    )
  if (NATIVE[el.name] && !localComponents.has(NATIVE[el.name])) {
    const swap =
      el.name === 'button' &&
      !el.attr('class') &&
      !el.attr('className') &&
      !el.attr('style') &&
      f.text.slice(el.start, el.end).includes('</button')
    report(
      'D005',
      el.start,
      el.tagEnd,
      `Native <${el.name}> in a veneer app: <${NATIVE[el.name]}> brings the focus ring, the sweep, the tones and the touch target.`,
      swap
        ? {
            description: 'Use <Button>',
            safe: false,
            edits: [
              { start: el.start + 1, end: el.tagEnd, text: 'Button' },
              {
                start: f.text.lastIndexOf('</', el.end - 1) + 2,
                end: el.end - 1,
                text: 'Button',
              },
              ...addImport(f.text, ['Button']),
            ].sort((a, b) => b.start - a.start),
          }
        : undefined,
    )
  }
}
