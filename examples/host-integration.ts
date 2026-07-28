import {
  commitCognitionTransition,
  commitInitialCognition,
  createObject,
  createPortableCognitionRecord,
  transitionObject,
  type CognitionEventPublisher,
  type CognitionPublicationStatus,
  type PortableCognitionEventRecord,
  type PortableCognitiveObjectRecord,
  type TransitionCognitionCommit,
} from "collective-cognition-sdk";
import {
  InMemoryCognitionEventPublisher,
  InMemoryCognitionStore,
} from "collective-cognition-sdk/reference-host/0.1.0";

class FailFirstPublisher implements CognitionEventPublisher {
  #failed = false;
  readonly delegate: InMemoryCognitionEventPublisher;

  constructor(delegate = new InMemoryCognitionEventPublisher()) {
    this.delegate = delegate;
  }

  async publish(
    event: PortableCognitionEventRecord,
    options: { readonly idempotencyKey: string },
  ): Promise<CognitionPublicationStatus> {
    if (!this.#failed) {
      this.#failed = true;
      throw new Error("Example publisher fails its first call.");
    }
    return this.delegate.publish(event, options);
  }

  publishedEvents() {
    return this.delegate.publishedEvents();
  }
}

const createdAt = "2026-07-28T10:00:00.000Z";
const store = new InMemoryCognitionStore();
const publisher = new FailFirstPublisher();

const initialObject = createPortableCognitionRecord({
  schemaVersion: "0.1.0",
  recordType: "cognitive-object",
  payload: createObject({
    id: "goal:host-integration-example",
    type: "goal",
    version: 1,
    state: "draft",
    title: "Demonstrate host retry recovery",
    data: { objective: "Persist and publish one transition safely." },
    createdAt,
    updatedAt: createdAt,
    attribution: {
      initiatorId: "human:example-owner",
      executorId: "human:example-owner",
      accountableId: "human:example-owner",
    },
    provenance: [
      {
        source: "example",
        sourceId: "host-integration",
        capturedAt: createdAt,
      },
    ],
    contextId: "organization:example-team",
    relationships: [],
  }),
}) as PortableCognitiveObjectRecord;

const initial = await commitInitialCognition(store, { object: initialObject });
const transition = transitionObject(initialObject.payload, "active", {
  eventId: "event:host-integration-example-active",
  occurredAt: "2026-07-28T10:01:00.000Z",
  initiator: { id: "human:example-owner", kind: "human" },
  executor: { id: "human:example-owner", kind: "human" },
  accountableParty: { id: "human:example-owner", kind: "human" },
  automationMode: "manual",
  consequenceLevel: "routine",
  rationale: "Activate the host integration example.",
});
const request: TransitionCognitionCommit = {
  expectedVersion: initialObject.payload.version,
  object: createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognitive-object",
    payload: transition.object,
  }) as PortableCognitiveObjectRecord,
  event: createPortableCognitionRecord({
    schemaVersion: "0.1.0",
    recordType: "cognition-event",
    payload: transition.event,
  }) as PortableCognitionEventRecord,
};

const firstTransition = await commitCognitionTransition({ store, publisher }, request);
const retryTransition = await commitCognitionTransition({ store, publisher }, request);
const latest = await store.getLatestObject(initialObject.payload.id);
const storedEvents = await store.listObjectEvents(initialObject.payload.id);

console.log(JSON.stringify({
  initial: initial.status,
  firstTransition: firstTransition.status,
  retryTransition: retryTransition.status,
  latestVersion: latest?.payload.version,
  storedEventCount: storedEvents.length,
  publishedEventCount: publisher.publishedEvents().length,
}));
