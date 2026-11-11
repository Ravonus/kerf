/** icons diagnostic entries in catalog order. */
export const icons = [
  {
    code: 'I001',
    severity: 'error',
    by: 'cli',
    catches: '`<Icon name="as">`, or `Icons.As`, where no such icon exists',
    fix: 'Use the name it suggests. `kerf docs icons` has the set; an editor completes it from the type.',
  },
  {
    code: 'I002',
    severity: 'info',
    by: 'cli',
    catches: 'An icon name only known at runtime, so that use loads the pack',
    fix: 'Nothing to do if the name comes from data. To fetch single icons instead, set `icons({ source })`. A list of literals, or a map over one, ships only those.',
  },
  {
    code: 'I003',
    severity: 'info',
    by: 'cli',
    catches: 'The icon pack used as a value, so all of it ships with the page',
    fix: 'Use `Icons.X`, or `Icons[name]`, which loads lazily.',
  },
]
