# Collective Cognition SDK Package Stabilization — Design

**Date:** 2026-07-27

**Status:** Implemented and verified as the initial Phase 3 package-stabilization slice

## Problem

The repository is public and its TypeScript source is runnable on Node.js 24, but it is not yet consumable as a normal package. `package.json` has no build output, exports map, declaration entrypoint, package-content allowlist, or installed CLI contract. Consumers must import repository source files directly, so the current source API is not yet a verified distribution API.

The repository also has no license file. A public source repository is not automatically open source, so package publication must remain blocked until the owner selects a license and confirms the final package name.

## Decision

Phase 3 begins with a packaging-only stabilization slice:

1. compile `src/` into ESM JavaScript and declaration files under `dist/`;
2. expose one source-neutral package root and one `collective-cognition` executable;
3. package only explicit distribution artifacts and public documentation;
4. verify emitted imports, runtime exports, declarations, CLI behavior, and tarball contents;
5. retain `"private": true` as a publication guard.

This slice does not publish to npm, declare a stable 1.0 API, add persistence, expose source-specific connectors, or choose a license.

## Package Contract

The package manifest keeps:

- package name `collective-cognition-sdk`;
- version `0.1.0`;
- ESM mode through `"type": "module"`;
- Node.js `>=24`;
- zero production dependencies;
- `"private": true` until publication prerequisites are approved.

The distribution entrypoints are:

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./schemas/source-record/0.1.0": "./spec/schemas/0.1.0/source-record.schema.json",
    "./package.json": "./package.json"
  },
  "bin": {
    "collective-cognition": "./dist/cli.js"
  }
}
```

The root runtime exports remain exactly the current source-neutral API. Team-memory and Git connector modules remain absent from the package exports map. This is intentional encapsulation: a future maintained connector package or explicit subpath requires its own compatibility decision.

## Build Contract

`tsconfig.build.json` extends the development configuration and:

- sets `rootDir` to `src`;
- sets `outDir` to `dist`;
- enables JavaScript and declaration emit;
- rewrites relative `.ts` imports to `.js`;
- excludes tests, examples, and source-specific packaging outside `src`.

`dist/` is generated and ignored by Git. Emitted JavaScript and declarations must contain no relative `.ts` module specifiers. Source and declaration maps are not emitted because package source files are intentionally excluded and post-emit declaration rewriting would invalidate declaration mappings.

## Distribution Contents

The package allowlist contains only:

- `dist/`;
- `README.md`;
- `rfcs/README.md`;
- `rfcs/0001-universal-source-record-ingestion.md`;
- `spec/README.md`;
- `spec/source-record.md`;
- `spec/schemas/0.1.0/source-record.schema.json`;
- `spec/conformance/0.1.0/source-record/valid.jsonl`;
- `spec/conformance/0.1.0/source-record/invalid.jsonl`.

The versioned SourceRecord schema subpath and normative artifacts were added by the subsequent SourceRecord conformance slice without widening the source-neutral runtime root.

npm includes `package.json` automatically. The later licensing slice added the official Apache-2.0 `LICENSE`, project `NOTICE`, and `CITATION.cff` to the verified package allowlist. Source files, tests, examples, local reports, planning documents, databases, vaults, and connector credentials must not enter the tarball.

## CLI Contract

The emitted `dist/cli.js` retains the existing source-neutral CLI behavior and begins with `#!/usr/bin/env node`. Installing the package exposes `collective-cognition` through npm's `bin` mechanism. The shorter `cc` name is reserved by standard C compiler tooling and is not used as a public executable.

No team-memory-specific executable is included in this package slice.

## Verification

Package verification must prove:

1. the built root module imports successfully under Node.js;
2. built runtime exports exactly match the source-neutral runtime export list;
3. `dist/index.d.ts` and `dist/cli.js` exist;
4. emitted JavaScript and declarations contain no relative `.ts` imports;
5. the built CLI validates canonical SourceRecord input;
6. `npm pack --dry-run --json --ignore-scripts` exactly matches the package file allowlist and rejects any additional artifact;
7. the packed artifact installs into a clean temporary consumer, typechecks with default `exactOptionalPropertyTypes: false` and `skipLibCheck: false`, imports through the package name, and exposes a working installed `collective-cognition` executable;
8. normal source tests, type checks, examples, and conformance tests continue passing.

## Publication Gates

Removing `"private": true` is a separate consequential release decision. It requires:

- an explicitly selected license and committed `LICENSE` file — completed with Apache-2.0;
- confirmation that `collective-cognition-sdk` is the intended registry name or selection of a scoped alternative;
- a supported-runtime and security policy;
- reviewed package API and compatibility rules;
- a clean package verification result;
- explicit human approval to publish.

## Documentation Boundary

Public documentation describes the generic host, source-store, and cognition-store architecture. The reference operator's `team-cognition-agent`, `team-memory-agent`, member bundle transport, and deployment details remain private reference-application concerns and do not define package behavior.
