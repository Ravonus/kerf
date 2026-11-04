#!/bin/bash
# Link every @weft-js package to .github/workflows/publish.yml (npm trusted publishing). Once per package, ever: after it,
# a pushed `v*` tag publishes with no token and no 2FA. npm asks for 2FA on each link; a rerun skips the linked ones.
# A brand-new package has to exist on npm before it can be linked: publish its first version by hand.
cd "$(dirname "$0")/.."
export NODE_OPTIONS=--dns-result-order=ipv4first # npm checks token IP ranges against IPv4
names=$(node -e "const fs=require('fs');for(const d of fs.readdirSync('packages')){try{const p=JSON.parse(fs.readFileSync('packages/'+d+'/package.json'));if(!p.private)console.log(p.name)}catch{}}"; echo @weft-js/compiler-darwin-arm64)
mkdir -p .release
for n in $names; do
  mark=.release/trust-${n//\//-}
  [ -f "$mark" ] && continue
  if npx -y npm@12 trust github "$n" --file publish.yml --repo Ravonus/weft --allow-publish -y; then touch "$mark"; echo "=== LINKED $n"
  else echo "=== STOPPED at $n: run bash scripts/trust.sh again"; exit 1; fi
done
echo "=== ALL LINKED. Release with: git tag v<version> && git push origin v<version>"
