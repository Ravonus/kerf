import { defineConfig } from 'weft/config'

export default defineConfig({ site: { name: 'Live notes', url: 'http://localhost', title: '%s', description: 'A list another process writes to.' },
  live: { targets: { staging: { url: process.env.FIXTURE_APP_URL, db: 'FIXTURE_DATABASE_URL', production: false } } },
})
