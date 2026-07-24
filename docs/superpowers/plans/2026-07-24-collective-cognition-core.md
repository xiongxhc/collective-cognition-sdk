# Collective Cognition Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free TypeScript core that models a complete cognitive loop and imports team-memory-agent ledger rows as explicit, provenance-bearing evidence.

**Architecture:** The core is a deterministic, side-effect-free domain package built from immutable discriminated objects, lifecycle transition tables, an authorization gate, and event envelopes. A separate read-only adapter uses Node's built-in SQLite API to query team-memory-agent without changing its database or vault.

**Tech Stack:** Node.js 24+, native erasable TypeScript, `node:test`, `node:assert`, and `node:sqlite`.

## Global Constraints

- The core package has no production dependencies.
- Every successful transition returns a new object version and one event.
- Failed transitions return no object and emit no event.
- Agent output never satisfies a human-confirmation requirement.
- Team-memory-agent activity becomes neutral `Evidence`; it never becomes a `Decision` or `Principle` automatically.
- The team-memory adapter opens SQLite with `readOnly: true`.
- The personal vault at `/Users/cx/Dropbox/NOTES` is never read or written by runtime code.
- This session does not create git commits because the user did not request commits.

---

### Task 1: Package and Object Model

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/types.ts`
- Create: `src/errors.ts`
- Create: `src/objects.ts`
- Create: `src/index.ts`
- Create: `tests/objects.test.ts`

**Interfaces:**
- Produces: `createObject<T extends ObjectType>(input: CreateObjectInput<T>): CognitiveObject<T>`
- Produces: `serializeObject(object: CognitiveObject): string`
- Produces: `deserializeObject(json: string): CognitiveObject`
- Produces: `DomainError` with stable `DomainErrorCode`

- [ ] **Step 1: Write object creation tests**

Cover valid creation, positive version enforcement, ISO timestamps, required attribution/provenance, and required relationship cardinality. Assert that a hypothesis without a `supports-goal` relationship throws `DomainError` with code `INVALID_RELATIONSHIP`.

- [ ] **Step 2: Run the object tests and verify RED**

Run: `node --test tests/objects.test.ts`

Expected: FAIL because `src/index.ts` does not exist.

- [ ] **Step 3: Implement minimal shared and object types**

Define:

```ts
type ObjectType =
  | "identity" | "goal" | "hypothesis" | "experiment"
  | "evidence" | "decision" | "principle";

type ActorKind = "human" | "agent" | "team" | "organization";

interface Attribution {
  initiatorId: string;
  executorId: string;
  accountableId: string;
}

interface ProvenanceRef {
  source: string;
  sourceId: string;
  capturedAt: string;
  uri?: string;
  contentHash?: string;
}
```

Use mapped types for `StateByType` and `DataByType` so `state` and `data` remain discriminated by `type`. Define typed relationships and an immutable `CognitiveObject<T>`.

- [ ] **Step 4: Implement creation and serialization**

`createObject` validates non-empty IDs/context/title, version `1`, ISO timestamps, attribution IDs, at least one provenance reference, the initial state for each type, and required relationships. `deserializeObject` parses JSON and reuses the same validation path.

- [ ] **Step 5: Run object tests and verify GREEN**

Run: `node --test tests/objects.test.ts`

Expected: all object tests pass with zero warnings or failures.

### Task 2: Lifecycles, Authorization, and Events

**Files:**
- Create: `src/authorization.ts`
- Create: `src/events.ts`
- Create: `src/transitions.ts`
- Modify: `src/index.ts`
- Create: `tests/transitions.test.ts`
- Create: `tests/cognitive-loop.test.ts`

**Interfaces:**
- Consumes: `CognitiveObject<T>`, `StateByType[T]`, and `Attribution`
- Produces: `evaluateAuthorization(object, targetState, context): AuthorizationDecision`
- Produces: `transitionObject(object, targetState, context): TransitionResult`
- Produces: `CognitionEvent`

- [ ] **Step 1: Write transition tests**

Cover one legal and one illegal transition for each lifecycle, monotonic versions, object immutability, event envelope fields, confirmation-required transitions, and the rule that an agent cannot provide human confirmation.

- [ ] **Step 2: Run transition tests and verify RED**

Run: `node --test tests/transitions.test.ts tests/cognitive-loop.test.ts`

Expected: FAIL because transition exports do not exist.

- [ ] **Step 3: Implement lifecycle tables**

Use exact transition maps:

```ts
const transitions = {
  goal: { draft: ["active"], active: ["at_risk", "paused", "achieved", "abandoned", "revised"] },
  hypothesis: { proposed: ["under_review"], under_review: ["testing"], testing: ["supported", "refuted", "inconclusive"] },
  experiment: { planned: ["active", "cancelled"], active: ["completed", "cancelled"] },
  evidence: { collected: ["assessed"], assessed: ["accepted", "disputed", "rejected", "expired"] },
  decision: { draft: ["proposed"], proposed: ["approved", "rejected"], approved: ["active"], active: ["superseded"], superseded: ["archived"] },
  principle: { proposed: ["trial", "rejected"], trial: ["adopted", "rejected"], adopted: ["revised", "retired"] },
  identity: { active: ["inactive"], inactive: ["active"] }
} as const;
```

- [ ] **Step 4: Implement default authorization**

Return `confirmation_required` for consequential states from the design spec. Accept confirmation only when `confirmation.actorKind === "human"` and the transition context is not pretending an automated agent is that confirmer.

- [ ] **Step 5: Implement transition and event creation**

Validate the transition, evaluate authorization, clone the object with `version + 1`, preserve `createdAt`, update `updatedAt`, and return a matching event containing previous/next state, attribution, rationale, automation mode, confirmation marker, and schema version.

- [ ] **Step 6: Run transition tests and verify GREEN**

Run: `node --test tests/transitions.test.ts tests/cognitive-loop.test.ts`

Expected: all transition and cognitive-loop tests pass.

### Task 3: Team-Memory Ledger Adapter

**Files:**
- Create: `src/adapters/team-memory.ts`
- Create: `src/teammem-cli.ts`
- Modify: `src/index.ts`
- Create: `tests/team-memory.test.ts`

**Interfaces:**
- Produces: `readTeamMemoryEvents(options: TeamMemoryQuery): TeamMemoryEventRow[]`
- Produces: `teamMemoryEventToEvidence(row, context): CognitiveObject<"evidence">`
- Produces: CLI JSON Lines output for selected ledger rows

- [ ] **Step 1: Write adapter tests**

Create a temporary SQLite database with the exact team-memory-agent `events` columns. Assert read-only filtered queries, deterministic ordering, preservation of source/hash/refs, neutral evidence polarity, explicit hypothesis relationship, and failure on malformed `refs`.

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `node --test tests/team-memory.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement read-only querying**

