import { derived, state } from '@weft-js/core'
import { Alert, Card, Input, Textarea } from '@weft-js/warp'

// `site.title` in weft.config.ts: a page's title fills `%s`.
const TEMPLATE = '%s · Acme'

export default function MetaPreview() {
  const title = state('Pricing')
  const description = state('Three plans, billed monthly, and what each one includes.')
  const full = derived(() => TEMPLATE.replace('%s', title.value))
  // What `weft check` reports for the same page: H003 and H004.
  const problems = derived(() => [
    ...(description.value.trim() ? [] : ['H003: no description, so the site default is used.']),
    ...(full.value.length > 60
      ? [`H004: the title is ${full.value.length} characters; results cut it at about 60.`]
      : []),
    ...(description.value.length > 160
      ? [
          `H004: the description is ${description.value.length} characters; cards cut it at about 160.`,
        ]
      : []),
  ])
  return (
    <Card title="What a shared link shows">
      <Input
        label="meta.title"
        value={title.value}
        onInput={(e) => (title.value = e.currentTarget.value)}
      />
      <Textarea
        label="meta.description"
        value={description.value}
        onInput={(e) => (description.value = e.currentTarget.value)}
      />
      <figure data-part="share-card">
        <b>{full.value}</b>
        <p>{description.value || 'Tools for builders.'}</p>
        <small>acme.dev/pricing</small>
      </figure>
      {problems.value.map((p) => (
        <Alert key={p} tone="caution">
          {p}
        </Alert>
      ))}
    </Card>
  )
}
