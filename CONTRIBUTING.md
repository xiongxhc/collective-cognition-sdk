# Contributing

## Development setup

This experimental SDK requires Node 24. Install dependencies without lifecycle scripts:

```sh
npm ci --ignore-scripts
```

Before opening a pull request, run:

```sh
npm test
npx tsc --noEmit
npm run check
```

Use test-driven development (TDD): add or update a failing test first, make the smallest implementation change that passes it, then refactor only when the tests remain green.

## Changes and review

Use Conventional Commits and an intent-based branch name: `feature/`, `fix/`, `docs/`, `test/`, or `chore/`. Do not add `Co-Authored-By` trailers to commit messages.

Changes to semantics, public compatibility, normative artifacts, or deprecation behavior require RFC review under the [compatibility policy](spec/compatibility.md) and [RFC 0002](rfcs/0002-compatibility-versioning-and-deprecation.md). Update package baselines only for intentional contract changes; never rewrite historical baselines to make a check pass.

Keep examples, tests, and documentation aligned with the proposed behavior. Do not include secrets, live ledgers, vault data, personal data, or other private operational data in an issue, commit, pull request, or test fixture.
