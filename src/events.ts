import type {
  AutomationMode,
  ConsequenceLevel,
  HumanConfirmation,
  TransitionActor,
  TransitionContext,
} from "./authorization.ts";
import { validateTransitionContext } from "./authorization.ts";
import type {
  CognitiveObject,
  ObjectType,
  ProvenanceRef,
  StateByType,
} from "./types.ts";

export interface CognitionEvent<T extends ObjectType = ObjectType> {
  readonly id: string;
  readonly type: `${Capitalize<T>}${string}`;
  readonly schemaVersion: "0.1.0";
  readonly objectId: string;
  readonly objectType: T;
  readonly objectVersion: number;
  readonly previousState: StateByType[T];
  readonly nextState: StateByType[T];
  readonly occurredAt: string;
  readonly contextId: string;
  readonly initiator: TransitionActor;
  readonly executor: TransitionActor;
  readonly accountableParty: TransitionActor;
  readonly automationMode: AutomationMode;
  readonly consequenceLevel: ConsequenceLevel;
  readonly rationale: string;
  readonly provenance: readonly ProvenanceRef[];
  readonly humanConfirmation?: HumanConfirmation;
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeDeep(child);
  }
  return Object.freeze(value);
}

function toEventType<T extends ObjectType>(
  objectType: T,
  targetState: StateByType[T],
): `${Capitalize<T>}${string}` {
  const formattedState = String(targetState)
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
  return `${objectType[0].toUpperCase()}${objectType.slice(1)}${formattedState}` as `${Capitalize<T>}${string}`;
}

export function createCognitionEvent<T extends ObjectType>(
  object: CognitiveObject<T>,
  previousState: StateByType[T],
  context: TransitionContext,
): CognitionEvent<T> {
  validateTransitionContext(context);

  const event: CognitionEvent<T> = {
    id: context.eventId,
    type: toEventType(object.type, object.state),
    schemaVersion: "0.1.0",
    objectId: object.id,
    objectType: object.type,
    objectVersion: object.version,
    previousState,
    nextState: object.state,
    occurredAt: context.occurredAt,
    contextId: object.contextId,
    initiator: context.initiator,
    executor: context.executor,
    accountableParty: context.accountableParty,
    automationMode: context.automationMode,
    consequenceLevel: context.consequenceLevel,
    rationale: context.rationale,
    provenance: object.provenance,
    ...(context.confirmation === undefined
      ? {}
      : { humanConfirmation: context.confirmation }),
  };

  return freezeDeep(structuredClone(event));
}
