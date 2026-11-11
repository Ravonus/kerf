# Security

## Reporting a problem

Please report security problems privately, using GitHub's private advisories:

1. Go to the **Security** tab of this repository.
2. Choose **Report a vulnerability**.
3. Say what you found, how to reproduce it, and what it lets someone do.

Don't open a public issue or pull request for it, and please give us time to fix it before you talk about it publicly.

## What happens next

We aim to answer within a week. We'll confirm the problem, work on a fix with you in the private advisory, and credit you when
it's published, unless you'd rather not be named.

## What's supported

Kerf is young, so only the latest published version of each `@kerf/*` package gets security fixes.

## In scope

The packages in this repository, the compiler, and what `npm create kerf` generates. A problem in a dependency is in scope
if Kerf's use of it makes it exploitable. Otherwise, please report it to that project.
