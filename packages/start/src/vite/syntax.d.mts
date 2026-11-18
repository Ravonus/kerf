/** Remove server-only exports and unused imports from a browser route. */
export function stripServerExports(code: string, file?: string, shell?: boolean): string
