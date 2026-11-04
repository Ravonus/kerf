// Report where a secret was found without exposing the finding.
export const leakPlaces = (text) =>
  JSON.parse(text || '[]').map(
    (f) => `${f.File}:${f.StartLine} ${f.RuleID}${f.Commit ? ` in ${f.Commit.slice(0, 8)}` : ''}`,
  )
