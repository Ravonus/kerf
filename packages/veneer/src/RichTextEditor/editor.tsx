import '@kerf-js/veneer-core/styles/rich/body.css'
import '@kerf-js/veneer-core/styles/rich/rich-text.css'
import '@kerf-js/veneer-core/styles/rich/listbox.css'
import '@kerf-js/veneer-core/styles/rich/popover.css'
import '@kerf-js/veneer-core/styles/rich/helpers.css'
import { SLASH } from './tools'
import type { RichTextEditorProps } from './tools'
import { EditorBody } from './view'
import { editorState } from './controller'
import { Field } from '../Field'

/**
 * A rich text field (04 RichTextEditor; inputs-rich.html:1522): the editor frame is the field. The toolbar is an APG
 * Toolbar, one tab stop with ←/→ inside. Markdown shortcuts open a block at the start of a line; `/` on an empty line and
 * `@` open a list at the caret. Everything that enters the editor, a value or a paste, goes through veneer-core's allow-list.
 */
export function RichTextEditor({
  value,
  defaultValue,
  onValueChange,
  format = 'html',
  toolbar = 'fixed',
  marks = ['bold', 'italic', 'strike', 'code', 'link'],
  blocks = ['h2', 'ul', 'ol', 'quote'],
  commands = SLASH,
  mentions,
  placeholder = 'Write, or type / for blocks…',
  minRows,
  maxRows,
  name,
  hint,
  ...rest
}: RichTextEditorProps) {
  const { held, menuOpen, view } = editorState({
    value: () => value,
    defaultValue: () => defaultValue,
    onValueChange: () => onValueChange,
    format: () => format,
    toolbar: () => toolbar,
    marks: () => marks,
    blocks: () => blocks,
    commands: () => commands,
    mentions: () => mentions,
    placeholder: () => placeholder,
    minRows: () => minRows,
    maxRows: () => maxRows,
    name: () => name,
  })
  return (
    <Field
      {...rest}
      hint={hint ?? 'Markdown shortcuts work at the start of a line. Esc closes menus.'}
      group
      filled
      reset={held.reset}
      hold={menuOpen.value}
      attrs={{ 'data-multiline': '' }}
      control={(p) => <EditorBody view={view} p={p} />}
    />
  )
}
