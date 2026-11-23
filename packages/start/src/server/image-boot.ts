// Priority artwork and the media lifecycle start independently.
import { esc } from './text'
/** Native module scheduling must not wait for image decoding or visitor interaction. */
export function entryScript(entry: string, _media: boolean, streaming = false) {
  return `<script type="module"${streaming ? ' async' : ''} src="${esc(entry)}"></script>\n`
}
