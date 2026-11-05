export const NOTES = `## October release

Previews now **stay up** for 30 days after a branch is deleted. See the [guide](/docs) for more.

- Lower stale window on \`edge-cache\`
- Apple Pay in \`checkout\`
- Seat changes are prorated

> Requests are up 8.6% on September.`

export const TABLE = `| Region | Requests | Share |
| --- | ---: | ---: |
| eu-west | 34.2M | 40% |
| us-east | 24.8M | 29% |
| ap-south | 12.1M | 14% |`

export const SNIPPET = `Add this to your project:

\`\`\`ts
export default { name: 'storefront' }
\`\`\``

export const COMMENT = `Looks good. Two things before we ship:

1. **Rename** the flag to \`use_edge_images\`
2. Add a test for the _empty cart_`
