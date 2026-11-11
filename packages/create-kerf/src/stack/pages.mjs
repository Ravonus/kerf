// Tailwind: the same files `kerf add tailwind` writes (packages/cli/src/tailwind.mjs, held equal by a test).
/** What `--ui tailwind` adds, pinned. */
export const tailwindPackages = { tailwindcss: '4.3.3', '@tailwindcss/vite': '4.3.3' }
/** `vite.config.ts` for `--ui tailwind`. */
export const TAILWIND_VITE = `import tailwindcss from '@tailwindcss/vite'

export default { plugins: [tailwindcss()] }
`
/** The stylesheet for `--ui tailwind`. */
export const TAILWIND_CSS = `@import "tailwindcss";
`
const tw = {
  card: 'mx-auto max-w-2xl space-y-4 rounded-lg border border-current/15 p-6',
  title: 'text-2xl font-semibold',
  button: 'rounded-md border border-current/30 px-3 py-1.5 hover:bg-current/5',
  input: 'rounded-md border border-current/30 px-3 py-1.5',
}
/** The class of a scaffold element: Tailwind's utilities, or the plain CSS in src/app.css. */
export const classes = (ui, part) => (ui === 'tailwind' ? tw[part] : part === 'card' ? 'card' : '')
const attr = (ui, part) => (ui === 'tailwind' ? ` class="${tw[part]}"` : '')

/** The page's controls in each UI kit: veneer's components, or plain elements with the same roles and names. */
export const controls = (ui) =>
  ui === 'veneer'
    ? {
        imports: `import { Alert, Button, Card, Checkbox, Input } from '@kerf-js/veneer'\n`,
        card: (title, body) => `<Card title=${JSON.stringify(title)}>${body}</Card>`,
        input: (label, box, type = 'text') =>
          `<Input label=${JSON.stringify(label)} type="${type}" value={${box}.value} onInput={e => (${box}.value = e.currentTarget.value)} />`,
        submit: (label, pending) => `<Button type="submit" loading={${pending}}>${label}</Button>`,
        button: (label, onClick, extra = '') =>
          `<Button emphasis="ghost" ${extra}onClick={${onClick}}>${label}</Button>`,
        error: (box) => `{${box}.value && <Alert tone="critical" live>{${box}.value}</Alert>}`,
        row: `<Checkbox checked={t.done} onChange={() => toggleTodo({ id: t.id })}>{t.title}</Checkbox>
          <Button emphasis="ghost" tone="neutral" size="sm" icon="x" aria-label={\`Delete \${t.title}\`} onClick={() => deleteTodo({ id: t.id })} />`,
      }
    : {
        imports: '',
        card: (title, body) =>
          `<section class="${classes(ui, 'card')}"><h1${attr(ui, 'title')}>${title}</h1>${body}</section>`,
        input: (label, box, type = 'text') =>
          `<label>${label} <input${attr(ui, 'input')} type="${type}" value={${box}.value} onInput={e => (${box}.value = e.currentTarget.value)} /></label>`,
        submit: (label, pending) =>
          `<button${attr(ui, 'button')} type="submit" disabled={${pending}}>${label}</button>`,
        button: (label, onClick, extra = '') =>
          `<button${attr(ui, 'button')} type="button" ${extra}onClick={${onClick}}>${label}</button>`,
        error: (box) => `{${box}.value && <p role="alert">{${box}.value}</p>}`,
        row: `<label>
            <input type="checkbox" checked={t.done} onChange={() => toggleTodo({ id: t.id })} /> {t.title}
          </label>
          <button type="button" aria-label={\`Delete \${t.title}\`} onClick={() => deleteTodo({ id: t.id })}>×</button>`,
      }

/** `/todos`: the list on the server functions, written for this `--ui`. */
export function todosPage(ui) {
  const c = controls(ui)
  return `import type { Meta } from '@kerf-js/start'
import { Boundary, state } from '@kerf-js/core'
${c.imports}import { addTodo, deleteTodo, listTodos, toggleTodo } from '#/server/todos'

export const meta: Meta = { title: 'Todos', description: 'Your todo list: add, tick off and delete.' }

// The query is made in here, inside the Boundary, so the Boundary sees it: it shows \`pending\` until the list arrives.
function TodoList() {
  const todos = listTodos()
  return (
    <ul class="todos">
      {(todos.value ?? []).map(t => (
        <li key={t.id} class={t.done ? 'done' : 'open'}>
          ${c.row}
        </li>
      ))}
    </ul>
  )
}

export default function Todos() {
  const title = state('')
  const problem = state('')
  const add = async (e: SubmitEvent) => {
    e.preventDefault()
    const text = title.value.trim()
    if (!text) return
    title.value = ''
    problem.value = ''
    await addTodo({ title: text }).catch((err: Error) => (problem.value = err.message))
  }
  return (
    ${c.card(
      'Todos',
      `
      <form onSubmit={add}>
        ${c.input('New todo', 'title')}
        ${c.submit('Add', 'addTodo.pending.value')}
      </form>
      ${c.error('problem')}
      <Boundary pending={<p>Loading…</p>}>
        <TodoList />
      </Boundary>
    `,
    )}
  )
}
`
}

/** `/login`: sign in and sign up, written for this `--ui`. */
export function loginPage(ui) {
  const c = controls(ui)
  return `import { redirect, type LoadArgs, type Meta } from '@kerf-js/start'
import { state } from '@kerf-js/core'
${c.imports}import { signIn, signUp } from '#/server/session'

export const load = ({ ctx }: LoadArgs) => {
  if (ctx.user) redirect('/todos')
}

export const meta: Meta = { title: 'Sign in', description: 'Sign in, or make an account.' }

export default function Login() {
  const creating = state(false)
  const name = state('')
  const email = state('')
  const password = state('')
  const problem = state('')
  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    problem.value = ''
    const done = creating.value
      ? signUp({ name: name.value, email: email.value, password: password.value })
      : signIn({ email: email.value, password: password.value })
    await done.catch((err: Error) => (problem.value = err.message))
  }
  return (
    ${c.card(
      'Sign in',
      `
      <form onSubmit={submit}>
        {creating.value && ${c.input('Name', 'name')}}
        ${c.input('Email', 'email', 'email')}
        ${c.input('Password', 'password', 'password')}
        ${c.submit(`{creating.value ? 'Create account' : 'Sign in'}`, 'signIn.pending.value || signUp.pending.value')}
      </form>
      ${c.error('problem')}
      ${c.button(`{creating.value ? 'I have an account' : 'Create an account'}`, '() => (creating.value = !creating.value)')}
    `,
    )}
  )
}
`
}
