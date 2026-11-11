import type { RichTextHandle, MentionItem } from '@kerf/veneer-core'
import type { FieldShell } from '../Field'
import type { Bindable } from '../bind'
import {
  CodeIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  CodeBlockIcon,
} from '@kerf/veneer-icons'

/** An entry in the editor's slash menu. */
export type SlashCommand = {
  id: string
  label: string
  hint?: string
  shortcut?: string
  run: (editor: RichTextHandle) => void
}

type Mark = 'bold' | 'italic' | 'strike' | 'code' | 'link'

type Block = 'h2' | 'h3' | 'ul' | 'ol' | 'quote' | 'codeblock'

/** Props for RichTextEditor. */
export type RichTextEditorProps = FieldShell &
  Bindable<string> & {
    format?: 'html' | 'markdown' | undefined
    /** fixed (default) in the frame, bubble over a selection, or none. A phone docks either above the keyboard. */
    toolbar?: 'fixed' | 'bubble' | 'none'
    marks?: Mark[]
    blocks?: Block[]
    commands?: SlashCommand[]
    mentions?: { search: (q: string, signal: AbortSignal) => Promise<MentionItem[]> }
    placeholder?: string
    minRows?: number
    maxRows?: number
    name?: string | undefined
  }

export type Tool = {
  cmd: string
  label: string
  tip: string
  glyph: () => unknown
  style?: string
  toggles?: boolean
}

export const TOOLS: Record<Mark | Block, Tool> = {
  h2: { cmd: 'h2', label: 'H2 heading', tip: 'Heading · # ', glyph: () => 'H2', toggles: true },
  h3: {
    cmd: 'h3',
    label: 'H3 subheading',
    tip: 'Subheading · ### ',
    glyph: () => 'H3',
    toggles: true,
  },
  bold: {
    cmd: 'bold',
    label: 'Bold',
    tip: 'Bold · ⌘B',
    glyph: () => 'B',
    style: 'font-weight:700',
    toggles: true,
  },
  italic: {
    cmd: 'italic',
    label: 'Italic',
    tip: 'Italic · ⌘I',
    glyph: () => 'I',
    style: 'font-style:italic;font-family:Georgia,serif;font-weight:400;font-size:16px',
    toggles: true,
  },
  strike: {
    cmd: 'strikeThrough',
    label: 'Strikethrough',
    tip: 'Strikethrough',
    glyph: () => 'S',
    style: 'text-decoration:line-through;font-weight:500',
    toggles: true,
  },
  code: {
    cmd: 'code',
    label: 'Inline code',
    tip: 'Code · `text`',
    glyph: () => <CodeIcon />,
    toggles: true,
  },
  link: { cmd: 'link', label: 'Link', tip: 'Link · ⌘K', glyph: () => <LinkIcon />, toggles: true },
  ul: {
    cmd: 'insertUnorderedList',
    label: 'Bulleted list',
    tip: 'Bullets · - ',
    glyph: () => <ListIcon />,
    toggles: true,
  },
  ol: {
    cmd: 'insertOrderedList',
    label: 'Numbered list',
    tip: 'Numbers · 1. ',
    glyph: () => <ListOrderedIcon />,
    toggles: true,
  },
  quote: {
    cmd: 'blockquote',
    label: 'Quote',
    tip: 'Quote · > ',
    glyph: () => <QuoteIcon />,
    toggles: true,
  },
  codeblock: {
    cmd: 'pre',
    label: 'Code block',
    tip: 'Code block · ```',
    glyph: () => <CodeBlockIcon />,
    toggles: true,
  },
}

export const SLASH: SlashCommand[] = [
  { id: 'h2', label: 'Heading', hint: '#', run: (e) => e.run('h2') },
  { id: 'h3', label: 'Subheading', hint: '###', run: (e) => e.run('h3') },
  { id: 'ul', label: 'Bulleted list', hint: '-', run: (e) => e.run('insertUnorderedList') },
  { id: 'ol', label: 'Numbered list', hint: '1.', run: (e) => e.run('insertOrderedList') },
  { id: 'quote', label: 'Quote', hint: '>', run: (e) => e.run('blockquote') },
  { id: 'code', label: 'Code block', hint: '```', run: (e) => e.run('pre') },
  { id: 'divider', label: 'Divider', hint: '---', run: (e) => e.run('insertHorizontalRule') },
]

export type MenuRow = { id: string; main: string; meta?: string | undefined; run: () => void }