Open with:

```ts
new DatabaseSync(dbPath, { open: true, readOnly: true });
```

Select only `id, person, project, ts, source, kind, summary, refs, raw, hash`. Build SQL filters from bound parameters for `from`, `to`, `person`, `project`, and `limit`; never interpolate user values.

- [ ] **Step 4: Implement evidence mapping**

Map each row to:

```ts
{
  id: `teammem:${encodeURIComponent(row.person)}:${encodeURIComponent(row.source)}:${encodeURIComponent(row.hash)}`,
  type: "evidence",
  state: "collected",
  data: {
    statement: row.summary,
    evidenceKind: row.kind,
    polarity: "neutral",
    sourceActorId: `person:${row.person}`,
    project: row.project
  }
}
```

The ID mirrors team-memory-agent's actual `UNIQUE(person, source, hash)` key while URL-encoding each segment to prevent delimiter collisions. Validate the row timestamp as ISO 8601, use it as `capturedAt`, keep `refs.url` as provenance URI when present, keep `hash` as `contentHash`, and link to the caller-supplied hypothesis.

- [ ] **Step 5: Implement the CLI**

Accept `--db`, `--hypothesis-id`, `--context-id`, optional filters, and `--limit`. Write one JSON object per line to stdout and diagnostics to stderr. Never mutate the source ledger.

- [ ] **Step 6: Run adapter tests and verify GREEN**

Run: `node --test tests/team-memory.test.ts`

Expected: all adapter tests pass.

### Task 4: Usable Examples and Roadmap

**Files:**
- Create: `examples/cognitive-loop.ts`
- Create: `examples/team-memory-evidence.ts`
- Create: `docs/ROADMAP.md`
- Create: `spec/README.md`
- Create: `rfcs/README.md`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: public exports from `src/index.ts`
- Produces: documented commands that run against fixtures or an existing team-memory-agent ledger

- [ ] **Step 1: Write the complete cognitive-loop example**

Create identities and one `Goal → Hypothesis → Experiment → Evidence → Decision → Principle` chain. Demonstrate a rejected unconfirmed decision approval followed by a human-confirmed approval.

- [ ] **Step 2: Write the team-memory example**

Read a ledger path from the first positional argument, import at most five rows into a named hypothesis, and print a concise count plus JSON evidence objects. Do not infer decisions from the rows.

- [ ] **Step 3: Write the tracked roadmap**

For each phase—runnable core, specification stabilization, Obsidian adapter, interoperability proof, governance/evolution, and real-team validation—state entry criteria, deliverables, acceptance checks, and deferred work.

- [ ] **Step 4: Document package usage**

Add exact commands:

```bash
npm test
npm run example
npm run example:teammem -- /path/to/team-memory-agent/ledger.db
npm run teammem:export -- --db /path/to/ledger.db --hypothesis-id hypothesis:delivery-risk --context-id organization:team
```

Document Node 24+, read-only ledger access, experimental `node:sqlite` warning behavior, semantic boundaries, and the untouched personal vault.

- [ ] **Step 5: Run examples**

Run: `npm run example`

Expected: prints the complete chain and successful event count.

Run: `npm run example:teammem -- /Users/cx/Workspace/local-agent-team/team-memory-agent/ledger.db`

Expected: reads at most five rows, prints evidence count, and performs no database writes.

### Task 5: Final Verification

**Files:**
- Verify all changed files

**Interfaces:**
- Consumes: complete repository
- Produces: fresh evidence that tests, examples, and team-memory compatibility work

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run syntax and package checks**

Run: `npm run check`

Expected: every source, test, and example file passes Node syntax checking.

- [ ] **Step 3: Run a read-only live-ledger smoke test**

Record the source ledger file size and modification timestamp, run the team-memory example, then record them again.

Expected: output imports evidence and the ledger size and modification timestamp remain unchanged.

- [ ] **Step 4: Check repository hygiene**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intentional project files are untracked or modified.
