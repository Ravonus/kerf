// Shared in-memory core declarations and TypeScript host for diagnostic fixtures.
import ts from 'typescript'

/** Core declarations and minimal globals used by typed diagnostic fixtures. */
export const declarations = `
interface Array<T> { length: number; [index: number]: T }
declare module '@kerf-js/core' {
  export interface State<T> { value: T; readonly stateBrand: 'state' }
  export interface Derived<T> { readonly value: T; readonly derivedBrand: 'derived' }
  export function state<T>(value: T): State<T>;
  export function derived<T>(read: () => T): Derived<T>;
}
declare namespace JSX {
  interface Element {}
  interface IntrinsicElements { div: { title?: number } }
}`
/** Type-check an in-memory TSX source with optional extra modules. */
export function typedProgram(source: string, extra: Record<string, string> = {}) {
  const files: Record<string, string> = {
    '/app/core.d.ts': declarations,
    '/app/App.tsx': source,
    ...extra,
  }
  const options: ts.CompilerOptions = {
    strict: true,
    noLib: true,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  }
  const host = ts.createCompilerHost(options)
  host.fileExists = (file) => file in files
  host.readFile = (file) => files[file]
  host.directoryExists = (dir) => Object.keys(files).some((file) => file.startsWith(`${dir}/`))
  host.getSourceFile = (file, version) =>
    files[file] === undefined ? undefined : ts.createSourceFile(file, files[file], version, true)
  const program = ts.createProgram(Object.keys(files), options, host)
  return program
}
