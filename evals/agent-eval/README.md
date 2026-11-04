# agent-eval

Does an agent with no prior weft knowledge do better, and cheaper, on weft than on React? The design, metrics and pass
criteria are pre-registered in [docs/research/42-agent-eval.md](../../docs/research/42-agent-eval.md). Read that first.

```bash
npm install                     # here, and `npm ci` in ../apps for Lighthouse
node run.mjs pack               # weft's tarballs (build:native in packages/core first)
node run.mjs golden             # one scaffold per stack
node run.mjs probe              # no model: what the box blocks and allows
node run.mjs canary             # about $0.01: nothing of the owner's reaches a request
node run.mjs reference --task small-todo && node run.mjs mutants --task small-todo
node run.mjs run --task smoke --stack vite-react --model haiku --effort low --force-continuation --name smoke
node run.mjs plan               # the randomised order, and everything still blocking the matrix
```

`run` refuses anything but the smoke task without `--approved`, and `matrix` refuses until `plan` lists nothing. Goldens,
tarballs and raw transcripts live in `/private/tmp/aeval`, and each run's box in `/private/tmp/projects`.
