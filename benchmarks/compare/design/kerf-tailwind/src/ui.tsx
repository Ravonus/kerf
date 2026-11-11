import type { JSX } from '@kerf/core'

type Kids = { children?: JSX.Element | JSX.Element[] | string }

const btn =
  'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50'
const tones = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
  secondary:
    'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  ghost: 'text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950',
}

export function Button(
  props: {
    tone?: 'primary' | 'secondary' | 'danger' | 'ghost'
    type?: 'button' | 'submit'
    label?: string
    onClick?: () => void
    class?: string
    autofocus?: boolean
  } & Kids,
) {
  return (
    <button
      type={props.type ?? 'button'}
      aria-label={props.label}
      autofocus={props.autofocus}
      onClick={() => props.onClick?.()}
      class={`${btn} ${tones[props.tone ?? 'secondary']} ${props.class ?? ''}`}
    >
      {props.children}
    </button>
  )
}

export const control =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-2 focus:outline-indigo-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

export function Field(props: { label: string; error?: string | false; children?: JSX.Element }) {
  return (
    <label class="flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
      {props.label}
      {props.children}
      {props.error && (
        <span role="alert" class="text-sm font-normal text-red-600 dark:text-red-400">
          {props.error}
        </span>
      )}
    </label>
  )
}

export function Card(props: { class?: string } & Kids) {
  return (
    <div
      class={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900 ${props.class ?? ''}`}
    >
      {props.children}
    </div>
  )
}

export function PageHeader(props: { title: string; blurb: string }) {
  return (
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{props.title}</h1>
      <p class="mt-1 text-slate-600 dark:text-slate-400">{props.blurb}</p>
    </header>
  )
}
