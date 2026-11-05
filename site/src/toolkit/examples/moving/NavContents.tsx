import { Heading, Nav, Split, Stack, Text } from '@weft-js/warp'

export const NavContents = () => (
  <Split side="start" width="rail" gap="section">
    <Nav label="On this page" axis="y" spy>
      <a href="#toc-build">Build</a>
      <a href="#toc-deploy">Deploy</a>
      <a href="#toc-roll-back">Roll back</a>
    </Nav>
    <Stack gap="section">
      <Stack gap="tight">
        <Heading level={3} id="toc-build">
          Build
        </Heading>
        <Text subtle>
          Every push runs your build command in a clean machine. Dependencies are cached between
          runs, so the second build is much faster than the first.
        </Text>
      </Stack>
      <Stack gap="tight">
        <Heading level={3} id="toc-deploy">
          Deploy
        </Heading>
        <Text subtle>
          A finished build goes to each region in turn. New traffic moves over once the health check
          passes, and old requests are left to finish.
        </Text>
      </Stack>
      <Stack gap="tight">
        <Heading level={3} id="toc-roll-back">
          Roll back
        </Heading>
        <Text subtle>
          Every deploy stays ready to serve. Promote an older one and traffic moves back in about
          ten seconds, with no new build.
        </Text>
      </Stack>
    </Stack>
  </Split>
)
