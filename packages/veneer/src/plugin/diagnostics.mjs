/** Diagnostic entries shared by the Veneer manifest and framework reference. */
export const diagnostics = [
  {
    code: 'D010',
    catches:
      'A token override, alone or with the seed, that leaves text, a control boundary or the focus ring below WCAG contrast at some dial stop',
    fix: 'Change the token or seed; the message lists each failing pair',
    severity: 'error',
  },
]
