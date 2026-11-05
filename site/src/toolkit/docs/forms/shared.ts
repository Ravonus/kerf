export const fieldProps = {
  label:
    'The name people read and screen readers announce. Always required, and it floats on the border by default.',
  hint: 'A short line of help under the field.',
  error: 'Replaces the hint and marks the field invalid.',
  size: '`sm`, `md` or `lg`. Each follows the density around it.',
  variant: '`floating` puts the label on the border, `classic` above the field.',
  appearance: '`line` draws only the bottom edge.',
  disabled: "Can't be focused or changed, and doesn't post with a form.",
  readonly: 'Can be focused, read and copied, but not changed. It still posts.',
}

export const sizes = ['sm', 'md', 'lg']

export const variants = ['floating', 'classic']
