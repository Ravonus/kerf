import type { Diagnostic } from './log'

/** Encode one Start diagnostic for the selected stderr format. */
export function diagnosticLine(diagnostic: Diagnostic, format: 'text' | 'json'): string
