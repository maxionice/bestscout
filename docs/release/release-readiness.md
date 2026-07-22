# Production release readiness

BestScout production releases start at `v1.0.0`. A tag is necessary but never
sufficient evidence that the product is ready.

The tag workflow runs this fail-closed preflight before installing build
dependencies:

```text
node scripts/verify-release-readiness.mjs \
  --tag=v1.0.0 \
  --require-complete
```

The verifier accepts only stable semantic versions with major version 1 or
newer. It reads the roadmap, feature-parity specification and every Markdown
record under `docs/acceptance`. Any unchecked task blocks publication and is
reported with its file and line. Code-fenced examples do not count as gates.

The workflow also resolves the tag to its commit and requires that commit to be
an ancestor of `origin/main`. This prevents a tag on an unmerged feature branch
from creating a production release. Complete acceptance records still need real
evidence: do not check a box merely to satisfy the script.

After this preflight, the existing workflow builds and validates every package,
generates checksums and OIDC/Sigstore provenance, independently verifies each
subject and only then changes the GitHub release from draft to published.
