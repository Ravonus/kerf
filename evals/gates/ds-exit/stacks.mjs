import { execFileSync } from 'node:child_process'
import { localPackages, repo } from '../../lib/gate.mjs'

const pkg = localPackages(repo)
const TAILWIND = { tailwindcss: '4.3.3', '@tailwindcss/vite': '4.3.3' }
const REACT = { react: '19.3.1', 'react-dom': '19.3.1' }
const reactVite = (...more) =>
  `import react from '@vitejs/plugin-react'\n${more.includes('tw') ? "import tailwindcss from '@tailwindcss/vite'\n" : ''}import { defineConfig } from 'vite'\nexport default defineConfig({ plugins: [react()${more.includes('tw') ? ', tailwindcss()' : ''}] })\n`
const KERF_MAIN = `import { render } from '@kerf-js/core/dom'\nimport { App } from './App'\nrender(() => <App />, document.getElementById('root')!)\n`
const KERF_APP = `export function App() {\n  return <main>Replace me</main>\n}\n`
const TSX = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    jsx: 'preserve',
    jsxImportSource: '@kerf-js/core',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  },
  include: ['src'],
}
const CSS_TW = `@import "tailwindcss";\n`

export const STACKS = {
  'kerf-ds': {
    label: '@kerf-js/core/ds (kerf + veneer)',
    tool: 'kerf + @kerf-js/veneer',
    deps: {
      '@kerf-js/core': pkg('core'),
      '@kerf-js/veneer': pkg('veneer'),
      '@kerf-js/veneer-core': pkg('veneer-core'),
      '@kerf-js/cli': pkg('cli'),
    },
    dev: { vite: '8.3.5' },
    files: {
      'vite.config.ts': `import { defineConfig } from 'vite'\nimport kerf from '@kerf-js/core/vite'\nexport default defineConfig({ plugins: [kerf()] })\n`,
      'kerf.config.ts': `import { defineConfig } from '@kerf-js/core/config'\nimport veneer from '@kerf-js/veneer/plugin'\nexport default defineConfig({ plugins: [veneer()] })\n`,
      'src/main.tsx': KERF_MAIN,
      'src/App.tsx': KERF_APP,
      'tsconfig.json': JSON.stringify(TSX, null, 2),
    },
    note: 'This is a kerf app using veneer. Read AGENTS.md first, then `npx kerf docs design`. Run `npx kerf check --json` after changes and `npx kerf fix` for the safe fixes.',
    after: (dir) => {
      execFileSync('npx', ['kerf', 'plugins', 'approve', '--all'], { cwd: dir, stdio: 'ignore' })
      execFileSync('npx', ['kerf', 'agents-md'], { cwd: dir, stdio: 'ignore' })
    },
  },
  'kerf-tailwind': {
    label: 'Raw Tailwind (kerf + Tailwind)',
    tool: 'kerf + Tailwind',
    deps: { '@kerf-js/core': pkg('core'), '@kerf-js/cli': pkg('cli') },
    dev: { vite: '8.3.5', ...TAILWIND },
    files: {
      'vite.config.ts': `import tailwindcss from '@tailwindcss/vite'\nimport { defineConfig } from 'vite'\nimport kerf from '@kerf-js/core/vite'\nexport default defineConfig({ plugins: [kerf(), tailwindcss()] })\n`,
      'src/main.tsx': `import './app.css'\n${KERF_MAIN}`,
      'src/App.tsx': KERF_APP,
      'src/app.css': CSS_TW,
      'tsconfig.json': JSON.stringify(TSX, null, 2),
    },
    note: 'This is a kerf app styled with Tailwind v4 utility classes. Read AGENTS.md first. Run `npx kerf check --json` after changes.',
    after: (dir) => execFileSync('npx', ['kerf', 'agents-md'], { cwd: dir, stdio: 'ignore' }),
  },
  'solid-kobalte': {
    label: 'Solid + Kobalte + Tailwind',
    tool: 'Solid',
    deps: { 'solid-js': '1.9.18', '@kobalte/core': '0.13.14' },
    dev: { vite: '8.3.5', 'vite-plugin-solid': '2.11.15', ...TAILWIND },
    files: {
      'vite.config.ts': `import tailwindcss from '@tailwindcss/vite'\nimport { defineConfig } from 'vite'\nimport solid from 'vite-plugin-solid'\nexport default defineConfig({ plugins: [solid(), tailwindcss()] })\n`,
      'src/main.tsx': `import { render } from 'solid-js/web'\nimport { App } from './App'\nimport './app.css'\nrender(() => <App />, document.getElementById('root')!)\n`,
      'src/App.tsx': KERF_APP,
      'src/app.css': CSS_TW,
    },
    note: 'This is a Solid app. Use Kobalte for the dialog and select, and Tailwind v4 for styling.',
  },
  'react-radix': {
    label: 'React + Radix + Tailwind',
    tool: 'React',
    deps: {
      ...REACT,
      '@radix-ui/react-dialog': '1.3.1',
      '@radix-ui/react-select': '2.3.1',
      '@radix-ui/react-switch': '1.3.1',
    },
    dev: { vite: '8.3.5', '@vitejs/plugin-react': '6.1.2', ...TAILWIND },
    files: {
      'vite.config.ts': reactVite('tw'),
      'src/main.tsx': `import { createRoot } from 'react-dom/client'\nimport { App } from './App'\nimport './app.css'\ncreateRoot(document.getElementById('root')!).render(<App />)\n`,
      'src/App.tsx': KERF_APP,
      'src/app.css': CSS_TW,
    },
    note: 'This is a React app. Use Radix primitives for the dialog, select and switch, and Tailwind v4 for styling.',
  },
  'react-zustand': {
    label: 'React + Zustand + Tailwind',
    tool: 'React',
    deps: {
      ...REACT,
      zustand: '5.0.16',
      '@radix-ui/react-dialog': '1.3.1',
      '@radix-ui/react-select': '2.3.1',
      '@radix-ui/react-switch': '1.3.1',
    },
    dev: { vite: '8.3.5', '@vitejs/plugin-react': '6.1.2', ...TAILWIND },
    files: {
      'vite.config.ts': reactVite('tw'),
      'src/main.tsx': `import { createRoot } from 'react-dom/client'\nimport { App } from './App'\nimport './app.css'\ncreateRoot(document.getElementById('root')!).render(<App />)\n`,
      'src/App.tsx': KERF_APP,
      'src/app.css': CSS_TW,
    },
    note: 'This is a React app. Keep the customer list in a Zustand store. Use Radix primitives for the dialog, select and switch, and Tailwind v4 for styling.',
  },
  'react-mui': {
    label: 'React + MUI',
    tool: 'React',
    deps: {
      ...REACT,
      '@mui/material': '9.5.0',
      '@emotion/react': '11.14.0',
      '@emotion/styled': '11.14.1',
    },
    dev: { vite: '8.3.5', '@vitejs/plugin-react': '6.1.2' },
    files: {
      'vite.config.ts': reactVite(),
      'src/main.tsx': `import { createRoot } from 'react-dom/client'\nimport { App } from './App'\ncreateRoot(document.getElementById('root')!).render(<App />)\n`,
      'src/App.tsx': KERF_APP,
    },
    note: 'This is a React app using MUI (Material UI) components and its theme.',
  },
}

