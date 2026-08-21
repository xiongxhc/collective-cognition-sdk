# Cross-Connector Interoperability 0.1.0 Acceptance Evidence

## Ownership and Boundary

- **Owner:** `collective-cognition-sdk-maintainers`
- **Evidence type:** Maintainer-owned reference exchange evidence, not connector certification, production validation, endorsement, or an ecosystem-wide compatibility claim.
- **Source boundary:** The example creates one temporary root containing a fictional local Git repository and a fictional compatible SQLite event ledger. It does not discover or inspect user repositories, vaults, ledgers, services, or `team-memory-agent` state.
- **Lifecycle boundary:** The example closes the SQLite writer before collection and removes the complete temporary root in `finally`. The integration test invokes the exchange twice and observes that both roots are absent afterward, while the working directory and an external sentinel file remain unchanged.

## Verification Command

```sh
PATH=/Users/cx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  npm run --silent example:interoperability
```

Observed output:

```json
{"sourceRecordCount":2,"sourceSystems":["git-repository","teammem-event-ledger"],"acceptedRecordCount":2,"evidenceId":"evidence:promotion:sha256:232909c3ebfadf4bbdf07f4b780542e6f21739c132b85c343aba49bfa9fa5966","hypothesisId":"hypothesis:fictional-interoperability","portableRecordCount":5,"semanticRoundTrip":true,"decisionsInferred":0,"principlesInferred":0}
```

## Observed Exchange

- The maintained Git connector produced one `git-repository` SourceRecord.
- The maintained team-memory connector produced one `teammem-event-ledger` SourceRecord.
- Both records entered one `ingestSourceRecords([...gitRecords, ...teamMemoryRecords])` call; both were accepted.
- The caller explicitly created one Goal and one proposed Hypothesis.
- A source-neutral policy explicitly promoted both accepted records into one neutral Evidence object. Its provenance resolves to one record from each source system.
- The caller explicitly transitioned the Hypothesis to `under_review`, producing version 2 and one matching Cognition Event.
- Five Portable Cognition records were serialized and deserialized: Goal, original Hypothesis, Evidence, transitioned Hypothesis, and Cognition Event.
- Canonical semantic comparison matched for all five records.
- The caller-created Goal's unknown namespaced `example.invalid/connector-note` extension survived the round trip exactly and opaquely.

## Mismatch and Error Behavior

- A canonical mismatch does not return a partial success result: the example throws a fixed error and still removes its temporary root.
- Invalid or unsupported extension shapes remain governed by profile `0.1.0`: the Portable Cognition validator rejects them as `INVALID_PORTABLE_COGNITION_RECORD`; the exchange does not silently remove or reinterpret extension data.
- Connector and source-setup failures are propagated. Ingestion outcomes remain explicit, promotion receives only accepted records, and no cognition is persisted or published.

## Non-Inference and Migration

- Decisions inferred: `0`.
- Principles inferred: `0`.
- The exchange does not infer truth, confidence, readiness, organizational belief, or authorization.
- Persistence, Markdown projection, publication, scheduling, and live-source mutation are absent.
- Migrations for interoperability profile `0.1.0`: **none**.
