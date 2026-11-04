#!/usr/bin/env node
// evals/results/compare.html from results.json and compare-history.jsonl: one self-contained page, rewritten by every
// measure.mjs run. Colour follows the stack (fixed by stack.json order), never its rank.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { historyFile as file } from './history.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const results = JSON.parse(readFileSync(join(here, 'results.json'), 'utf8'))
const history = existsSync(file)
  ? readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  : []
const page = readFileSync(join(here, 'chart.html'), 'utf8').replace(
  '/*DATA*/null',
  JSON.stringify({ results, history }).replaceAll('<', '\\u003c'),
)
writeFileSync(join(here, '../../evals/results/compare.html'), page)
