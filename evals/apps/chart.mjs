#!/usr/bin/env node
// evals/results/apps.html from results.json and apps-history.jsonl: one self-contained page, rewritten by every bench.mjs run.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { METRICS } from './lib/stats.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const results = JSON.parse(readFileSync(join(here, 'results.json'), 'utf8'))
const file = join(here, '../results/apps-history.jsonl')
const history = existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
const page = readFileSync(join(here, 'chart.html'), 'utf8').replace('/*DATA*/null', JSON.stringify({ results, history, METRICS }).replaceAll('<', '\\u003c'))
writeFileSync(join(here, '../results/apps.html'), page)