export const BRIEF = (stack) => `${stack.note}

Build "Northwind", a small product admin. It's one page in src/App.tsx (split it into files as you like) with no server. The
screen comes from the URL hash: #/settings, #/customers and #/pricing, and no hash shows settings. Keep to these words, since
the pages are read by people using them:

Every screen has a nav with links named Settings, Customers and Pricing, and one h1.

#/settings (h1 "Settings"): a profile form with fields labelled exactly Full name, Email, Role (a select: Admin, Editor, Viewer)
and Bio (multi-line), a switch labelled Email updates, a button named Save and a button named Cancel. Saving with an email
that has no @ shows "Enter a valid email" next to the field. A good save shows "Saved".

#/customers (h1 "Customers"): a search field labelled Search, and a table of 12 made-up customers with name, email, plan, a
status (Active, Trial, Past due), and a button in each row named Delete <customer name>. Search filters by name. When nothing
matches, show "No customers found". Delete opens a dialog asking to confirm, with a button named Delete and one named Keep.
Confirming removes the row.

#/pricing (h1 "Pricing"): a short hero with a call to action, three plans with headings Starter, Team and Enterprise, each with
a price, a list of features and a button, with Team highlighted, then a "Frequently asked questions" section with three
questions and answers.

It has to work at phone width and on a desktop, and follow the system's light or dark setting. It should look like a finished
product a company would ship. Work only in this directory. Don't change package.json or install anything. \`npm run build\` must pass before
you finish.
`
