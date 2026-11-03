/** `?raw` is a Vite query: the import is the file's text. */
declare module '*?raw' {
  const text: string
  export default text
}
